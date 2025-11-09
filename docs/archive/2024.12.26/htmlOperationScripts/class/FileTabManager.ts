import { ActiveElement } from "../../scripts/class/ActiveElement.js";
import { ListManager } from "./ListManager.js";

import { positionMath } from "../../scripts/function/PositionMath.js";
import { formatFileSize } from "../../scripts/function/formatFileSize.js";

import { FileInfo } from "../../scripts/interfaces/FileInfo.js";
import { POSTData } from "../../scripts/interfaces/POSTData.js";

export class FileTabManager extends ListManager {
    private listReflashing = false;
    constructor(fileTabWindow: HTMLElement, fileListTable: HTMLElement, activeElement: ActiveElement) {
        super(fileTabWindow, fileTabWindow.getElementsByClassName("main")[0] as HTMLElement, fileListTable, activeElement);
        this.listItems = [
            { viewName: "ファイル名", name: "name" },
            { viewName: "日付", name: "date" },
            { viewName: "種類", name: "type" },
            { viewName: "サイズ", name: "size" }
        ];
    }
    async listReflash(callback?: (loadedFileNo: number, total: number) => void) {
        if (this.listReflashing) return;
        this.listReflashing = true;
        this.listDatas = [];
        const query: POSTData = {};
        query.type = "fileList";
        const url = window.location.origin + ":38671?" + new URLSearchParams(query);

        const init: RequestInit = {};
        init.method = "POST";
        const res = await fetch(url, init);
        const fileNameList = JSON.parse(await res.text()) as string[];
        for (let i = 0; i < fileNameList.length; i++) {
            const fileName = fileNameList[i];
            callback?.(i, fileNameList.length);
            const query: POSTData = {};
            query.type = "filePracticalInfo";
            query.fileName = fileName;
            const url = window.location.origin + ":38671?" + new URLSearchParams(query);

            const init: RequestInit = {};
            init.method = "POST";
            try {
                const res = await fetch(url, init);
                const filePracticalInfo = JSON.parse(await res.text()) as {
                    _id: string;
                    filename: string;
                    length: number;
                    uploadDate: string;
                    chunkSize: number;
                };
                const date = new Date(filePracticalInfo.uploadDate);
                this.listDatas.push({
                    name: fileName,
                    date: date.getFullYear() + "/" + date.getMonth() + "/" + (date.getDate() + 1) + " " + date.getHours() + "時" + date.getMinutes() + "分",
                    type: "",
                    size: formatFileSize(filePracticalInfo.length)
                });
            } catch (e) {
                console.log(e);
            }
            {
                const query: POSTData = {};
                query.type = "fileInfo";
                query.fileName = fileName;
                const url = window.location.origin + ":38671?" + new URLSearchParams(query);

                const init: RequestInit = {};
                init.method = "POST";
                try {
                    const res = await fetch(url, init);
                    const fileInfo = JSON.parse(await res.text()) as FileInfo;
                } catch (e) {
                    console.log(e);
                }
            }
        }
        this.listReflashing = false;
    }
};
