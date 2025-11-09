import { ActiveElement } from "../../../../scripts/class/ActiveElement.js";
import { formatFileSize } from "../../../../scripts/function/formatFileSize.js";
import { serverRequest } from "../../../../scripts/function/serverRequest.js";
import { formatDate } from "../../../../scripts/function/formatDate.js";
import { ListPanel } from "./List.js";

export class FileList extends ListPanel {
    constructor(firstElement: HTMLElement, mainElement: HTMLElement, activeElement: ActiveElement) {
        super(firstElement, mainElement, activeElement);
        this.listItems = [
            { viewName: "ファイル名", name: "name" },
            { viewName: "日付", name: "date" },
            { viewName: "種類", name: "type" },
            { viewName: "サイズ", name: "size" }
        ];
        this.refleshRequest = async progress => {
            const text = await serverRequest({ type: "fileList" });
            const fileNameList = JSON.parse(text) as string[];
            for (let i = 0; i < fileNameList.length; i++) {
                progress({ now: i, total: fileNameList.length });
                const fileName = fileNameList[i];
                const filePracticalInfo = JSON.parse(await serverRequest({ type: "filePracticalInfo", fileName: fileName })) as {
                    _id: string;
                    filename: string;
                    length: number;
                    uploadDate: string;
                    chunkSize: number;
                };
                const date = new Date(filePracticalInfo.uploadDate);
                this.listDatas.push({
                    items: {
                        name: fileName,
                        date: formatDate(date),
                        type: "",
                        size: formatFileSize(filePracticalInfo.length)
                    },
                    sortData: {
                        date: new Date().toString(),
                        size: String(filePracticalInfo.length)
                    }
                });
            }
        }
    }
}
