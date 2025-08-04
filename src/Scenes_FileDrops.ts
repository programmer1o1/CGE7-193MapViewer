
import { SceneDesc, SceneGfx } from "./viewer.js";
import ArrayBufferSlice from "./ArrayBufferSlice.js";
import { GfxDevice } from "./gfx/platform/GfxPlatform.js";
import { readString, flatten } from "./util.js";

import * as Yaz0 from './Common/Compression/Yaz0.js';
import * as CX from './Common/Compression/CX.js';
import * as SourceFileDrops from './SourceEngine/Scenes_FileDrops.js';
import { SceneContext } from "./SceneBase.js";
import { DataFetcher, NamedArrayBufferSlice } from "./DataFetcher.js";

function loadFileAsPromise(file: File, dataFetcher: DataFetcher): Promise<NamedArrayBufferSlice> {
    const progressMeter = dataFetcher.progressMeter!;

    const request = new FileReader();
    request.readAsArrayBuffer(file);

    return new Promise<NamedArrayBufferSlice>((resolve, reject) => {
        request.onload = () => {
            const buffer: ArrayBuffer = request.result as ArrayBuffer;
            const slice = new ArrayBufferSlice(buffer) as NamedArrayBufferSlice;
            slice.name = file.name;
            resolve(slice);
        };
        request.onerror = () => {
            reject();
        };
        request.onprogress = (e) => {
            if (e.lengthComputable)
                progressMeter.setProgress(e.loaded / e.total);
        };
    });
}

export function decompressArbitraryFile(buffer: ArrayBufferSlice): ArrayBufferSlice {
    const magic = readString(buffer, 0x00, 0x04);
    if (magic === 'Yaz0')
        return Yaz0.decompress(buffer);
    else if (magic.charCodeAt(0) === 0x10 || magic.charCodeAt(0) === 0x11)
        return CX.decompress(buffer);
    else
        return buffer;
}

async function loadArbitraryFile(context: SceneContext, buffer: ArrayBufferSlice): Promise<SceneGfx> {
    const device = context.device;

    buffer = await decompressArbitraryFile(buffer);
    const magic = readString(buffer, 0x00, 0x04);

    throw "whoops";
}

export async function createSceneFromFiles(context: SceneContext, buffers: NamedArrayBufferSlice[]): Promise<SceneGfx> {
    const device = context.device;

    buffers.sort((a, b) => a.name.localeCompare(b.name));

    const buffer = buffers[0];

    if (buffer.name.endsWith('.bsp') || buffer.name.endsWith('.gma'))
        return SourceFileDrops.createFileDropsScene(context, buffer); 

    throw "whoops";
}

export class DroppedFileSceneDesc implements SceneDesc {
    public id: string;
    public name: string;

    constructor(public files: File[]) {
        // Pick some file as the ID.
        const file = files[0];

        this.id = file.name;
        this.name = file.name;
    }

    public async createScene(device: GfxDevice, context: SceneContext): Promise<SceneGfx> {
        const dataFetcher = context.dataFetcher;
        const buffers = await Promise.all([...this.files].map((f) => loadFileAsPromise(f, dataFetcher)));
        return createSceneFromFiles(context, buffers);
    }
}

async function readAllDirEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
    function readDirEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
        return new Promise((resolve, reject) => {
            return reader.readEntries(resolve, reject);
        })
    }

    const entries: FileSystemEntry[] = [];
    // We need to keep calling readDirEntries until it returns nothing.
    while (true) {
        const result = await readDirEntries(reader);
        if (result.length === 0)
            break;
        for (let i = 0; i < result.length; i++)
            entries.push(result[i]);
    }

    return entries;
}

export interface FileWithPath extends File {
    path: string;
}

async function traverseFileSystemEntry(entry: FileSystemEntry, path: string = ''): Promise<FileWithPath[]> {
    if (entry.isDirectory) {
        const dirEntry = entry as FileSystemDirectoryEntry;
        const reader = dirEntry.createReader();
        const entries = await readAllDirEntries(reader);

        return traverseFileSystemEntryTree(entries, `${path}/${entry.name}`);
    } else if (entry.isFile) {
        const fileEntry = entry as FileSystemFileEntry;

        return new Promise((resolve, reject) => {
            fileEntry.file((file) => {
                // Inject our own path.
                const fileWithPath = file as FileWithPath;
                fileWithPath.path = path;
                resolve([fileWithPath]);
            }, (error) => {
                reject(error);
            });
        });
    } else {
        throw "whoops";
    }
}

async function traverseFileSystemEntryTree(entries: FileSystemEntry[], path: string): Promise<FileWithPath[]> {
    const files = await Promise.all(entries.map((entry) => {
        return traverseFileSystemEntry(entry, path);
    }));

    return flatten(files);
}

export async function traverseFileSystemDataTransfer(dataTransfer: DataTransfer): Promise<FileWithPath[]> {
    const items: DataTransferItem[] = [].slice.call(dataTransfer.items);

    if (items.length === 0)
        return [];

    const promises: Promise<FileWithPath[]>[] = [];
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item === null)
            continue;
        const entry = item.webkitGetAsEntry() as FileSystemEntry | null;
        if (entry === null)
            continue;
        promises.push(traverseFileSystemEntry(entry));
    }

    return flatten(await Promise.all(promises));
}
