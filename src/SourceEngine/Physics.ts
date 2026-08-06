// Source-style physics on top of Jolt (jolt-physics WASM).
//
// Architecture mirrors vphysics-jolt but slimmed to what a map viewer needs:
// - Single PhysicsSystem (JPH::PhysicsSystem) per BSP.
// - Source <-> Jolt coordinate conversion: Source (X, Y, Z) <-> Jolt (X, Z, -Y).
//   See vphysics-jolt/jolt_interface.h.
// - Gravity = 600 in/s^2 along -Y in Jolt space (Source's gravity in inches).
//
// MVP scope: static world mesh + dynamic box bodies for prop_physics.
// .phy collision parsing, ragdolls, fluids, constraints come later.
//
// Init is async (WASM); callers should await `initPhysicsModule()` once at
// startup. Per-BSP environments are constructed synchronously after that.

import JoltInit from 'jolt-physics/wasm-compat';
import type Jolt from 'jolt-physics';
import { mat4, quat, ReadonlyMat4, ReadonlyVec3, vec3 } from 'gl-matrix';

let JoltModule: typeof Jolt | null = null;
let joltInitPromise: Promise<typeof Jolt> | null = null;

export function initPhysicsModule(): Promise<typeof Jolt> {
    if (joltInitPromise === null) {
        joltInitPromise = JoltInit().then((m) => {
            JoltModule = m;
            return m;
        });
    }
    return joltInitPromise;
}

export function getJolt(): typeof Jolt | null {
    return JoltModule;
}

// Object layers (mirrors examples/Layer.h in JoltPhysics).
const LAYER_NON_MOVING = 0;
const LAYER_MOVING = 1;
const NUM_OBJECT_LAYERS = 2;

const BP_LAYER_NON_MOVING = 0;
const BP_LAYER_MOVING = 1;
const NUM_BP_LAYERS = 2;

// Source: (X right, Y forward, Z up) — inches, Z-up
// Jolt:   (X right, Y up, Z back)    — inches, Y-up
// Mapping: Source (x, y, z) -> Jolt (x, z, -y) and back.
export function sourceToJolt(out: Float32Array, src: ReadonlyVec3): Float32Array {
    out[0] = src[0];
    out[1] = src[2];
    out[2] = -src[1];
    return out;
}

export function joltToSourceVec3(out: vec3, x: number, y: number, z: number): vec3 {
    out[0] = x;
    out[1] = -z;
    out[2] = y;
    return out;
}

// Quaternion: same axis swap. (x, y, z, w) Source -> (x, z, -y, w) Jolt.
export function sourceQuatToJolt(out: Float32Array, src: quat): Float32Array {
    out[0] = src[0];
    out[1] = src[2];
    out[2] = -src[1];
    out[3] = src[3];
    return out;
}

export function joltQuatToSource(out: quat, x: number, y: number, z: number, w: number): quat {
    out[0] = x;
    out[1] = -z;
    out[2] = y;
    out[3] = w;
    return out;
}

const SOURCE_GRAVITY_INCHES = 600.0;

// Convert a Source QAngle (pitch, yaw, roll in degrees, YXZ order) to a
// quaternion in Source space.
export function qangleToQuat(out: quat, anglesDegrees: ReadonlyVec3): quat {
    const halfPitch = anglesDegrees[0] * Math.PI / 360;
    const halfYaw   = anglesDegrees[1] * Math.PI / 360;
    const halfRoll  = anglesDegrees[2] * Math.PI / 360;
    const sp = Math.sin(halfPitch), cp = Math.cos(halfPitch);
    const sy = Math.sin(halfYaw),   cy = Math.cos(halfYaw);
    const sr = Math.sin(halfRoll),  cr = Math.cos(halfRoll);
    out[0] = cy * cp * sr - sy * sp * cr;
    out[1] = sy * cp * sr + cy * sp * cr;
    out[2] = sy * cp * cr - cy * sp * sr;
    out[3] = cy * cp * cr + sy * sp * sr;
    return out;
}

