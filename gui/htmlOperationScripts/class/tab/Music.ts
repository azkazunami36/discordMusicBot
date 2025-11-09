import { ActiveElement } from '../../../scripts/class/ActiveElement';
import { formatDate } from '../../../scripts/function/formatDate.js';
import { serverRequest } from '../../../scripts/function/serverRequest.js';
import { MusicInfo } from '../../../scripts/interfaces/MusicInfo.js';
import { POSTData } from '../../../scripts/interfaces/POSTData.js';
import { MusicPlayerClass } from '../MusicPlayerClass.js';
import { MusicList } from '../panel/List/MusicList.js';
import { PopupManager } from '../popup/popupManager.js';

export class MusicTab extends MusicList {
    constructor(activeElement: ActiveElement, popupManager: PopupManager, musicPlayerClass: MusicPlayerClass) {
        const musicListTabWindow = document.getElementById("musicListTabWindow") as HTMLElement;
        const mainElement = musicListTabWindow.getElementsByClassName("main")[0] as HTMLElement;
        super(musicListTabWindow, mainElement, activeElement);
        this.listReflash(true);

        const functionBarElement = musicListTabWindow.getElementsByClassName("functionbar")[0];
        functionBarElement.getElementsByClassName("addMusicButton")[0].addEventListener("click", async () => { popupManager.popupClassList.editMusicPopup.view(true); });
        functionBarElement.getElementsByClassName("reFlashButton")[0].addEventListener("click", async () => { this.listReflash(true); });
        functionBarElement.getElementsByClassName("removeButton")[0].addEventListener("click", async () => {
            const musicuuid = (this.selectItemGet() as MusicInfo).musicuuid;
            if (!musicuuid) return;
            const res = await serverRequest({ type: "musicDelete", musicuuid: musicuuid });
            await this.listReflash(true);
        });
        const addFilePopup = popupManager.popupClassList.editMusicPopup;
        addFilePopup.on("refleshRequest", async () => {
            await this.listReflash();
        });
        this.on("openedItem", async () => {
            const musicInfo = this.selectItemGet() as MusicInfo;
            if (!musicInfo) return;
            await musicPlayerClass.addAndPlay([musicInfo]);
        });
    }
}
