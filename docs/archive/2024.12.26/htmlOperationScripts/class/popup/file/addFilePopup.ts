import { EventEmitter } from "../../../../scripts/class/EventEmitter.js";
import { serverRequest } from "../../../../scripts/function/serverRequest.js";
import { POSTData } from "../../../../scripts/interfaces/POSTData.js";
import { PopupManager } from "../popupManager.js";

export class AddFilePopup extends EventEmitter<{
    uploadStart: [];
    uploadEnd: [];
    refleshRequest: [];
}> {
    constructor(popupManager: PopupManager) {
        super();
        this.popupManager = popupManager;
        this.addFilePopupWindow = document.getElementById("addFilePopupWindow") as HTMLElement;
        this.fileInput = this.addFilePopupWindow.getElementsByClassName("fileInput")[0] as HTMLInputElement;
        this.buttonInput = this.addFilePopupWindow.getElementsByClassName("buttonInput")[0] as HTMLInputElement;
        this.buttonInput.addEventListener("click", async () => {
            const files = this.fileInput.files;
            if (files) {
                const fileNameList = JSON.parse(await serverRequest({ type: "fileList" })) as string[];
                for (const file of files) if (!fileNameList.includes(file.name)) this.addUploadQueue({ fileName: file.name, file: file });
                this.emit("refleshRequest");
                this.popupManager.close("addFilePopupWindow", "window");
            }
        });
    }
    popupManager: PopupManager;
    addFilePopupWindow: HTMLElement;
    fileInput: HTMLInputElement;
    buttonInput: HTMLInputElement;
    uploadQueue: { fileName: string, file: File }[] = [];
    private _uploading: { fileName: string, file: File } | undefined;
    private set uploading(value: { fileName: string, file: File } | undefined) { this._uploading = value; }
    get uploading() { return this._uploading; }
    private async uploadQueueReflash() {
        if (this.uploading) return;
        if (this.uploadQueue.length === 0) return;
        this.emit("uploadStart");
        this.uploading = this.uploadQueue.shift();
        if (this.uploading) {
            const query: POSTData = { type: "fileUpload", fileName: this.uploading.fileName };
            const url = window.location.origin + ":38671?" + new URLSearchParams(query);
            const init: RequestInit = {};
            init.method = "POST";
            init.body = this.uploading.file;
            this.emit("refleshRequest");
            await fetch(url, init);
        }
        this.uploading = undefined;
        this.emit("uploadEnd");
        this.emit("refleshRequest");
        this.uploadQueueReflash();
    }
    addUploadQueue(data: { fileName: string, file: File }) {
        this.uploadQueue.push(data);
        this.uploadQueueReflash();
    }
    view() {
        this.fileInput.value = "";
        this.popupManager.view("addFilePopupWindow", "window");
    }
}