export class PhysicsSystem {
    public jolt: typeof Jolt;
    public physicsSystem: any /* JPH::PhysicsSystem */;
    public bodyInterface: any /* JPH::BodyInterface */;
    private joltInterface: any /* JPH::JoltInterface */;
    private trackedBodies: Set<any> = new Set();
    // Per-body spawn transform so we can reset every dynamic body to its
    // original pose when physics is toggled off.
    private spawnTransforms = new Map<any, { px: number; py: number; pz: number; qx: number; qy: number; qz: number; qw: number; }>();
    public enabled: boolean = true;

    // Fixed timestep + accumulator. Mirrors vphysics-jolt's CPhysicsEnvironment.
    private static readonly FIXED_TIMESTEP = 1 / 60;
    private static readonly COLLISION_SUB_STEPS = 4;
    private accumulator = 0;

    constructor(jolt: typeof Jolt) {
        this.jolt = jolt;

        const J = jolt as any;
        const settings = new J.JoltSettings();
        settings.mMaxBodies = 8192;
        settings.mMaxBodyPairs = 16384;
        settings.mMaxContactConstraints = 4096;

        // Object layer pair filter: only NON_MOVING <-> MOVING and MOVING <-> MOVING.
        const objLayerPairFilter = new J.ObjectLayerPairFilterTable(NUM_OBJECT_LAYERS);
        objLayerPairFilter.EnableCollision(LAYER_NON_MOVING, LAYER_MOVING);
        objLayerPairFilter.EnableCollision(LAYER_MOVING, LAYER_MOVING);

        // Broad-phase layer mapping (object layer -> broad-phase layer).
        const bpLayerInterface = new J.BroadPhaseLayerInterfaceTable(NUM_OBJECT_LAYERS, NUM_BP_LAYERS);
        bpLayerInterface.MapObjectToBroadPhaseLayer(LAYER_NON_MOVING, BP_LAYER_NON_MOVING);
        bpLayerInterface.MapObjectToBroadPhaseLayer(LAYER_MOVING, BP_LAYER_MOVING);

        const objVsBpFilter = new J.ObjectVsBroadPhaseLayerFilterTable(
            bpLayerInterface, NUM_BP_LAYERS,
            objLayerPairFilter, NUM_OBJECT_LAYERS
        );

        settings.mObjectLayerPairFilter = objLayerPairFilter;
        settings.mBroadPhaseLayerInterface = bpLayerInterface;
        settings.mObjectVsBroadPhaseLayerFilter = objVsBpFilter;

        this.joltInterface = new J.JoltInterface(settings);
        J.destroy(settings);
        this.physicsSystem = this.joltInterface.GetPhysicsSystem();
        this.bodyInterface = this.physicsSystem.GetBodyInterface();

        const gravity = new (jolt as any).Vec3(0, -SOURCE_GRAVITY_INCHES, 0);
        this.physicsSystem.SetGravity(gravity);
        (jolt as any).destroy(gravity);

        // Default sleep threshold is tuned for SI units (m/s). Source uses
        // inches, so the equivalent comfortable threshold is ~5 in/s — without
        // this, ragdoll constraints constantly nudge bodies just enough to
        // keep them from ever sleeping, producing the at-rest jitter.
        const physicsSettings = this.physicsSystem.GetPhysicsSettings();
        physicsSettings.set_mPointVelocitySleepThreshold(5);
        physicsSettings.set_mTimeBeforeSleep(0.4);
        this.physicsSystem.SetPhysicsSettings(physicsSettings);
    }

    public step(deltaTime: number): void {
        if (deltaTime <= 0 || !this.enabled)
            return;
        // Clamp big jumps (tab-out, slow loads) so the accumulator doesn't run
        // away after a stall.
        this.accumulator += Math.min(deltaTime, 0.25);
        const dt = PhysicsSystem.FIXED_TIMESTEP;
        const subSteps = PhysicsSystem.COLLISION_SUB_STEPS;
        let safety = 8; // hard cap iterations per real frame so we never spiral.
        while (this.accumulator >= dt && safety-- > 0) {
            this.joltInterface.Step(dt, subSteps);
            this.accumulator -= dt;
        }
    }

