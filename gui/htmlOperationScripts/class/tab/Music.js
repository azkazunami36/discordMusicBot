import { serverRequest } from '../../../scripts/function/serverRequest.js';
import { MusicList } from '../panel/List/MusicList.js';
export class MusicTab extends MusicList {
    constructor(activeElement, popupManager, musicPlayerClass) {
        const musicListTabWindow = document.getElementById("musicListTabWindow");
        const mainElement = musicListTabWindow.getElementsByClassName("main")[0];
        super(musicListTabWindow, mainElement, activeElement);
        this.listReflash(true);
        const functionBarElement = musicListTabWindow.getElementsByClassName("functionbar")[0];
        functionBarElement.getElementsByClassName("addMusicButton")[0].addEventListener("click", async () => { popupManager.popupClassList.editMusicPopup.view(true); });
        functionBarElement.getElementsByClassName("reFlashButton")[0].addEventListener("click", async () => { this.listReflash(true); });
        functionBarElement.getElementsByClassName("removeButton")[0].addEventListener("click", async () => {
            const musicuuid = this.selectItemGet().musicuuid;
            if (!musicuuid)
                return;
            const res = await serverRequest({ type: "musicDelete", musicuuid: musicuuid });
            await this.listReflash(true);
        });
        const addFilePopup = popupManager.popupClassList.editMusicPopup;
        addFilePopup.on("refleshRequest", async () => {
            await this.listReflash();
        });
        this.on("openedItem", async () => {
            const musicInfo = this.selectItemGet();
            if (!musicInfo)
                return;
            await musicPlayerClass.addAndPlay([musicInfo]);
        });
    }
}
