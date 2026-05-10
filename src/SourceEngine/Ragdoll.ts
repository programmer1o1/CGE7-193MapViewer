// Minimal ragdoll on top of Jolt. One small dynamic sphere per bone, connected
// to its parent with a PointConstraint (ball joint). No swing/twist limits, no
// .phy data — joints are positioned from the model's bind pose.
//
// This is enough to make limbs flop under gravity and stay attached. A real
// Source-style ragdoll would parse .phy for capsule shapes and SwingTwist
// limits; that's deferred.

import { mat4, quat, ReadonlyVec3, vec3 } from 'gl-matrix';
import { calcBoneMatrix, calcWorldFromBone } from './Studio.js';
import type { StudioModelData } from './Studio.js';
import type { PhysicsSystem } from './Physics.js';
import type { PhyData } from './Phy.js';

// Capsule radius is approximated to match the visible limb thickness — this
// is what stops the rendered mesh from poking through the floor. Real Source
// ragdolls have per-bone radii from the .phy file; using one global value is a
// compromise that works OK for biped characters.
const BONE_RADIUS = 3.5;
const BONE_MASS = 2.0;
const RAGDOLL_LAYER = 1; // LAYER_MOVING

const scratchVec3a = vec3.create();
const scratchVec3b = vec3.create();
const scratchMat4a = mat4.create();

// Names of the bones that physically participate in a Valve-biped ragdoll. All
// other bones (eye, attachment, weapon, finger, etc.) follow their parent
// kinematically and don't get their own physics body.
const VALVE_BIPED_RAGDOLL_PARTS = [
    'pelvis', 'spine', 'neck', 'head',
    'clavicle', 'upperarm', 'forearm', 'hand',
    'thigh', 'calf', 'foot',
];

function isValveBipedRagdollBone(name: string): boolean {
    const lower = name.toLowerCase();
    if (!lower.includes('bip01'))
        return false;
    for (const part of VALVE_BIPED_RAGDOLL_PARTS)
        if (lower.endsWith('_' + part) || lower.endsWith(part))
            return true;
    return false;
}

// Bind world-from-bone pose, computed the same way the renderer does (through
// bone.rot, not bone.quat — those two fields can disagree and only the rot
// path matches what the studio mesh actually uses).
function computeBindWorldFromBone(modelData: StudioModelData, modelMatrix: mat4, outMatrices: mat4[]): void {
    const localBone: mat4[] = nArray(modelData.bone.length, () => mat4.create());
    calcBoneMatrix(localBone, modelData);
    calcWorldFromBone(outMatrices, localBone, modelMatrix, modelData);
}

// Extract the rotation portion of a column-major mat4 as a quaternion.
function quatFromMat4(out: quat, m: mat4): quat {
    const trace = m[0] + m[5] + m[10];
    if (trace > 0) {
        const s = 0.5 / Math.sqrt(trace + 1.0);
        out[3] = 0.25 / s;
        out[0] = (m[6] - m[9]) * s;
        out[1] = (m[8] - m[2]) * s;
        out[2] = (m[1] - m[4]) * s;
    } else if (m[0] > m[5] && m[0] > m[10]) {
        const s = 2.0 * Math.sqrt(1.0 + m[0] - m[5] - m[10]);
        out[3] = (m[6] - m[9]) / s;
        out[0] = 0.25 * s;
        out[1] = (m[4] + m[1]) / s;
        out[2] = (m[8] + m[2]) / s;
    } else if (m[5] > m[10]) {
        const s = 2.0 * Math.sqrt(1.0 + m[5] - m[0] - m[10]);
        out[3] = (m[8] - m[2]) / s;
        out[0] = (m[4] + m[1]) / s;
        out[1] = 0.25 * s;
        out[2] = (m[9] + m[6]) / s;
    } else {
        const s = 2.0 * Math.sqrt(1.0 + m[10] - m[0] - m[5]);
        out[3] = (m[1] - m[4]) / s;
        out[0] = (m[8] + m[2]) / s;
        out[1] = (m[9] + m[6]) / s;
        out[2] = 0.25 * s;
    }
    return out;
}