    // Build a static MeshShape body from a contiguous slice of indices.
    // `vertexStrideFloats` is the number of floats per vertex (positions live at the
    // start of the stride). The mesh is positioned by `worldTransform` (Source-space
    // mat4); pass null for the identity. Caller may pass a sub-range of indices to
    // include just one model's faces.
    public addStaticMeshSlice(
        vertexData: Float32Array,
        vertexStrideFloats: number,
        indexData: Uint32Array,
        indexStart: number,
        indexCount: number,
        worldTransform: mat4 | null,
    ): any | null {
        // Wraps addStaticMesh by extracting just this slice and pre-transforming verts.
        // Build a compact vertex/index sub-buffer that only references the touched verts.
        if (indexCount === 0)
            return null;

        const usedMap = new Map<number, number>();
        const newIndices = new Uint32Array(indexCount);
        const positions: number[] = [];

        const tmp = vec3.create();
        for (let i = 0; i < indexCount; i++) {
            const srcIdx = indexData[indexStart + i];
            let mapped = usedMap.get(srcIdx);
            if (mapped === undefined) {
                mapped = positions.length / 3;
                usedMap.set(srcIdx, mapped);

                const o = srcIdx * vertexStrideFloats;
                tmp[0] = vertexData[o + 0];
                tmp[1] = vertexData[o + 1];
                tmp[2] = vertexData[o + 2];
                if (worldTransform !== null)
                    vec3.transformMat4(tmp, tmp, worldTransform);

                positions.push(tmp[0], tmp[1], tmp[2]);
            }
            newIndices[i] = mapped;
        }

        const compactVerts = new Float32Array(positions);
        return this.addStaticMesh(compactVerts, 3, newIndices);
    }

    // Build a static MeshShape body from interleaved vertex data + uint32 indices.
    // `vertexStrideFloats` is the number of floats per vertex (positions live at the
    // start of the stride). Triangles are taken from the index buffer in groups of 3.
    public addStaticMesh(vertexData: Float32Array, vertexStrideFloats: number, indexData: Uint32Array): any | null {
        const jolt = this.jolt as any;

        const vertexCount = (vertexData.length / vertexStrideFloats) | 0;
        const triCount = (indexData.length / 3) | 0;

        const vertices = new jolt.VertexList();
        vertices.resize(vertexCount);
        for (let i = 0; i < vertexCount; i++) {
            const o = i * vertexStrideFloats;
            // Source (x, y, z) -> Jolt (x, z, -y).
            const v = vertices.at(i);
            v.x = vertexData[o + 0];
            v.y = vertexData[o + 2];
            v.z = -vertexData[o + 1];
        }

        const triangles = new jolt.IndexedTriangleList();
        triangles.resize(triCount);
        for (let t = 0; t < triCount; t++) {
            const it = triangles.at(t);
            // Source -> Jolt axis swap negates Y, which reverses triangle winding.
            // Jolt's MeshShape is one-sided and expects CCW from outside, so swap
            // indices 1 and 2 to put normals back outward. Mirrors physics_collide.cpp
            // in vphysics-jolt.
            it.set_mIdx(0, indexData[t * 3 + 0]);
            it.set_mIdx(1, indexData[t * 3 + 2]);
            it.set_mIdx(2, indexData[t * 3 + 1]);
        }

        const materials = new jolt.PhysicsMaterialList();
        const settings = new jolt.MeshShapeSettings(vertices, triangles, materials);
        settings.Sanitize();
        const result = settings.Create();
        const shape = result.Get();
        jolt.destroy(settings);
        jolt.destroy(vertices);
        jolt.destroy(triangles);
        jolt.destroy(materials);

        const bodyCreationSettings = new jolt.BodyCreationSettings(
            shape,
            new jolt.RVec3(0, 0, 0),
            new jolt.Quat(0, 0, 0, 1),
            jolt.EMotionType_Static,
            LAYER_NON_MOVING
        );
        const body = this.bodyInterface.CreateBody(bodyCreationSettings);
        jolt.destroy(bodyCreationSettings);

        this.bodyInterface.AddBody(body.GetID(), jolt.EActivation_DontActivate);
        this.trackedBodies.add(body);
        return body;
    }

