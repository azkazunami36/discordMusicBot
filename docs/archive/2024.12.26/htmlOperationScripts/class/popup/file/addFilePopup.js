import { EventEmitter } from "../../../../scripts/class/EventEmitter.js";
import { serverRequest } from "../../../../scripts/function/serverRequest.js";
export class AddFilePopup extends EventEmitter {
    constructor(popupManager) {
        super();
        this.popupManager = popupManager;
        this.addFilePopupWindow = document.getElementById("addFilePopupWindow");
        this.fileInput = this.addFilePopupWindow.getElementsByClassName("fileInput")[0];
        this.buttonInput = this.addFilePopupWindow.getElementsByClassName("buttonInput")[0];
        this.buttonInput.addEventListener("click", async () => {
            const files = this.fileInput.files;
            if (files) {
                const fileNameList = JSON.parse(await serverRequest({ type: "fileList" }));
                for (const file of files)
                    if (!fileNameList.includes(file.name))
                        this.addUploadQueue({ fileName: file.name, file: file });
                this.emit("refleshRequest");
                this.popupManager.close("addFilePopupWindow", "window");
            }
        });
    }
    popupManager;
    addFilePopupWindow;
    fileInput;
    buttonInput;
    uploadQueue = [];
    _uploading;
    set uploading(value) { this._uploading = value; }
    get uploading() { return this._uploading; }
    async uploadQueueReflash() {
        if (this.uploading)
            return;
        if (this.uploadQueue.length === 0)
            return;
        this.emit("uploadStart");
        this.uploading = this.uploadQueue.shift();
        if (this.uploading) {
            const query = { type: "fileUpload", fileName: this.uploading.fileName };
            const url = window.location.origin + ":38671?" + new URLSearchParams(query);
            const init = {};
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
    addUploadQueue(data) {
        this.uploadQueue.push(data);
        this.uploadQueueReflash();
    }
    view() {
        this.fileInput.value = "";
        this.popupManager.view("addFilePopupWindow", "window");
    }
}