export class Ragdoll {
    // bodies[i] is the Jolt body for bone i, or null if bone i isn't physics-driven.
    public bodies: (any | null)[] = [];
    private constraints: any[] = [];
    private bindPosWorld: vec3[];
    private bindBoneInverse: mat4[];
    // Pre-computed local bind-pose matrices, used to drive non-physics bones from their parent each frame.
    private localBoneMatrix: mat4[];
    // For each bone: nearest ancestor that has a physics body, or -1 if root.
    private nearestPhysicsAncestor: number[] = [];

    // Capsule + wrapper shapes referenced by bodies. Held for the ragdoll's lifetime
    // so the wrapper's internal references to inner shapes never dangle.
    private retainedShapes: any[] = [];
    // Manual sleep state — per-bone last position, accumulated still time.
    private lastBodyPos: vec3[];
    private stillSeconds: number = 0;
    private frozen: boolean = false;
    // Inches per second of LINEAR motion. We ignore angular velocity here so
    // a head bone rotating in place against its joint limit doesn't keep the
    // whole ragdoll awake. Active ragdolls translate at >100 in/s during a
    // fall, so 30 is well clear of that.
    private static readonly STILL_VELOCITY_THRESHOLD = 30;
    // Seconds of continuous stillness before we hard-freeze the ragdoll.
    private static readonly FREEZE_DELAY = 0.6;

