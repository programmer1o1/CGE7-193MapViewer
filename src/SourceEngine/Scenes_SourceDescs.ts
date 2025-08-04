
import { GfxDevice } from "../gfx/platform/GfxPlatform.js";
import { SceneContext, SceneDesc, SceneGroup } from "../SceneBase.js";
import { SourceFileSystem, SourceLoadContext } from "./Main.js";
import { createScene } from "./Scenes.js";
import { createKitchenSinkSourceFilesytem } from "./Scenes_FileDrops.js";

const tf2PathBase = `TeamFortress2`;

export class TeamFortress2SceneDesc implements SceneDesc {
    constructor(public id: string, public name: string = id) {
    }

    public async createScene(device: GfxDevice, context: SceneContext) {
        const filesystem = await context.dataShare.ensureObject(`${tf2PathBase}/SourceFileSystem`, async () => {
            const filesystem = new SourceFileSystem(context.dataFetcher);
            // According to gameinfo.txt, it first mounts TF2 and then HL2.
            await Promise.all([
                filesystem.createVPKMount(`${tf2PathBase}/tf/tf2_textures`),
                filesystem.createVPKMount(`${tf2PathBase}/tf/tf2_misc`),
                filesystem.createVPKMount(`${tf2PathBase}/hl2/hl2_textures`),
                filesystem.createVPKMount(`${tf2PathBase}/hl2/hl2_misc`),
            ]);
            return filesystem;
        });

        const loadContext = new SourceLoadContext(filesystem);
        return createScene(context, loadContext, this.id, `https://static.gaq9.com/maps/tf/maps/${this.id}.bsp`);
    }
}

export class CGESceneDesc implements SceneDesc {
    constructor(public id: string, public name: string = id) {
    }

    public async createScene(device: GfxDevice, context: SceneContext) {
        const filesystem = await context.dataShare.ensureObject(`${tf2PathBase}/SourceFileSystem`, async () => {
            const filesystem = new SourceFileSystem(context.dataFetcher);
            // According to gameinfo.txt, it first mounts TF2 and then HL2.
            await Promise.all([
                filesystem.createVPKMount(`${tf2PathBase}/tf/tf2_textures`),
                filesystem.createVPKMount(`${tf2PathBase}/tf/tf2_misc`),
                filesystem.createVPKMount(`${tf2PathBase}/hl2/hl2_textures`),
                filesystem.createVPKMount(`${tf2PathBase}/hl2/hl2_misc`),
            ]);
            return filesystem;
        });

        const loadContext = new SourceLoadContext(filesystem);
        return createScene(context, loadContext, this.id, `https://static.gaq9.com/maps/${this.id}/${this.id}.bsp`);
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
                filesystem.createVPKMount(`${pathEp2}/ep2_pak`),
                filesystem.createVPKMount(`${pathEp1}/ep1_pak`),
                filesystem.createVPKMount(`${pathHL2}/hl2_textures`),
                filesystem.createVPKMount(`${pathHL2}/hl2_misc`),
            ]);
            return filesystem;
        });

        const loadContext = new SourceLoadContext(filesystem);
        return createScene(context, loadContext, this.id, `https://static.gaq9.com/maps/ep2/maps/${this.id}.bsp`);
    }
}

export class HalfLife2SceneDesc implements SceneDesc {
    constructor(public id: string, public name: string = id) {
    }

    public async createScene(device: GfxDevice, context: SceneContext) {
        const filesystem = await context.dataShare.ensureObject(`${pathHL2}/SourceFileSystem`, async () => {
            const filesystem = new SourceFileSystem(context.dataFetcher);
            await Promise.all([
                filesystem.createVPKMount(`${pathHL2}/hl2_textures`),
                filesystem.createVPKMount(`${pathHL2}/hl2_misc`),
            ]);
            return filesystem;
        });

        const loadContext = new SourceLoadContext(filesystem);
        return createScene(context, loadContext, this.id, `https://static.gaq9.com/maps/hl2/maps/${this.id}.bsp`);
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
                filesystem.createVPKMount(`${cstrikePathBase}/cstrike_pak`),
                filesystem.createVPKMount(`HalfLife2/hl2_textures`),
                filesystem.createVPKMount(`HalfLife2/hl2_misc`),
            ]);
            return filesystem;
        });
        
        const loadContext = new SourceLoadContext(filesystem);
        return createScene(context, loadContext, this.id, `https://static.gaq9.com/maps/cstrike/maps/${this.id}.bsp`);
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
                filesystem.createVPKMount(`${tf2PathBase}/hl2/hl2_textures`),   // include these because csgo error model is ass
                filesystem.createVPKMount(`${tf2PathBase}/hl2/hl2_misc`),       // include these because csgo error model is ass
                filesystem.createVPKMount(`https://static.gaq9.com/paks/csgo/pak01`),
            ]);
            return filesystem;
        });
        
        const loadContext = new SourceLoadContext(filesystem);
        return createScene(context, loadContext, this.id, `https://static.gaq9.com/maps/csgo/maps/${this.id}.bsp`);
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
                filesystem.createVPKMount(`${tf2PathBase}/hl2/hl2_textures`),
                filesystem.createVPKMount(`${tf2PathBase}/hl2/hl2_misc`),
                filesystem.createVPKMount(`https://static.gaq9.com/paks/dod/dod_pak`),
            ]);
            return filesystem;
        });

        const loadContext = new SourceLoadContext(filesystem);
        return createScene(context, loadContext, this.id, `https://static.gaq9.com/maps/dod/maps/${this.id}.bsp`);
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