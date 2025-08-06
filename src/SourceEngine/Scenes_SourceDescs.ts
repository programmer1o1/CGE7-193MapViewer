
import { GfxDevice } from "../gfx/platform/GfxPlatform.js";
import { SceneContext, SceneDesc, SceneGroup } from "../SceneBase.js";
import { SourceFileSystem, SourceLoadContext } from "./Main.js";
import { createScene } from "./Scenes.js";
import { createKitchenSinkSourceFilesytem } from "./Scenes_FileDrops.js";

const pakfilesPathBase = `paks`;
const tfPathBase = `TeamFortress2`;

export class TeamFortress2SceneDesc implements SceneDesc {
    constructor(public id: string, public name: string = id) {
    }

    public async createScene(device: GfxDevice, context: SceneContext) {
        const filesystem = await context.dataShare.ensureObject(`${tfPathBase}/SourceFileSystem`, async () => {
            const filesystem = new SourceFileSystem(context.dataFetcher);
            // According to gameinfo.txt, it first mounts TF2 and then HL2.
            await Promise.all([
                filesystem.createVPKMount(`${pakfilesPathBase}/tf2/tf2_textures`),
                filesystem.createVPKMount(`${pakfilesPathBase}/tf2/tf2_misc`),
                filesystem.createVPKMount(`${pakfilesPathBase}/hl2/hl2_textures`),
                filesystem.createVPKMount(`${pakfilesPathBase}/hl2/hl2_misc`),
            ]);
            return filesystem;
        });

        const loadContext = new SourceLoadContext(filesystem);
        return createScene(context, loadContext, this.id, `maps/tf/maps/${this.id}.bsp`);
    }
}

export class CGESceneDesc implements SceneDesc {
    constructor(public id: string, public name: string = id) {
    }

    public async createScene(device: GfxDevice, context: SceneContext) {
        const filesystem = await context.dataShare.ensureObject(`${pakfilesPathBase}/SourceFileSystem`, async () => {
            const filesystem = new SourceFileSystem(context.dataFetcher);
            // According to gameinfo.txt, it first mounts TF2 and then HL2.
            const vpkMounts = [
                filesystem.createVPKMount(`${pakfilesPathBase}/tf2/tf2_textures`),
                filesystem.createVPKMount(`${pakfilesPathBase}/tf2/tf2_misc`),
                filesystem.createVPKMount(`${pakfilesPathBase}/hl2/hl2_textures`),
                filesystem.createVPKMount(`${pakfilesPathBase}/hl2/hl2_misc`),
            ];
            
            await Promise.all(vpkMounts);
            return filesystem;
        });

        const loadContext = new SourceLoadContext(filesystem);
        return createScene(context, loadContext, this.id, `maps/${this.id}/${this.id}.bsp`);
    }
}

const pathRoot = `HalfLife2_2024`;
const pathHL2 = `${pathRoot}/hl2`;
const pathEp1 = `${pathRoot}/episodic`;
const pathEp2 = `${pathRoot}/ep2`;

export class HalfLife2Ep2SceneDesc implements SceneDesc {
    constructor(public id: string, public name: string = id) {
    }

    public async createScene(device: GfxDevice, context: SceneContext) {
        const filesystem = await context.dataShare.ensureObject(`${pathEp2}/SourceFileSystem`, async () => {
            const filesystem = new SourceFileSystem(context.dataFetcher);
            await Promise.all([
                filesystem.createVPKMount(`${pakfilesPathBase}/ep2/ep2_pak`),
                // filesystem.createVPKMount(`${pakfilesPathBase}/episodic/ep1_pak`),
                filesystem.createVPKMount(`${pakfilesPathBase}/hl2/hl2_textures`),
                filesystem.createVPKMount(`${pakfilesPathBase}/hl2/hl2_misc`),
            ]);
            return filesystem;
        });

        const loadContext = new SourceLoadContext(filesystem);
        return createScene(context, loadContext, this.id, `maps/ep2/maps/${this.id}.bsp`);
    }
}

export class HalfLife2SceneDesc implements SceneDesc {
    constructor(public id: string, public name: string = id) {
    }