    // Static box body — placed once at spawn, never moves. Used for prop_static
    // and prop_dynamic where we don't have .phy data and a tight AABB is good enough.
    public addStaticBox(halfExtentsSrc: ReadonlyVec3, positionSrc: ReadonlyVec3, rotationSrc: quat): any {
        const jolt = this.jolt as any;

        const halfExtents = new jolt.Vec3(
            Math.max(0.05, halfExtentsSrc[0]),
            Math.max(0.05, halfExtentsSrc[2]),
            Math.max(0.05, halfExtentsSrc[1]),
        );
        const shape = new jolt.BoxShape(halfExtents, 0.05, undefined);
        jolt.destroy(halfExtents);

        const pos = new jolt.RVec3(positionSrc[0], positionSrc[2], -positionSrc[1]);
        const rot = new jolt.Quat(rotationSrc[0], rotationSrc[2], -rotationSrc[1], rotationSrc[3]);

        const settings = new jolt.BodyCreationSettings(shape, pos, rot, jolt.EMotionType_Static, LAYER_NON_MOVING);
        const body = this.bodyInterface.CreateBody(settings);
        jolt.destroy(settings);
        jolt.destroy(pos);
        jolt.destroy(rot);

        this.bodyInterface.AddBody(body.GetID(), jolt.EActivation_DontActivate);
        this.trackedBodies.add(body);
        return body;
    }

    // Build a (possibly compound) shape out of PHY convex hull pieces. Returns
    // null if pieces is empty or all hulls fail to build. Caller owns the
    // returned shape; caller must keep a reference to it until the body is
    // destroyed (compound subshapes are refcounted internally).
    public buildShapeFromPhyPieces(pieces: { vertices: Float32Array }[], retain: any[]): any | null {
        const jolt = this.jolt as any;
        if (pieces.length === 0)
            return null;

        const subShapes: any[] = [];
        for (const piece of pieces) {
            if (piece.vertices.length < 9)
                continue; // need at least 3 vertices for a hull

            const points = new jolt.ArrayVec3();
            for (let i = 0; i < piece.vertices.length; i += 3) {
                // Source -> Jolt: (x, y, z) -> (x, z, -y)
                const v = new jolt.Vec3(
                    piece.vertices[i + 0],
                    piece.vertices[i + 2],
                    -piece.vertices[i + 1],
                );
                points.push_back(v);
                jolt.destroy(v);
            }
            const settings = new jolt.ConvexHullShapeSettings();
            settings.set_mPoints(points);
            settings.set_mMaxConvexRadius(0.5);
            const result = settings.Create();
            jolt.destroy(settings);
            jolt.destroy(points);
            if (!result.IsValid())
                continue;
            const shape = result.Get();
            subShapes.push(shape);
            retain.push(shape);
        }

        if (subShapes.length === 0)
            return null;
        if (subShapes.length === 1)
            return subShapes[0];

        // Compound: each sub-hull at identity, since vertices are already in
        // body-local space.
        const compoundSettings = new jolt.StaticCompoundShapeSettings();
        const zero = new jolt.Vec3(0, 0, 0);
        const idQuat = new jolt.Quat(0, 0, 0, 1);
        for (const sub of subShapes)
            compoundSettings.AddShapeShape(zero, idQuat, sub, 0);
        const result = compoundSettings.Create();
        jolt.destroy(compoundSettings);
        jolt.destroy(zero);
        jolt.destroy(idQuat);
        if (!result.IsValid())
            return subShapes[0];
        const compound = result.Get();
        retain.push(compound);
        return compound;
    }

    public addStaticShape(shape: any, positionSrc: ReadonlyVec3, rotationSrc: quat): any {
        const jolt = this.jolt as any;
        const pos = new jolt.RVec3(positionSrc[0], positionSrc[2], -positionSrc[1]);
        const rot = new jolt.Quat(rotationSrc[0], rotationSrc[2], -rotationSrc[1], rotationSrc[3]);
        const settings = new jolt.BodyCreationSettings(shape, pos, rot, jolt.EMotionType_Static, LAYER_NON_MOVING);
        const body = this.bodyInterface.CreateBody(settings);
        jolt.destroy(settings);
        jolt.destroy(pos);
        jolt.destroy(rot);
        this.bodyInterface.AddBody(body.GetID(), jolt.EActivation_DontActivate);
        this.trackedBodies.add(body);
        return body;
    }

