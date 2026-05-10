// Parse Source .phy collision/ragdoll data. We only care about the trailing
// keyvalue text right now — that's where ragdoll joint limits live. The binary
// IVP collision blobs (compact ledge trees) are skipped; ragdoll bones keep
// their sphere shapes for the time being.
//
// File layout:
//   phyheader_t (16 bytes): size, id, solidCount, checksum
//   for each solid:
//       int   solidSize
//       byte  solidData[solidSize]   // IVP CPhysCollide blob
//   char text[]                      // KV text up to EOF

import ArrayBufferSlice from '../ArrayBufferSlice.js';
import { ValveKeyValueParser, pairs2obj } from './VMT.js';

export interface PhySolidInfo {
    physBoneIndex: number;     // index into solids[]
    name: string;              // model bone name
    mass: number;
}

export interface PhyRagdollConstraint {
    parentPhysBone: number;
    childPhysBone: number;
    // Twist (around bone axis, X) limits in degrees.
    xMin: number; xMax: number;
    // Swing limits in degrees, two perpendicular axes.
    yMin: number; yMax: number;
    zMin: number; zMax: number;
}

export interface PhyConvexPiece {
    // Source-space vertex positions (Float32, packed xyz). Multiple pieces per
    // solid mean a compound shape (non-convex prop split into convex hulls).
    vertices: Float32Array;
}

export interface PhySolidGeometry {
    pieces: PhyConvexPiece[];
    massCenter: [number, number, number]; // Source space
}

export interface PhyData {
    solids: PhySolidInfo[];
    constraints: PhyRagdollConstraint[];
    // One geometry entry per solid blob, indexed the same way (solid 0 in the
    // KV section corresponds to geometries[0] from the binary section).
    geometries: PhySolidGeometry[];
}

// IVP stores positions in meters with the X,-Z,Y axis swap to its own frame.
// To convert back: Source(x, y, z) = (k[0], k[2], -k[1]) * (1/0.0254).
const IVP_TO_SOURCE = 1 / 0.0254;

export function parsePhy(buffer: ArrayBufferSlice): PhyData | null {
    if (buffer.byteLength < 16)
        return null;

    const view = buffer.createDataView();
    const headerSize = view.getInt32(0x00, true);
    const id         = view.getInt32(0x04, true);
    const solidCount = view.getInt32(0x08, true);
    // checksum at 0x0C, ignored.

    if (headerSize !== 16 || solidCount < 0 || solidCount > 1024)
        return null;

    const geometries: PhySolidGeometry[] = [];
    let offs = headerSize;
    for (let i = 0; i < solidCount; i++) {
        if (offs + 4 > buffer.byteLength)
            return null;
        const solidSize = view.getInt32(offs, true);
        offs += 4;
        if (solidSize <= 0 || offs + solidSize > buffer.byteLength)
            return null;
        const geom = parseIVPSurface(buffer, offs, solidSize);
        geometries.push(geom ?? { pieces: [], massCenter: [0, 0, 0] });
        offs += solidSize;
    }

    if (offs >= buffer.byteLength)
        return { solids: [], constraints: [], geometries };

    // Decode KV text. Source PHY text is ASCII / latin-1.
    const textBytes = buffer.createTypedArray(Uint8Array, offs, buffer.byteLength - offs);
    let text = '';
    for (let i = 0; i < textBytes.length; i++)
        text += String.fromCharCode(textBytes[i]);
    // Trim trailing nulls — some files pad with \0.
    text = text.replace(/\0+$/, '');

    const solids: PhySolidInfo[] = [];
    const constraints: PhyRagdollConstraint[] = [];

    try {
        const parser = new ValveKeyValueParser(text);
        while (parser.hastok()) {
            parser.skipwhite();
            if (!parser.hastok())
                break;
            const [key, value] = parser.pair();
            if (typeof value !== 'object')
                continue;
            const obj = pairs2obj(value as any);

            if (key === 'solid') {
                solids.push({
                    physBoneIndex: numOr(obj.index, solids.length),
                    name: String(obj.name ?? '').trim(),
                    mass: numOr(obj.mass, 1),
                });
            } else if (key === 'ragdollconstraint') {
                constraints.push({
                    parentPhysBone: numOr(obj.parent, -1),
                    childPhysBone: numOr(obj.child, -1),
                    xMin: numOr(obj.xmin, -10),
                    xMax: numOr(obj.xmax,  10),
                    yMin: numOr(obj.ymin, -30),
                    yMax: numOr(obj.ymax,  30),
                    zMin: numOr(obj.zmin, -30),
                    zMax: numOr(obj.zmax,  30),
                });
            }
        }
    } catch (e) {
        console.warn('PHY: failed to parse KV text', e);
    }

    return { solids, constraints, geometries };
}