    constructor(public physics: PhysicsSystem, public modelData: StudioModelData, private modelMatrix: mat4) {
        const jolt = (physics.jolt as any);

        const numBones = modelData.bone.length;
        this.bindPosWorld = nArray(numBones, () => vec3.create());
        this.bindBoneInverse = nArray(numBones, () => mat4.create());
        this.localBoneMatrix = nArray(numBones, () => mat4.create());
        this.lastBodyPos = nArray(numBones, () => vec3.create());
        calcBoneMatrix(this.localBoneMatrix, modelData);

        // Decide which bones get a body. PHY (when present) lists the artist's
        // intended physics bones explicitly; without it fall back to the
        // ValveBiped name heuristic.
        const phy: PhyData | null = modelData.phy;
        const isPhysics: boolean[] = nArrayBool(numBones, false);
        const modelBoneToPhysSolid = new Map<number, number>();

        if (phy !== null && phy.solids.length > 0) {
            const nameToBone = new Map<string, number>();
            for (let i = 0; i < numBones; i++)
                nameToBone.set(modelData.bone[i].name.toLowerCase(), i);
            for (let s = 0; s < phy.solids.length; s++) {
                const solid = phy.solids[s];
                const idx = nameToBone.get(solid.name.toLowerCase());
                if (idx !== undefined) {
                    isPhysics[idx] = true;
                    modelBoneToPhysSolid.set(idx, s);
                }
            }
        }
        // If PHY didn't yield anything usable, fall back to name heuristic.
        if (!isPhysics.some(x => x))
            for (let i = 0; i < numBones; i++)
                isPhysics[i] = isValveBipedRagdollBone(modelData.bone[i].name);

        for (let i = 0; i < numBones; i++) {
            const parent = modelData.bone[i].parent;
            this.nearestPhysicsAncestor[i] = (parent < 0)
                ? -1
                : (isPhysics[parent] ? parent : this.nearestPhysicsAncestor[parent]);
        }

        // Group filter so the ragdoll's own bodies don't push each other apart.
        const physicsCount = isPhysics.filter(x => x).length;
        const groupFilter = new jolt.GroupFilterTable(Math.max(physicsCount, 1));
        for (let i = 0; i < physicsCount; i++)
            for (let j = i + 1; j < physicsCount; j++)
                groupFilter.DisableCollision(i, j);
        const ragdollGroupID = (Math.random() * 0x7fffffff) | 0;
        let physicsSlot = 0;

        // World-space bind pose for every bone. Translation = constraint anchor,
        // rotation = body's initial orientation so the renderer's delta-from-bind
        // is identity at t=0.
        const bindWorldFromBone: mat4[] = nArray(numBones, () => mat4.create());
        computeBindWorldFromBone(modelData, modelMatrix, bindWorldFromBone);

        const bindRotWorld: quat[] = nArray(numBones, () => quat.create());
        for (let i = 0; i < numBones; i++) {
            const m = bindWorldFromBone[i];
            this.bindPosWorld[i][0] = m[12];
            this.bindPosWorld[i][1] = m[13];
            this.bindPosWorld[i][2] = m[14];
            quatFromMat4(bindRotWorld[i], m);
        }

        // Find each physics bone's primary physics-bone child.
        const primaryChild: number[] = nArrayNum(numBones, -1);
        for (let i = 0; i < numBones; i++) {
            if (!isPhysics[i]) continue;
            const parent = modelData.bone[i].parent;
            if (parent >= 0 && isPhysics[parent] && primaryChild[parent] === -1)
                primaryChild[parent] = i;
        }

        // Pre-build shapes per bone — capsule when we have a clean bone-to-child
        // direction, sphere fallback otherwise. Shapes live in retainedShapes
        // for the ragdoll's lifetime so wrapper references don't dangle.
        const keepShapes = this.retainedShapes;
        const fallbackSphere = new jolt.SphereShape(BONE_RADIUS, undefined);
        keepShapes.push(fallbackSphere);

        const buildBoneShape = (i: number): any => {
            const child = primaryChild[i];
            if (child < 0) return fallbackSphere;
            const p = this.bindPosWorld[i];
            const cp = this.bindPosWorld[child];
            const wx = cp[0] - p[0], wy = cp[1] - p[1], wz = cp[2] - p[2];
            const len = Math.hypot(wx, wy, wz);
            if (!Number.isFinite(len) || len < 1.0)
                return fallbackSphere;
            const halfLen = len * 0.5;

            const r = bindRotWorld[i];
            if (!isFiniteQuat(r))
                return fallbackSphere;
            // World bone direction -> body-local Source -> Jolt
            const bindInv = quat.create();
            quat.invert(bindInv, r);
            if (!isFiniteQuat(bindInv))
                return fallbackSphere;
            const localDirSrc = vec3.fromValues(wx / len, wy / len, wz / len);
            vec3.transformQuat(localDirSrc, localDirSrc, bindInv);
            const lx = localDirSrc[0], ly = localDirSrc[2], lz = -localDirSrc[1];
            const dirLen2 = lx * lx + ly * ly + lz * lz;
            if (!Number.isFinite(dirLen2) || dirLen2 < 0.5)
                return fallbackSphere;

            // Rotation: align Jolt-up (0,1,0) with localDir in body-local Jolt.
            const dirJolt = vec3.fromValues(lx, ly, lz);
            const cqOut = quat.create();
            quat.rotationTo(cqOut, [0, 1, 0], dirJolt);
            quat.normalize(cqOut, cqOut);
            if (!isFiniteQuat(cqOut))
                return fallbackSphere;

            try {
                const cap = new jolt.CapsuleShape(halfLen, BONE_RADIUS, undefined);
                const offsetPos = new jolt.Vec3(lx * halfLen, ly * halfLen, lz * halfLen);
                const offsetRot = new jolt.Quat(cqOut[0], cqOut[1], cqOut[2], cqOut[3]);
                const wrapSettings = new jolt.RotatedTranslatedShapeSettings(offsetPos, offsetRot, cap);
                const result = wrapSettings.Create();
                if (!result.IsValid()) {
                    jolt.destroy(wrapSettings);
                    jolt.destroy(offsetPos);
                    jolt.destroy(offsetRot);
                    return fallbackSphere;
                }
                const wrapped = result.Get();
                jolt.destroy(wrapSettings);
                jolt.destroy(offsetPos);
                jolt.destroy(offsetRot);
                keepShapes.push(cap, wrapped);
                return wrapped;
            } catch (e) {
                console.warn('Ragdoll: capsule shape failed for bone', modelData.bone[i].name, e);
                return fallbackSphere;
            }
        };

        for (let i = 0; i < numBones; i++) {
            if (!isPhysics[i]) {
                this.bodies.push(null);
                continue;
            }
            const shape = buildBoneShape(i);
            const p = this.bindPosWorld[i];
            const r = bindRotWorld[i];
            const pos = new jolt.RVec3(p[0], p[2], -p[1]);
            const rot = new jolt.Quat(r[0], r[2], -r[1], r[3]);
            const bcs = new jolt.BodyCreationSettings(shape, pos, rot, jolt.EMotionType_Dynamic, RAGDOLL_LAYER);
            bcs.mMotionQuality = jolt.EMotionQuality_LinearCast;
            // Higher linear damping bleeds residual motion at rest so bodies
            // can drop below the sleep threshold instead of skating around.
            bcs.mLinearDamping = 0.5;
            bcs.mAngularDamping = 0.9;
            // Clamp peak velocities so a single bad penetration impulse can't
            // shoot a bone across the level and cascade through the constraint
            // chain. Source units are inches.
            bcs.mMaxLinearVelocity = 300;
            bcs.mMaxAngularVelocity = 30;
            const cg = new jolt.CollisionGroup(groupFilter, ragdollGroupID, physicsSlot++);
            bcs.mCollisionGroup = cg;
            jolt.destroy(cg);
            const massProps = bcs.GetMassProperties();
            massProps.mMass = BONE_MASS;
            bcs.mOverrideMassProperties = jolt.EOverrideMassProperties_CalculateInertia;
            bcs.mMassPropertiesOverride = massProps;

            const body = physics.bodyInterface.CreateBody(bcs);
            jolt.destroy(bcs);
            jolt.destroy(pos);
            jolt.destroy(rot);

            physics.bodyInterface.AddBody(body.GetID(), jolt.EActivation_Activate);
            this.bodies.push(body);
            // Save bind-pose so the global "disable physics" reset returns
            // each bone to its A-pose position.
            physics.recordSpawnTransform(body, p, r);
        }

        // 2) Build PHY-driven swing/twist constraints when available, otherwise
        //    fall back to ball joints.
        const phyConstraintByChildBone = new Map<number, { parentBone: number; xMin: number; xMax: number; yMin: number; yMax: number; zMin: number; zMax: number; }>();
        if (phy !== null && phy.constraints.length > 0) {
            const physSolidToBone: number[] = nArrayNum(phy.solids.length, -1);
            for (const [boneIdx, solidIdx] of modelBoneToPhysSolid)
                physSolidToBone[solidIdx] = boneIdx;
            for (const c of phy.constraints) {
                const parentBone = physSolidToBone[c.parentPhysBone];
                const childBone = physSolidToBone[c.childPhysBone];
                if (parentBone < 0 || childBone < 0)
                    continue;
                phyConstraintByChildBone.set(childBone, {
                    parentBone,
                    xMin: c.xMin, xMax: c.xMax,
                    yMin: c.yMin, yMax: c.yMax,
                    zMin: c.zMin, zMax: c.zMax,
                });
            }
        }

        const DEG = Math.PI / 180;
        let phyConstraintCount = 0;
        let pointConstraintCount = 0;

        for (let i = 0; i < numBones; i++) {
            if (!isPhysics[i])
                continue;
            // Prefer the parent named in the PHY file — the artist's intended
            // joint topology may skip intermediate hierarchy bones (pelvis ->
            // thigh directly even if the hierarchy goes pelvis -> spine ->
            // thigh). Fall back to the nearest physics ancestor for joints PHY
            // doesn't define.
            const phyEntry = phyConstraintByChildBone.get(i);
            const parentBoneIdx = phyEntry !== undefined ? phyEntry.parentBone : this.nearestPhysicsAncestor[i];
            if (parentBoneIdx < 0 || this.bodies[parentBoneIdx] === null)
                continue;
            const parentBody = this.bodies[parentBoneIdx]!;
            const childBody = this.bodies[i]!;
            const p = this.bindPosWorld[i];
            const pParent = this.bindPosWorld[parentBoneIdx];
            let constraint: any = null;

            // Twist axis = bind direction from parent pivot toward child pivot.
            // Co-located pivots (parent_pos == child_pos) give a degenerate
            // axis; in that case skip SwingTwist and use a point joint.
            const tx = p[0] - pParent[0], ty = p[1] - pParent[1], tz = p[2] - pParent[2];
            const tlen = Math.hypot(tx, ty, tz);
            const canUseSwingTwist = phyEntry !== undefined && tlen > 0.001;

            if (canUseSwingTwist) {
                const txn = tx / tlen, tyn = ty / tlen, tzn = tz / tlen;
                let upx = 0, upy = 0, upz = 1;
                if (Math.abs(tzn) > 0.95) { upx = 0; upy = 1; upz = 0; }
                // plane = up - twist*(twist.up); then normalize
                const dot = txn * upx + tyn * upy + tzn * upz;
                let pxn = upx - txn * dot, pyn = upy - tyn * dot, pzn = upz - tzn * dot;
                const plen = Math.hypot(pxn, pyn, pzn) || 1;
                pxn /= plen; pyn /= plen; pzn /= plen;

                // Symmetric cone for asymmetric Source ranges (matches vphysics-jolt).
                const symCone = (lo: number, hi: number) => Math.max(Math.abs(lo), Math.abs(hi)) * DEG;

                const settings = new jolt.SwingTwistConstraintSettings();
                settings.set_mSpace(jolt.EConstraintSpace_WorldSpace);
                const pos1 = new jolt.RVec3(p[0], p[2], -p[1]);
                const pos2 = new jolt.RVec3(p[0], p[2], -p[1]);
                const twist1 = new jolt.Vec3(txn, tzn, -tyn);
                const twist2 = new jolt.Vec3(txn, tzn, -tyn);
                const plane1 = new jolt.Vec3(pxn, pzn, -pyn);
                const plane2 = new jolt.Vec3(pxn, pzn, -pyn);
                settings.set_mPosition1(pos1);
                settings.set_mPosition2(pos2);
                settings.set_mTwistAxis1(twist1);
                settings.set_mTwistAxis2(twist2);
                settings.set_mPlaneAxis1(plane1);
                settings.set_mPlaneAxis2(plane2);
                settings.set_mTwistMinAngle(phyEntry!.xMin * DEG);
                settings.set_mTwistMaxAngle(phyEntry!.xMax * DEG);
                settings.set_mPlaneHalfConeAngle(symCone(phyEntry!.yMin, phyEntry!.yMax));
                settings.set_mNormalHalfConeAngle(symCone(phyEntry!.zMin, phyEntry!.zMax));
                // Passive joint friction — bleeds off micro-oscillations in
                // the constraint solver so the ragdoll actually settles.
                settings.set_mMaxFrictionTorque(50);

                constraint = settings.Create(parentBody, childBody);
                jolt.destroy(settings);
                jolt.destroy(pos1); jolt.destroy(pos2);
                jolt.destroy(twist1); jolt.destroy(twist2);
                jolt.destroy(plane1); jolt.destroy(plane2);
                if (constraint !== null) phyConstraintCount++;
            }

            if (constraint === null) {
                const settings = new jolt.PointConstraintSettings();
                settings.set_mSpace(jolt.EConstraintSpace_WorldSpace);
                const anchor1 = new jolt.RVec3(p[0], p[2], -p[1]);
                const anchor2 = new jolt.RVec3(p[0], p[2], -p[1]);
                settings.set_mPoint1(anchor1);
                settings.set_mPoint2(anchor2);
                constraint = settings.Create(parentBody, childBody);
                jolt.destroy(settings);
                jolt.destroy(anchor1); jolt.destroy(anchor2);
                if (constraint !== null) pointConstraintCount++;
            }

            if (constraint !== null) {
                physics.physicsSystem.AddConstraint(constraint);
                this.constraints.push(constraint);
            }
        }
        console.log(`Ragdoll: ${physicsCount} physics bones / ${numBones} total, ${phyConstraintCount} swing-twist + ${pointConstraintCount} point constraints (PHY: ${phy ? 'yes' : 'no'})`);
    }

