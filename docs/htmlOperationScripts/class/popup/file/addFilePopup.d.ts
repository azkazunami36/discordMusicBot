import { EventEmitter } from "../../../../scripts/class/EventEmitter.js";
import { PopupManager } from "../popupManager.js";
export declare class AddFilePopup extends EventEmitter<{
    uploadStart: [];
    uploadEnd: [];
    refleshRequest: [];
}> {
    constructor(popupManager: PopupManager);
    popupManager: PopupManager;
    addFilePopupWindow: HTMLElement;
    fileInput: HTMLInputElement;
    buttonInput: HTMLInputElement;
    uploadQueue: {
        fileName: string;
        file: File;
    }[];
    private _uploading;
    private set uploading(value);
    get uploading(): {
        fileName: string;
        file: File;
    } | undefined;
    private uploadQueueReflash;
    addUploadQueue(data: {
        fileName: string;
        file: File;
    }): void;
    view(): void;
}