    // Build a dynamic convex-hull body from world-space Source vertices.
    // The vertices are translated so the body's center is at the centroid of
    // the input points; the caller gets back the centroid in Source space so
    // it can compose a render matrix that compensates for the offset.
    public addDynamicConvexFromWorldVertices(
        verticesSrc: Float32Array,
        mass: number,
        retain: any[],
        outCentroidSrc: vec3,
    ): any | null {
        if (verticesSrc.length < 9)
            return null;
        const n = verticesSrc.length / 3;
        let cx = 0, cy = 0, cz = 0;
        for (let i = 0; i < n; i++) {
            cx += verticesSrc[i * 3 + 0];
            cy += verticesSrc[i * 3 + 1];
            cz += verticesSrc[i * 3 + 2];
        }
        cx /= n; cy /= n; cz /= n;
        outCentroidSrc[0] = cx; outCentroidSrc[1] = cy; outCentroidSrc[2] = cz;

        const local = new Float32Array(verticesSrc.length);
        for (let i = 0; i < verticesSrc.length; i += 3) {
            local[i + 0] = verticesSrc[i + 0] - cx;
            local[i + 1] = verticesSrc[i + 1] - cy;
            local[i + 2] = verticesSrc[i + 2] - cz;
        }

        const shape = this.buildShapeFromPhyPieces([{ vertices: local }], retain);
        if (shape === null)
            return null;

        const centroid = vec3.fromValues(cx, cy, cz);
        const idQuat = quat.fromValues(0, 0, 0, 1);
        return this.addDynamicShape(shape, centroid, idQuat, mass);
    }

    public addDynamicShape(shape: any, positionSrc: ReadonlyVec3, rotationSrc: quat, mass: number): any {
        const jolt = this.jolt as any;
        const pos = new jolt.RVec3(positionSrc[0], positionSrc[2], -positionSrc[1]);
        const rot = new jolt.Quat(rotationSrc[0], rotationSrc[2], -rotationSrc[1], rotationSrc[3]);
        const settings = new jolt.BodyCreationSettings(shape, pos, rot, jolt.EMotionType_Dynamic, LAYER_MOVING);
        settings.mMotionQuality = jolt.EMotionQuality_LinearCast;
        const massProps = settings.GetMassProperties();
        massProps.mMass = mass;
        settings.mOverrideMassProperties = jolt.EOverrideMassProperties_CalculateInertia;
        settings.mMassPropertiesOverride = massProps;
        const body = this.bodyInterface.CreateBody(settings);
        jolt.destroy(settings);
        jolt.destroy(pos);
        jolt.destroy(rot);
        this.bodyInterface.AddBody(body.GetID(), jolt.EActivation_Activate);
        this.trackedBodies.add(body);
        this.recordSpawnTransform(body, positionSrc, rotationSrc);
        return body;
    }

    public recordSpawnTransform(body: any, posSrc: ReadonlyVec3, rotSrc: quat): void {
        // Save the Jolt-space spawn transform so reset can teleport directly.
        this.spawnTransforms.set(body, {
            px: posSrc[0], py: posSrc[2], pz: -posSrc[1],
            qx: rotSrc[0], qy: rotSrc[2], qz: -rotSrc[1], qw: rotSrc[3],
        });
    }

    public setEnabled(enabled: boolean): void {
        if (this.enabled === enabled) return;
        this.enabled = enabled;

        const jolt = this.jolt as any;
        if (!enabled) {
            // Teleport every dynamic body back to its spawn, zero velocity,
            // and deactivate so it can't drift while the user has physics off.
            for (const [body, t] of this.spawnTransforms) {
                const id = body.GetID();
                const pos = new jolt.RVec3(t.px, t.py, t.pz);
                const rot = new jolt.Quat(t.qx, t.qy, t.qz, t.qw);
                const zero = new jolt.Vec3(0, 0, 0);
                this.bodyInterface.SetPositionRotationAndVelocity(id, pos, rot, zero, zero);
                this.bodyInterface.DeactivateBody(id);
                jolt.destroy(pos); jolt.destroy(rot); jolt.destroy(zero);
            }
            // Reset accumulator so re-enable doesn't dump a huge dt.
            this.accumulator = 0;
        } else {
            for (const body of this.spawnTransforms.keys())
                this.bodyInterface.ActivateBody(body.GetID());
        }
    }

