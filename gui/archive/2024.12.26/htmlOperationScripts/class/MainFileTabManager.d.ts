import { ActiveElement } from "../../scripts/class/ActiveElement.js";
import { FileTabManager } from "./FileTabManager.js";
import { PopupManage } from "./PopupManage.js";
export declare class MainFileTabManager extends FileTabManager {
    private uploadQueue;
    queueProcessing: boolean;
    uploadQueueReflash(): Promise<void>;
    addUploadQueue(data: {
        fileName: string;
        file: File;
        tempId: string;
    }): void;
    fileTabWindow: HTMLElement;
    constructor(activeElement: ActiveElement, popupManage: PopupManage);
}