    // Write each body's world transform into the corresponding bone matrix on
    // the studio instance. The renderer multiplies by `poseToBone`, which
    // already accounts for bind-pose offsets, so we hand it a true world
    // transform per bone.
    // Drive the manual sleep state. Once the ragdoll has been mostly still for
    // FREEZE_DELAY seconds, deactivate every body so it can't jitter further.
    public update(deltaTime: number): void {
        if (this.frozen || deltaTime <= 0)
            return;

        // Linear-velocity only — angular velocity at a joint limit can be
        // chronically non-zero without the body actually translating. We want
        // "is the ragdoll going somewhere," not "is anything moving at all."
        let maxSpeedSq = 0;
        for (let i = 0; i < this.bodies.length; i++) {
            const body = this.bodies[i];
            if (body === null)
                continue;
            const lv = body.GetLinearVelocity();
            const lx = lv.GetX(), ly = lv.GetY(), lz = lv.GetZ();
            const linSq = lx * lx + ly * ly + lz * lz;
            if (linSq > maxSpeedSq) maxSpeedSq = linSq;
        }

        const threshold = Ragdoll.STILL_VELOCITY_THRESHOLD;
        if (maxSpeedSq < threshold * threshold) {
            this.stillSeconds += deltaTime;
            if (this.stillSeconds >= Ragdoll.FREEZE_DELAY)
                this.freeze();
        } else {
            this.stillSeconds = 0;
        }
    }

