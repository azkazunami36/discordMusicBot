import { ListManager } from "./ListManager.js";
import { formatFileSize } from "../../scripts/function/formatFileSize.js";
export class FileTabManager extends ListManager {
    listReflashing = false;
    constructor(fileTabWindow, fileListTable, activeElement) {
        super(fileTabWindow, fileTabWindow.getElementsByClassName("main")[0], fileListTable, activeElement);
        this.listItems = [
            { viewName: "ファイル名", name: "name" },
            { viewName: "日付", name: "date" },
            { viewName: "種類", name: "type" },
            { viewName: "サイズ", name: "size" }
        ];
    }
    async listReflash(callback) {
        if (this.listReflashing)
            return;
        this.listReflashing = true;
        this.listDatas = [];
        const query = {};
        query.type = "fileList";
        const url = window.location.origin + ":38671?" + new URLSearchParams(query);
        const init = {};
        init.method = "POST";
        const res = await fetch(url, init);
        const fileNameList = JSON.parse(await res.text());
        for (let i = 0; i < fileNameList.length; i++) {
            const fileName = fileNameList[i];
            callback?.(i, fileNameList.length);
            const query = {};
            query.type = "filePracticalInfo";
            query.fileName = fileName;
            const url = window.location.origin + ":38671?" + new URLSearchParams(query);
            const init = {};
            init.method = "POST";
            try {
                const res = await fetch(url, init);
                const filePracticalInfo = JSON.parse(await res.text());
                const date = new Date(filePracticalInfo.uploadDate);
                this.listDatas.push({
                    name: fileName,
                    date: date.getFullYear() + "/" + date.getMonth() + "/" + (date.getDate() + 1) + " " + date.getHours() + "時" + date.getMinutes() + "分",
                    type: "",
                    size: formatFileSize(filePracticalInfo.length)
                });
            }
            catch (e) {
                console.log(e);
            }
            {
                const query = {};
                query.type = "fileInfo";
                query.fileName = fileName;
                const url = window.location.origin + ":38671?" + new URLSearchParams(query);
                const init = {};
                init.method = "POST";
                try {
                    const res = await fetch(url, init);
                    const fileInfo = JSON.parse(await res.text());
                }
                catch (e) {
                    console.log(e);
                }
            }
        }
        this.listReflashing = false;
    }
}
;