    public async createScene(device: GfxDevice, context: SceneContext) {
        const filesystem = await context.dataShare.ensureObject(`${pathHL2}/SourceFileSystem`, async () => {
            const filesystem = new SourceFileSystem(context.dataFetcher);
            await Promise.all([
                filesystem.createVPKMount(`${pakfilesPathBase}/hl2/hl2_textures`),
                filesystem.createVPKMount(`${pakfilesPathBase}/hl2/hl2_misc`),
            ]);
            return filesystem;
        });

        const loadContext = new SourceLoadContext(filesystem);
        return createScene(context, loadContext, this.id, `maps/hl2/maps/${this.id}.bsp`);
    }
}

const cstrikePathBase = `CounterStrikeSource`;
export class CounterStrikeSourceSceneDesc implements SceneDesc {
    constructor(public id: string, public name: string = id) {
    }

    public async createScene(device: GfxDevice, context: SceneContext) {
        const filesystem = await context.dataShare.ensureObject(`${cstrikePathBase}/SourceFileSystem`, async () => {
            const filesystem = new SourceFileSystem(context.dataFetcher);
            await Promise.all([
                filesystem.createVPKMount(`${pakfilesPathBase}/cstrike/cstrike_pak`),
                filesystem.createVPKMount(`${pakfilesPathBase}/hl2/hl2_textures`),
                filesystem.createVPKMount(`${pakfilesPathBase}/hl2/hl2_misc`),
            ]);
            return filesystem;
        });
        
        const loadContext = new SourceLoadContext(filesystem);
        return createScene(context, loadContext, this.id, `maps/cstrike/maps/${this.id}.bsp`);
    }
}

const csgoPathBase = `CounterStrikeGO`;

export class CounterStrikeGOSceneDesc implements SceneDesc {
    constructor(public id: string, public name: string = id) {
    }
    
    public async createScene(device: GfxDevice, context: SceneContext) {
        const filesystem = await context.dataShare.ensureObject(`${csgoPathBase}/SourceFileSystem`, async () => {
            const filesystem = new SourceFileSystem(context.dataFetcher);
            await Promise.all([
                filesystem.createVPKMount(`${pakfilesPathBase}/hl2/hl2_textures`),   // include these because csgo error model is ass
                filesystem.createVPKMount(`${pakfilesPathBase}/hl2/hl2_misc`),       // include these because csgo error model is ass
                filesystem.createVPKMount(`${pakfilesPathBase}/csgo/pak01`),
            ]);
            return filesystem;
        });
        
        const loadContext = new SourceLoadContext(filesystem);
        return createScene(context, loadContext, this.id, `maps/csgo/maps/${this.id}.bsp`);
    }
}

const dodPathBase = `dod`;
export class DayOfDefeatSceneDesc implements SceneDesc {
    constructor(public id: string, public name: string = id) {
    }

    public async createScene(device: GfxDevice, context: SceneContext) {
        const filesystem = await context.dataShare.ensureObject(`${dodPathBase}/SourceFileSystem`, async () => {
            const filesystem = new SourceFileSystem(context.dataFetcher);
            await Promise.all([
                filesystem.createVPKMount(`${pakfilesPathBase}/hl2/hl2_textures`),
                filesystem.createVPKMount(`${pakfilesPathBase}/hl2/hl2_misc`),
                filesystem.createVPKMount(`${pakfilesPathBase}/dod/dod_pak`),
            ]);
            return filesystem;
        });

        const loadContext = new SourceLoadContext(filesystem);
        return createScene(context, loadContext, this.id, `maps/dod/maps/${this.id}.bsp`);
    }
}

export class GarrysModSceneDesc implements SceneDesc {
    constructor(public id: string, public name: string = id) {
    }

    public async createScene(device: GfxDevice, context: SceneContext) {
        const gmPathBase = `GarrysMod`;

        const filesystem = await context.dataShare.ensureObject(`${gmPathBase}/SourceFileSystem`, async () => {
            return createKitchenSinkSourceFilesytem(context.dataFetcher);
        });

        const loadContext = new SourceLoadContext(filesystem);
        return createScene(context, loadContext, this.id, `${gmPathBase}/maps/${this.id}.bsp`);
    }
}