import { ActiveElement } from '../../../scripts/class/ActiveElement';
import { formatDate } from '../../../scripts/function/formatDate.js';
import { POSTData } from '../../../scripts/interfaces/POSTData.js';
import { FileList } from '../panel/List/FileList.js';
import { PopupManager } from '../popup/popupManager.js';

export class FileTab extends FileList {
    constructor(activeElement: ActiveElement, popupManager: PopupManager) {
        const fileTabWindow = document.getElementById("fileTabWindow") as HTMLElement;
        const mainElement = fileTabWindow.getElementsByClassName("main")[0] as HTMLElement;
        super(fileTabWindow, mainElement, activeElement);
        this.listReflash(true);

        const functionBarElement = fileTabWindow.getElementsByClassName("functionbar")[0];
        functionBarElement.getElementsByClassName("addFileButton")[0].addEventListener("click", async () => { popupManager.popupClassList.addFilePopup.view(); });
        functionBarElement.getElementsByClassName("reFlashButton")[0].addEventListener("click", async () => { this.listReflash(true); });
        functionBarElement.getElementsByClassName("removeButton")[0].addEventListener("click", async () => {
            const fileName = (this.selectItemGet() as { name: string, date: string, type: string, size: string });
            if (!fileName) return;
            const query: POSTData = {};
            query.type = "fileDelete";
            query.fileName = fileName.name;
            const url = window.location.origin + ":38671?" + new URLSearchParams(query);
            const init: RequestInit = {};
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
            if (addFilePopup.uploading) this.localList.push({
                items: {
                    name: addFilePopup.uploading.fileName,
                    date: formatDate(new Date()),
                    type: "アップロード中...",
                    size: ""
                },
                sortData: {
                    date: new Date().toString()
                }
            })
            await this.listReflash();
        });
    }
}
