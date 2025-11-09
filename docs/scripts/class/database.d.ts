export declare class database {
    constructor();
    folderSet(): Promise<void>;
    /**
     *
     */
    loadFileList(fileName: string): void;
    loadFileInfo(fileName: string): void;
    loadFile(fileName: string): void;
    saveFile(fileName: string, data: string): void;
    saveFileInfo(fileName: string, data: string): void;
}