    private freeze(): void {
        if (this.frozen) return;
        this.frozen = true;
        const jolt = this.physics.jolt as any;

        // Remove every constraint first so they can't re-apply corrective
        // impulses to the bodies and wake them back up.
        for (const constraint of this.constraints)
            this.physics.physicsSystem.RemoveConstraint(constraint);
        this.constraints.length = 0;

        // Demote each body to static. Static bodies don't simulate at all —
        // no jitter, no integration, no constraint solving. The pose is locked
        // in whatever it ended up at the moment of freeze.
        for (let i = 0; i < this.bodies.length; i++) {
            const body = this.bodies[i];
            if (body === null) continue;
            this.physics.bodyInterface.SetMotionType(
                body.GetID(),
                jolt.EMotionType_Static,
                jolt.EActivation_DontActivate
            );
        }
    }

    public syncToBoneMatrices(worldFromBoneMatrix: mat4[]): void {
        for (let i = 0; i < this.bodies.length; i++) {
            const m = worldFromBoneMatrix[i];
            const body = this.bodies[i];
            const bone = this.modelData.bone[i];

            if (body !== null) {
                // Physics-driven bone: copy body's world transform.
                const t = body.GetPosition();
                const q = body.GetRotation();
                const px = t.GetX(), py = t.GetY(), pz = t.GetZ();
                const qx = q.GetX(), qy = q.GetY(), qz = q.GetZ(), qw = q.GetW();

                const sx = px, sy = -pz, sz = py;
                const sqx = qx, sqy = -qz, sqz = qy, sqw = qw;

                const x2 = sqx + sqx, y2 = sqy + sqy, z2 = sqz + sqz;
                const xx = sqx * x2, xy = sqx * y2, xz = sqx * z2;
                const yy = sqy * y2, yz = sqy * z2, zz = sqz * z2;
                const wx = sqw * x2, wy = sqw * y2, wz = sqw * z2;

                m[0]  = 1 - (yy + zz);
                m[1]  = xy + wz;
                m[2]  = xz - wy;
                m[3]  = 0;
                m[4]  = xy - wz;
                m[5]  = 1 - (xx + zz);
                m[6]  = yz + wx;
                m[7]  = 0;
                m[8]  = xz + wy;
                m[9]  = yz - wx;
                m[10] = 1 - (xx + yy);
                m[11] = 0;
                m[12] = sx;
                m[13] = sy;
                m[14] = sz;
                m[15] = 1;
            } else {
                // Non-physics bone: drive from parent's current world transform
                // and the bind-pose local matrix. Bones come in dependency order
                // so the parent has already been written this frame.
                const parentMat = bone.parent >= 0 ? worldFromBoneMatrix[bone.parent] : this.modelMatrix;
                mat4.mul(m, parentMat, this.localBoneMatrix[i]);
            }
        }
    }