    public addDynamicBox(halfExtentsSrc: ReadonlyVec3, positionSrc: ReadonlyVec3, rotationSrc: quat, mass: number): any {
        const jolt = this.jolt as any;

        const halfExtents = new jolt.Vec3(halfExtentsSrc[0], halfExtentsSrc[2], halfExtentsSrc[1]);
        const shape = new jolt.BoxShape(halfExtents, 0.05, undefined);
        jolt.destroy(halfExtents);

        const pos = new jolt.RVec3(positionSrc[0], positionSrc[2], -positionSrc[1]);
        const rot = new jolt.Quat(rotationSrc[0], rotationSrc[2], -rotationSrc[1], rotationSrc[3]);

        const settings = new jolt.BodyCreationSettings(shape, pos, rot, jolt.EMotionType_Dynamic, LAYER_MOVING);
        // Continuous collision so fast-falling props can't tunnel through floor/wall brushes.
        settings.mMotionQuality = jolt.EMotionQuality_LinearCast;
        const massProps = settings.GetMassProperties();
        massProps.mMass = mass;
        settings.mOverrideMassProperties = jolt.EOverrideMassProperties_CalculateInertia;
        settings.mMassPropertiesOverride = massProps;

        const body = this.bodyInterface.CreateBody(settings);
        jolt.destroy(settings);
        jolt.destroy(pos);
        jolt.destroy(rot);

        this.bodyInterface.AddBody(body.GetID(), jolt.EActivation_Activate);
        this.trackedBodies.add(body);
        this.recordSpawnTransform(body, positionSrc, rotationSrc);
        return body;
    }

    // Read body transform back into a Source-space mat4. Caller-owned `dst`.
    public readBodyTransform(body: any, dst: mat4): void {
        const t = body.GetPosition();
        const q = body.GetRotation();

        const px = t.GetX(), py = t.GetY(), pz = t.GetZ();
        const qx = q.GetX(), qy = q.GetY(), qz = q.GetZ(), qw = q.GetW();

        // Source pos <- (jx, -jz, jy)
        const sx = px, sy = -pz, sz = py;
        // Source quat <- (jx, -jz, jy, jw)
        const sqx = qx, sqy = -qz, sqz = qy, sqw = qw;

        // Build mat4 from translation + quaternion (column-major, gl-matrix).
        const x2 = sqx + sqx, y2 = sqy + sqy, z2 = sqz + sqz;
        const xx = sqx * x2, xy = sqx * y2, xz = sqx * z2;
        const yy = sqy * y2, yz = sqy * z2, zz = sqz * z2;
        const wx = sqw * x2, wy = sqw * y2, wz = sqw * z2;

        dst[0]  = 1 - (yy + zz);
        dst[1]  = xy + wz;
        dst[2]  = xz - wy;
        dst[3]  = 0;
        dst[4]  = xy - wz;
        dst[5]  = 1 - (xx + zz);
        dst[6]  = yz + wx;
        dst[7]  = 0;
        dst[8]  = xz + wy;
        dst[9]  = yz - wx;
        dst[10] = 1 - (xx + yy);
        dst[11] = 0;
        dst[12] = sx;
        dst[13] = sy;
        dst[14] = sz;
        dst[15] = 1;
    }

