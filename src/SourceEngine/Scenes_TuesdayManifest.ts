
import { GfxDevice } from "../gfx/platform/GfxPlatform.js";
import { SceneContext, SceneDesc, SceneGroup } from "../SceneBase.js";
import { SourceFileSystem, SourceLoadContext } from "./Main.js";
import { createScene } from "./Scenes.js";
import { createKitchenSinkSourceFilesytem } from "./Scenes_FileDrops.js";

import { TeamFortress2SceneDesc, HalfLife2SceneDesc, HalfLife2Ep2SceneDesc, CounterStrikeGOSceneDesc, DayOfDefeatSceneDesc } from "./Scenes_SourceDescs.js";

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
    
    "Counter Strike: Global Offensive",
    new CounterStrikeGOSceneDesc('csgo_data'),
    new CounterStrikeGOSceneDesc('csgo_data2'),
    new CounterStrikeGOSceneDesc('csgo_data3'),
    
    "Day of Defeat",
    new DayOfDefeatSceneDesc('dod_data'),

    "Source Filmmaker",


];

export const sceneGroup: SceneGroup = { id, name, sceneDescs };