    // Compute a world-space AABB enclosing every body. Used to keep the studio
    // model from getting frustum-culled when limbs splay outside its bind viewBB.
    public computeWorldBounds(outMin: vec3, outMax: vec3): void {
        let first = true;
        for (let i = 0; i < this.bodies.length; i++) {
            const body = this.bodies[i];
            if (body === null)
                continue;
            const t = body.GetPosition();
            const x = t.GetX(), y = -t.GetZ(), z = t.GetY();
            if (first) {
                outMin[0] = x; outMin[1] = y; outMin[2] = z;
                outMax[0] = x; outMax[1] = y; outMax[2] = z;
                first = false;
            } else {
                if (x < outMin[0]) outMin[0] = x; if (x > outMax[0]) outMax[0] = x;
                if (y < outMin[1]) outMin[1] = y; if (y > outMax[1]) outMax[1] = y;
                if (z < outMin[2]) outMin[2] = z; if (z > outMax[2]) outMax[2] = z;
            }
        }
        const pad = 16;
        outMin[0] -= pad; outMin[1] -= pad; outMin[2] -= pad;
        outMax[0] += pad; outMax[1] += pad; outMax[2] += pad;
    }

    public destroy(): void {
        const jolt = this.physics.jolt as any;
        for (const constraint of this.constraints)
            this.physics.physicsSystem.RemoveConstraint(constraint);
        this.constraints.length = 0;
        for (const body of this.bodies) {
            if (body === null)
                continue;
            const id = body.GetID();
            this.physics.bodyInterface.RemoveBody(id);
            this.physics.bodyInterface.DestroyBody(id);
        }
        this.bodies.length = 0;
        for (const shape of this.retainedShapes)
            jolt.destroy(shape);
        this.retainedShapes.length = 0;
    }
}

function isFiniteQuat(q: quat): boolean {
    return Number.isFinite(q[0]) && Number.isFinite(q[1]) && Number.isFinite(q[2]) && Number.isFinite(q[3]);
}

function nArray<T>(n: number, factory: () => T): T[] {
    const arr: T[] = [];
    for (let i = 0; i < n; i++)
        arr.push(factory());
    return arr;
}

function nArrayBool(n: number, fill: boolean): boolean[] {
    const arr: boolean[] = [];
    for (let i = 0; i < n; i++)
        arr.push(fill);
    return arr;
}

function nArrayNum(n: number, fill: number): number[] {
    const arr: number[] = [];
    for (let i = 0; i < n; i++)
        arr.push(fill);
    return arr;
}