    // Build a kinematic mesh body. Vertices are taken in entity-local space (no
    // world transform applied), and the body's world transform is set separately
    // via `moveKinematicBody`. Use this for brush entities (func_door, platforms)
    // that need their collision to track the entity's modelMatrix.
    public addKinematicMeshSlice(
        vertexData: Float32Array,
        vertexStrideFloats: number,
        indexData: Uint32Array,
        indexStart: number,
        indexCount: number,
    ): any | null {
        if (indexCount === 0)
            return null;
        const jolt = this.jolt as any;

        // Build the shape with local-space vertices (Source -> Jolt swap inside addStaticMesh).
        // Then we manually create a kinematic body around the same shape rather than going
        // through addStaticMesh's default static body, so we can set motion type.
        const usedMap = new Map<number, number>();
        const newIndices = new Uint32Array(indexCount);
        const positions: number[] = [];

        for (let i = 0; i < indexCount; i++) {
            const srcIdx = indexData[indexStart + i];
            let mapped = usedMap.get(srcIdx);
            if (mapped === undefined) {
                mapped = positions.length / 3;
                usedMap.set(srcIdx, mapped);
                const o = srcIdx * vertexStrideFloats;
                positions.push(vertexData[o + 0], vertexData[o + 1], vertexData[o + 2]);
            }
            newIndices[i] = mapped;
        }

        const triCount = (indexCount / 3) | 0;
        const vertexCount = positions.length / 3;

        const verts = new jolt.VertexList();
        verts.resize(vertexCount);
        for (let i = 0; i < vertexCount; i++) {
            const v = verts.at(i);
            v.x = positions[i * 3 + 0];
            v.y = positions[i * 3 + 2];
            v.z = -positions[i * 3 + 1];
        }

        const tris = new jolt.IndexedTriangleList();
        tris.resize(triCount);
        for (let t = 0; t < triCount; t++) {
            const it = tris.at(t);
            it.set_mIdx(0, newIndices[t * 3 + 0]);
            it.set_mIdx(1, newIndices[t * 3 + 2]);
            it.set_mIdx(2, newIndices[t * 3 + 1]);
        }

        const materials = new jolt.PhysicsMaterialList();
        const settings = new jolt.MeshShapeSettings(verts, tris, materials);
        settings.Sanitize();
        const shape = settings.Create().Get();
        jolt.destroy(settings);
        jolt.destroy(verts);
        jolt.destroy(tris);
        jolt.destroy(materials);

        const pos = new jolt.RVec3(0, 0, 0);
        const rot = new jolt.Quat(0, 0, 0, 1);
        const bcs = new jolt.BodyCreationSettings(shape, pos, rot, jolt.EMotionType_Kinematic, LAYER_NON_MOVING);
        const body = this.bodyInterface.CreateBody(bcs);
        jolt.destroy(bcs);
        jolt.destroy(pos);
        jolt.destroy(rot);

        this.bodyInterface.AddBody(body.GetID(), jolt.EActivation_Activate);
        this.trackedBodies.add(body);
        return body;
    }

    // Update a kinematic body's transform from a Source-space mat4. Translation
    // and rotation are extracted; scale is ignored (props don't usually scale).
    private kinematicScratchPos = vec3.create();
    private kinematicScratchRot = quat.create();
    public moveKinematicBody(body: any, srcMat: ReadonlyMat4, deltaTime: number): void {
        const m = srcMat as any as number[];
        // Translation.
        const tx = m[12], ty = m[13], tz = m[14];

        // Quaternion from rotation portion of mat4 (column-major).
        // Standard mat4 -> quaternion extraction.
        const trace = m[0] + m[5] + m[10];
        const out = this.kinematicScratchRot;
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

        const jolt = this.jolt as any;
        const jpos = new jolt.RVec3(tx, tz, -ty);
        const jrot = new jolt.Quat(out[0], out[2], -out[1], out[3]);
        const dt = Math.max(deltaTime, 1 / 240);
        this.bodyInterface.MoveKinematic(body.GetID(), jpos, jrot, dt);
        jolt.destroy(jpos);
        jolt.destroy(jrot);
    }

    // Teleport a dynamic body. Resets velocity so the prop doesn't keep momentum
    // from the spot it left.
    public teleportBody(body: any, positionSrc: ReadonlyVec3, rotationSrc: quat): void {
        const jolt = this.jolt as any;
        const pos = new jolt.RVec3(positionSrc[0], positionSrc[2], -positionSrc[1]);
        const rot = new jolt.Quat(rotationSrc[0], rotationSrc[2], -rotationSrc[1], rotationSrc[3]);
        const zero = new jolt.Vec3(0, 0, 0);
        const id = body.GetID();
        this.bodyInterface.SetPositionRotationAndVelocity(id, pos, rot, zero, zero);
        // Wake the body so gravity resumes; the call above doesn't reactivate.
        this.bodyInterface.ActivateBody(id);
        jolt.destroy(pos);
        jolt.destroy(rot);
        jolt.destroy(zero);
    }

    public removeBody(body: any): void {
        if (!this.trackedBodies.has(body))
            return;
        const jolt = this.jolt as any;
        const id = body.GetID();
        this.bodyInterface.RemoveBody(id);
        this.bodyInterface.DestroyBody(id);
        this.trackedBodies.delete(body);
    }

    public destroy(): void {
        const jolt = this.jolt as any;
        for (const body of this.trackedBodies) {
            const id = body.GetID();
            this.bodyInterface.RemoveBody(id);
            this.bodyInterface.DestroyBody(id);
        }
        this.trackedBodies.clear();
        jolt.destroy(this.joltInterface);
    }
}