// Parse one IVP compact-surface blob and return its convex pieces.
// Blob layout (from vphysics-jolt physics_collide.cpp):
//   IVP_CS  (48 bytes): mass_center[3], inertia[3], radius, max_dev:8, byte_size:24, offset_ledgetree_root, dummy[3]
//   IVP_LTN (28 bytes): ledge tree node, recursive — leaf nodes (offset_right_node==0) point at
//   IVP_CL  (16 bytes): compact ledge — {c_point_offset, client_data, flags+size, n_triangles, _}
//                       Followed by n_triangles * IVP_CT (16 bytes), each with 3 IVP_CE edges (vertex indices).
//   IVP_PP  (16 bytes): vertex { float k[3]; float hesse; }, located at ledge + c_point_offset.
function parseIVPSurface(buffer: ArrayBufferSlice, blobOffset: number, blobSize: number): PhySolidGeometry | null {
    if (blobSize < 48)
        return null;
    const view = buffer.createDataView(blobOffset, blobSize);

    // IVP_CS header.
    const mcx = view.getFloat32(0x00, true);
    const mcy = view.getFloat32(0x04, true);
    const mcz = view.getFloat32(0x08, true);
    // 0x0C..0x18: rotation_inertia[3], radius — skip.
    // 0x1C: max_dev:8 + byte_size:24
    // 0x20: offset_ledgetree_root
    const offsetLedgeTreeRoot = view.getInt32(0x20, true);
    if (offsetLedgeTreeRoot <= 0 || offsetLedgeTreeRoot + 28 > blobSize)
        return null;

    // Convert mass center IVP -> Source: (k[0], k[2], -k[1]) * IVP_TO_SOURCE.
    const massCenter: [number, number, number] = [
        mcx * IVP_TO_SOURCE,
        mcz * IVP_TO_SOURCE,
        -mcy * IVP_TO_SOURCE,
    ];

    // Walk ledge tree, collect leaf ledge offsets.
    const leafOffsets: number[] = [];
    walkLedgeTree(view, blobSize, offsetLedgeTreeRoot, leafOffsets, 0);
    if (leafOffsets.length === 0)
        return { pieces: [], massCenter };

    const pieces: PhyConvexPiece[] = [];
    for (const ledgeOffset of leafOffsets) {
        const piece = extractLedgeVertices(view, blobSize, ledgeOffset);
        if (piece !== null)
            pieces.push(piece);
    }
    return { pieces, massCenter };
}

function walkLedgeTree(view: DataView, dataSize: number, nodeOffset: number, out: number[], depth: number): void {
    if (depth > 512) return;
    if (nodeOffset < 0 || nodeOffset + 28 > dataSize) return;

    const offsetRightNode = view.getInt32(nodeOffset + 0x00, true);
    const offsetCompactLedge = view.getInt32(nodeOffset + 0x04, true);
    const isTerminal = (offsetRightNode === 0);

    if (isTerminal && offsetCompactLedge !== 0) {
        const ledgeOffset = nodeOffset + offsetCompactLedge;
        if (ledgeOffset >= 0 && ledgeOffset + 16 <= dataSize)
            out.push(ledgeOffset);
    }

    if (!isTerminal) {
        // Left child immediately follows in memory (one IVP_LTN later).
        walkLedgeTree(view, dataSize, nodeOffset + 28, out, depth + 1);
        if (offsetRightNode > 0)
            walkLedgeTree(view, dataSize, nodeOffset + offsetRightNode, out, depth + 1);
    }
}

function extractLedgeVertices(view: DataView, dataSize: number, ledgeOffset: number): PhyConvexPiece | null {
    if (ledgeOffset + 16 > dataSize) return null;

    const cPointOffset = view.getInt32(ledgeOffset + 0x00, true);
    const nTriangles = view.getInt16(ledgeOffset + 0x0C, true);
    if (nTriangles <= 0 || nTriangles > 65536)
        return null;

    const triStart = ledgeOffset + 16;
    if (triStart + nTriangles * 16 > dataSize)
        return null;

    // Find the highest vertex index referenced by any triangle.
    let maxIdx = -1;
    for (let i = 0; i < nTriangles; i++) {
        const triBase = triStart + i * 16;
        const flags = view.getUint32(triBase + 0x00, true);
        // is_virtual is the high bit of the 32-bit flags word.
        if ((flags >>> 31) & 1) continue;
        for (let e = 0; e < 3; e++) {
            const edge = view.getUint32(triBase + 4 + e * 4, true);
            const startPointIndex = edge & 0xFFFF;
            if (startPointIndex > maxIdx) maxIdx = startPointIndex;
        }
    }
    if (maxIdx < 0)
        return null;

    const vertexPoolOffset = ledgeOffset + cPointOffset;
    const numVerts = maxIdx + 1;
    if (vertexPoolOffset < 0 || vertexPoolOffset + numVerts * 16 > dataSize)
        return null;

    // Collect referenced vertices, IVP -> Source axis swap.
    const used = new Set<number>();
    for (let i = 0; i < nTriangles; i++) {
        const triBase = triStart + i * 16;
        const flags = view.getUint32(triBase + 0x00, true);
        if ((flags >>> 31) & 1) continue;
        for (let e = 0; e < 3; e++) {
            used.add(view.getUint32(triBase + 4 + e * 4, true) & 0xFFFF);
        }
    }

    const vertices = new Float32Array(used.size * 3);
    let w = 0;
    for (const idx of used) {
        const o = vertexPoolOffset + idx * 16;
        const kx = view.getFloat32(o + 0x00, true);
        const ky = view.getFloat32(o + 0x04, true);
        const kz = view.getFloat32(o + 0x08, true);
        // IVP -> Source: (k[0], k[2], -k[1]) * IVP_TO_SOURCE.
        vertices[w++] = kx * IVP_TO_SOURCE;
        vertices[w++] = kz * IVP_TO_SOURCE;
        vertices[w++] = -ky * IVP_TO_SOURCE;
    }
    return { vertices };
}

function numOr(v: any, fallback: number): number {
    if (v === undefined || v === null)
        return fallback;
    const n = typeof v === 'string' ? parseFloat(v) : Number(v);
    return Number.isFinite(n) ? n : fallback;
}
