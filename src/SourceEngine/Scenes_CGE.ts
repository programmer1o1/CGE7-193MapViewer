
import { GfxDevice } from "../gfx/platform/GfxPlatform.js";
import { SceneContext, SceneDesc, SceneGroup } from "../SceneBase.js";
import { SourceFileSystem, SourceLoadContext } from "./Main.js";
import { createScene } from "./Scenes.js";
import { createKitchenSinkSourceFilesytem } from "./Scenes_FileDrops.js";

const tf2PathBase = `TeamFortress2`;
const pathBase = `cge7-193`;

class CGESceneDesc implements SceneDesc {
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
        // use absolute URL for maps
        return createScene(context, loadContext, this.id, `https://static.gaq9.com/maps/${this.id}/${this.id}.bsp`);
    }
}

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
        // use absolute URL for maps
        return createScene(context, loadContext, this.id, `https://static.gaq9.com/maps/${this.id}/${this.id}.bsp`);
    }
}

class GarrysModSceneDesc implements SceneDesc {
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

const id = 'CGE';
const name = 'cge7-193';
const sceneDescs = [
    "Ask",
    new CGESceneDesc('ask_v1'),
    new CGESceneDesc('ask_v2'),
    new CGESceneDesc('ask_v3'),
    new CGESceneDesc('askask'),
    "Code Maps",
    new CGESceneDesc('souer'),
    new CGESceneDesc('plotmas'),
    new CGESceneDesc('belod'),
    new CGESceneDesc('speckle'),
    new CGESceneDesc('stal'),
    new CGESceneDesc('stork'),
    new CGESceneDesc('veritas'),
    new CGESceneDesc('blemor_e'),
    new CGESceneDesc('crishy_is'),
    "Ordinance",
    new CGESceneDesc('ordinance'),
    new CGESceneDesc('ord_afunc'),
    new CGESceneDesc('ord_bfunc'),
    new CGESceneDesc('ord_cfunc'),
    new CGESceneDesc('ord_xufunc'),
    new CGESceneDesc('ord_xdfunc'),
    new CGESceneDesc('ord_yufunc'),
    new CGESceneDesc('ord_ydfunc'),
    new CGESceneDesc('ord_zufunc'),
    new CGESceneDesc('ord_zdfunc'),
    new CGESceneDesc('ord_ren'),
    new CGESceneDesc('ord_error'),
    new CGESceneDesc('ord_cry'),
    new CGESceneDesc('ord_laugh'),
    new CGESceneDesc('ord_end'),
    "Sacrifice Maps",
    new CGESceneDesc('vul8ty7643'),
    new CGESceneDesc('vul3sdg66'),
    new CGESceneDesc('vulhkghd'),
    "Player Maps",
    new CGESceneDesc('funniman'),
    new CGESceneDesc('dill'),
    new CGESceneDesc('toaleken21'),
    new CGESceneDesc('dr_house'),
    "Maze",
    new CGESceneDesc('mazemazemazemaze'),
    new CGESceneDesc('coneconeconecone_v1'),
    new CGESceneDesc('coneconeconecone_v2'),
    new CGESceneDesc('coneconeconecone_anomi'),
    "Other",
    new CGESceneDesc('kulcs'),
    new CGESceneDesc('hi'),
    new CGESceneDesc('the'),
    new CGESceneDesc('quiz'),
    new CGESceneDesc('verlomisquoli'),
    new CGESceneDesc('2fort_v1'),
    new CGESceneDesc('2fort_v2'),
    new CGESceneDesc('2fort_v3'),
    new CGESceneDesc('noaccess_v1'),
    new CGESceneDesc('noaccess_v2'),
    new CGESceneDesc('view_v1'),
    new CGESceneDesc('view_v2'),
    new CGESceneDesc('kurt_v1'),
    new CGESceneDesc('kurt_v2'),
    new CGESceneDesc('pleasekill'),
    new CGESceneDesc('diediedie'),
    new CGESceneDesc('subroutine_hello'),
];

export const sceneGroup: SceneGroup = { id, name, sceneDescs };
