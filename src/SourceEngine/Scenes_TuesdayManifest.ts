
import { GfxDevice } from "../gfx/platform/GfxPlatform.js";
import { SceneContext, SceneDesc, SceneGroup } from "../SceneBase.js";
import { SourceFileSystem, SourceLoadContext } from "./Main.js";
import { createScene } from "./Scenes.js";
import { createKitchenSinkSourceFilesytem } from "./Scenes_FileDrops.js";

const tuesdayPathBase = 'TuesdayManifest'

const tf2PathBase = `TeamFortress2`;

class TeamFortress2SceneDesc implements SceneDesc {
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

class HalfLife2Ep2SceneDesc implements SceneDesc {
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
        return createScene(context, loadContext, this.id, `https://static.gaq9.com/maps/${this.id}/${this.id}.bsp`);
    }
}

class HalfLife2SceneDesc implements SceneDesc {
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
        return createScene(context, loadContext, this.id, `https://static.gaq9.com/maps/${this.id}/${this.id}.bsp`);
    }
}

const csgoPathBase = `CounterStrikeGO`;

class CounterStrikeGOSceneDesc implements SceneDesc {
    constructor(public id: string, public name: string = id) {
    }
    
    public async createScene(device: GfxDevice, context: SceneContext) {
        const filesystem = await context.dataShare.ensureObject(`${csgoPathBase}/SourceFileSystem`, async () => {
            const filesystem = new SourceFileSystem(context.dataFetcher);
            await Promise.all([
                filesystem.createVPKMount(`${csgoPathBase}/csgo/pak01`),
            ]);
            return filesystem;
        });
        
        const loadContext = new SourceLoadContext(filesystem);
        return createScene(context, loadContext, this.id, `https://static.gaq9.com/maps/${this.id}/${this.id}.bsp`);
    }
}

const dodPathBase = `DayOfDefeat`;
class DayOfDefeatSceneDesc implements SceneDesc {
    constructor(public id: string, public name: string = id) {
    }

    public async createScene(device: GfxDevice, context: SceneContext) {
        const filesystem = await context.dataShare.ensureObject(`${dodPathBase}/SourceFileSystem`, async () => {
            const filesystem = new SourceFileSystem(context.dataFetcher);
            await Promise.all([
                filesystem.createVPKMount(`${dodPathBase}/dod/dod_pak`),
                filesystem.createVPKMount(`${dodPathBase}/hl2/hl2_textures`),
                filesystem.createVPKMount(`${dodPathBase}/hl2/hl2_misc`),
            ]);
            return filesystem;
        });

        const loadContext = new SourceLoadContext(filesystem);
        return createScene(context, loadContext, this.id, `https://static.gaq9.com/maps/${this.id}/${this.id}.bsp`);
    }
}

const id = 'TuesdayManifest';
const name = 'Tuesday Manifest';
const sceneDescs = [
    "Team Fortress 2",
    new TeamFortress2SceneDesc('tf_data'),
    new TeamFortress2SceneDesc('tf_data2'),
    new TeamFortress2SceneDesc('tf_data3'),
    new TeamFortress2SceneDesc('tf_data4'),
    new TeamFortress2SceneDesc('tf_data5'),
    new TeamFortress2SceneDesc('tf_data6'),
    new TeamFortress2SceneDesc('tf_data7'),
    "Half Life 2",
    new HalfLife2SceneDesc('hl2_data'),
    
    "Half Life 2: Episode 2",
    new HalfLife2Ep2SceneDesc('ep2_data'),
    new HalfLife2Ep2SceneDesc('ep2_data2'),
    
    "Counter Strike: Global Offense",
    new CounterStrikeGOSceneDesc('csgo_data'),
    new CounterStrikeGOSceneDesc('csgo_data2'),
    new CounterStrikeGOSceneDesc('csgo_data3'),
    
    "Day of Defeat",
    new DayOfDefeatSceneDesc('dod_data'),

    "Source Filmaker",


];

export const sceneGroup: SceneGroup = { id, name, sceneDescs };
