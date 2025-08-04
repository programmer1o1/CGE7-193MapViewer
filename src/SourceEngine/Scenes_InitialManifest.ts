
import { GfxDevice } from "../gfx/platform/GfxPlatform.js";
import { SceneContext, SceneDesc, SceneGroup } from "../SceneBase.js";
import { SourceFileSystem, SourceLoadContext } from "./Main.js";
import { createScene } from "./Scenes.js";
import { createKitchenSinkSourceFilesytem } from "./Scenes_FileDrops.js";

import { TeamFortress2SceneDesc, CounterStrikeSourceSceneDesc } from "./Scenes_SourceDescs.js";


const id = 'InitialManifest';
const name = 'Initial Manifest';
const sceneDescs = [
    "Team Fortress 2",
    new TeamFortress2SceneDesc('fortress'),
    "Counter Strike: Source",
    new CounterStrikeSourceSceneDesc('cstrike'),
];

export const sceneGroup: SceneGroup = { id, name, sceneDescs };
