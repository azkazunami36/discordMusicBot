export class database {
    constructor() {

    };
    async folderSet() {
        const directoryHandle = await window.showDirectoryPicker();
        const entries = directoryHandle.values();
        for await (const entry of entries) {
        }
    }
    /**
     * 
     */
    loadFileList(fileName: string) {}
    loadFileInfo(fileName: string) {}
    loadFile(fileName: string) {}
    saveFile(fileName: string, data: string) {}
    saveFileInfo(fileName: string, data: string) {}
    
}
