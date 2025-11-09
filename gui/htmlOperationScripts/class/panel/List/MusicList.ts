import { ActiveElement } from "../../../../scripts/class/ActiveElement.js";
import { formatDate } from "../../../../scripts/function/formatDate.js";
import { serverRequest } from "../../../../scripts/function/serverRequest.js";
import { MusicInfo } from "../../../../scripts/interfaces/MusicInfo.js";
import { ListPanel } from "./List.js";

export class MusicList extends ListPanel {
    constructor(firstElement: HTMLElement, mainElement: HTMLElement, activeElement: ActiveElement) {
        super(firstElement, mainElement, activeElement);
        this.listItems = [
            { viewName: "曲名", name: "name" },
            { viewName: "アーティスト", name: "artist" },
            { viewName: "追加した日付", name: "date" },
            { viewName: "編集した日付", name: "editdate" },
            { viewName: "タイプ", name: "type" },
            { viewName: "サイズ", name: "size" }
        ];
        this.refleshRequest = async progress => {
            const text = await serverRequest({ type: "musicList" });
            const musicList = JSON.parse(text) as string[];
            for (let i = 0; i < musicList.length; i++) {
                progress({ now: i, total: musicList.length });
                const musicuuid = musicList[i];
                const musicInfo = JSON.parse(await serverRequest({ type: "musicInfo", musicuuid: musicuuid })) as MusicInfo;
                const date = new Date(Number(musicInfo.createdate) || 0);
                const editdate = new Date(Number(musicInfo.updatedate) || 0);
                this.listDatas.push({
                    items: {
                        name: (musicInfo.infos || [{}])[0].musicname || "",
                        artist: musicInfo.artists?.map(artist => artist.artistuuid).join(",") || "",
                        date: formatDate(date),
                        editdate: formatDate(editdate),
                        type: "",
                        size: ""
                    },
                    clickedReturnData: musicInfo
                });
            }
        }
    }
}
