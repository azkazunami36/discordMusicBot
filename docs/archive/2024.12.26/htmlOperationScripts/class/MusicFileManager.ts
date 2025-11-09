import { ActiveElement } from '../../scripts/class/ActiveElement.js';
import { POSTData } from '../../scripts/interfaces/POSTData.js';
import { ListManagerV2 } from './ListManager.js';
import { MusicInfo } from '../../scripts/interfaces/MusicInfo.js';

export class MusicFileManager extends ListManagerV2 {
    listReflashing: boolean = false;
    constructor(musicListTabWindow: HTMLElement, musicListTable: HTMLElement, activeElement: ActiveElement) {
        super(musicListTabWindow, musicListTabWindow.getElementsByClassName("main")[0] as HTMLElement, musicListTable, activeElement);
        this.listItems = [
            { viewName: "曲名", name: "name" },
            { viewName: "アーティスト", name: "artist" },
            { viewName: "追加した日付", name: "date" },
            { viewName: "編集した日付", name: "editdate" },
            { viewName: "タイプ", name: "type" },
            { viewName: "サイズ", name: "size" }
        ];
    };
    async listReflash() {
        if (this.listReflashing) return;
        this.listReflashing = true;
        this.listDatas = [];
        const query: POSTData = {};
        query.type = "musicList";
        const url = window.location.origin + ":38671?" + new URLSearchParams(query);

        const init: RequestInit = {};
        init.method = "POST";
        const res = await fetch(url, init);
        const musicList = JSON.parse(await res.text()) as string[];
        for (const musicuuid of musicList) {
            const query: POSTData = {};
            query.type = "musicInfo";
            query.musicuuid = musicuuid;
            const url = window.location.origin + ":38671?" + new URLSearchParams(query);

            const init: RequestInit = {};
            init.method = "POST";
            try {
                const res = await fetch(url, init);
                const text = await res.text();
                const musicInfo = JSON.parse(text) as MusicInfo;
                const date = new Date(Number(musicInfo.createdate) || 0);
                const editdate = new Date(Number(musicInfo.updatedate )|| 0);
                this.listDatas.push({
                    items: {
                        name: (musicInfo.infos || [{}])[0].musicname || "",
                        artist: musicInfo.artists?.map(artist => artist.artistuuid).join(",") || "",
                        date: date.getFullYear() + "/" + (date.getMonth() + 1) + "/" + date.getDate() + " " + date.getHours() + "時" + date.getMinutes() + "分",
                        editdate: editdate.getFullYear() + "/" + (editdate.getMonth() + 1) + "/" + editdate.getDate() + " " + editdate.getHours() + "時" + editdate.getMinutes() + "分",
                        type: "",
                        tempId: musicInfo._id || ""
                    },
                    clickedReturnData: musicInfo
                });
            } catch (e) {
                console.log(e);
            }
        }
        this.listReflashing = false;
    }
}
