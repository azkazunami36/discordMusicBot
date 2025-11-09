export class database {
    constructor() {
    }
    ;
    async folderSet() {
        const directoryHandle = await window.showDirectoryPicker();
        const entries = directoryHandle.values();
        for await (const entry of entries) {
        }
    }
    /**
     *
     */
    loadFileList(fileName) { }
    loadFileInfo(fileName) { }
    loadFile(fileName) { }
    saveFile(fileName, data) { }
    saveFileInfo(fileName, data) { }
}
