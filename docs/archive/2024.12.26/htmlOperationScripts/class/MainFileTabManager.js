import { FileTabManager } from "./FileTabManager.js";
export class MainFileTabManager extends FileTabManager {
    uploadQueue = [];
    queueProcessing = false;
    async uploadQueueReflash() {
        if (this.queueProcessing)
            return;
        this.queueProcessing = true;
        if (this.uploadQueue.length === 0)
            return;
        const file = this.uploadQueue[0];
        this.uploadQueue.shift();
        const query = { type: "fileUpload", fileName: file.fileName };
        const url = window.location.origin + ":38671?" + new URLSearchParams(query);
        const init = {};
        init.method = "POST";
        init.body = file.file;
        this.listReDraw();
        await fetch(url, init);
        this.localList = this.localList.filter(item => item.tempId !== file.tempId);
        await this.listReflash();
        this.listReDraw();
        this.queueProcessing = false;
        this.uploadQueueReflash();
    }
    addUploadQueue(data) {
        this.uploadQueue.push(data);
        this.uploadQueueReflash();
    }
    fileTabWindow;
    constructor(activeElement, popupManage) {
        super(document.getElementById("fileTabWindow"), document.getElementById("fileTabWindow").getElementsByTagName("table")[0], activeElement);
        this.fileTabWindow = document.getElementById("fileTabWindow");
        this.listReflash((i, total) => {
            document.getElementById("fileTabWindow").getElementsByTagName("tbody")[0].innerHTML = "読み込み中... (" + i + "/" + total + "個完了)";
        }).then(() => {
            this.listReDraw();
        });
        if (this.fileTabWindow) {
            const functionBarElement = this.fileTabWindow.getElementsByClassName("functionbar")[0];
            if (functionBarElement) {
                const addFileButton = functionBarElement.getElementsByClassName("addFileButton")[0];
                if (addFileButton) {
                    addFileButton.addEventListener("click", async () => {
                        const addFilePopupWindow = document.getElementById("addFilePopupWindow");
                        if (addFilePopupWindow) {
                            const fileInput = addFilePopupWindow.getElementsByClassName("fileInput")[0];
                            if (fileInput) {
                                fileInput.value = "";
                            }
                        }
                        popupManage.view("addFilePopupWindow", "window");
                    });
                }
                ;
                const reFlashButton = functionBarElement.getElementsByClassName("reFlashButton")[0];
                if (reFlashButton) {
                    reFlashButton.addEventListener("click", async () => {
                        const fileListTBody = this.fileTabWindow.getElementsByTagName("tbody")[0];
                        if (fileListTBody)
                            fileListTBody.innerHTML = "読み込み中...";
                        await this.listReflash((i, total) => {
                            fileListTBody.innerHTML = "読み込み中... (" + i + "/" + total + "個完了)";
                        });
                        this.listReDraw();
                    });
                }
                ;
                const removeButton = functionBarElement.getElementsByClassName("removeButton")[0];
                if (removeButton) {
                    removeButton.addEventListener("click", async () => {
                        const fileName = this.selectNameGet();
                        if (!fileName)
                            return;
                        const query = {};
                        query.type = "fileDelete";
                        query.fileName = fileName;
                        const url = window.location.origin + ":38671?" + new URLSearchParams(query);
                        const init = {};
                        init.method = "POST";
                        const res = await fetch(url, init);
                        await this.listReflash();
                        this.listReDraw();
                    });
                }
            }
            ;
        }
        ;
        const addFilePopupWindow = document.getElementById("addFilePopupWindow");
        if (addFilePopupWindow) {
            const fileInput = addFilePopupWindow.getElementsByClassName("fileInput")[0];
            const buttonInput = addFilePopupWindow.getElementsByClassName("buttonInput")[0];
            if (fileInput && buttonInput) {
                buttonInput.addEventListener("click", async () => {
                    const files = fileInput.files;
                    if (!files)
                        return;
                    popupManage.close();
                    for (const file of files) {
                        async function fileList() {
                            const query = {};
                            query.type = "fileList";
                            const url = window.location.origin + ":38671?" + new URLSearchParams(query);
                            const init = {};
                            init.method = "POST";
                            const res = await fetch(url, init);
                            const text = JSON.parse(await res.text());
                            return text;
                        }
                        ;
                        const fileNameList = await fileList();
                        const fileName = file.name.replaceAll(" ", "+");
                        const exist = fileNameList.includes(fileName);
                        console.log(exist, fileName);
                        if (exist)
                            continue;
                        const tempId = fileName + Math.floor(Math.random() * 999999);
                        const date = new Date();
                        this.localList.push({
                            name: fileName,
                            type: "アップロード中",
                            tempId: tempId,
                            date: date.getFullYear() + "/" + date.getMonth() + "/" + (date.getDate() + 1) + " " + date.getHours() + "時" + date.getMinutes() + "分"
                        });
                        this.addUploadQueue({ fileName, file, tempId });
                    }
                });
            }
        }
        ;
    }
}
