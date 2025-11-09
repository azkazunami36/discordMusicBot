import { formatDate } from '../../../scripts/function/formatDate.js';
import { FileList } from '../panel/List/FileList.js';
export class FileTab extends FileList {
    constructor(activeElement, popupManager) {
        const fileTabWindow = document.getElementById("fileTabWindow");
        const mainElement = fileTabWindow.getElementsByClassName("main")[0];
        super(fileTabWindow, mainElement, activeElement);
        this.listReflash(true);
        const functionBarElement = fileTabWindow.getElementsByClassName("functionbar")[0];
        functionBarElement.getElementsByClassName("addFileButton")[0].addEventListener("click", async () => { popupManager.popupClassList.addFilePopup.view(); });
        functionBarElement.getElementsByClassName("reFlashButton")[0].addEventListener("click", async () => { this.listReflash(true); });
        functionBarElement.getElementsByClassName("removeButton")[0].addEventListener("click", async () => {
            const fileName = this.selectItemGet();
            if (!fileName)
                return;
            const query = {};
            query.type = "fileDelete";
            query.fileName = fileName.name;
            const url = window.location.origin + ":38671?" + new URLSearchParams(query);
            const init = {};
            init.method = "POST";
            const res = await fetch(url, init);
            await this.listReflash(true);
        });
        const addFilePopup = popupManager.popupClassList.addFilePopup;
        addFilePopup.on("refleshRequest", async () => {
            this.localList = [];
            for (const queueMetadata of addFilePopup.uploadQueue) {
                this.localList.push({
                    items: {
                        name: queueMetadata.fileName,
                        date: formatDate(new Date()),
                        type: "アップロード待機中",
                        size: ""
                    },
                    sortData: {
                        date: new Date().toString()
                    }
                });
            }
            if (addFilePopup.uploading)
                this.localList.push({
                    items: {
                        name: addFilePopup.uploading.fileName,
                        date: formatDate(new Date()),
                        type: "アップロード中...",
                        size: ""
                    },
                    sortData: {
                        date: new Date().toString()
                    }
                });
            await this.listReflash();
        });
    }
}
