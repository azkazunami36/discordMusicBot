import { EventEmitter } from "../../../../scripts/class/EventEmitter.js";
import { serverRequest } from "../../../../scripts/function/serverRequest.js";
import { MusicInfo } from "../../../../scripts/interfaces/MusicInfo.js";
import { PopupManager } from "../popupManager.js";

export class EditMusicPopup extends EventEmitter<{
    refleshRequest: [];
}> {
    popupManager: PopupManager;
    editMusicInfoPopupWindow: HTMLElement;
    soundfilelistElement: HTMLDivElement;
    editingData: MusicInfo | undefined;
    constructor(popupManager: PopupManager) {
        super();
        this.popupManager = popupManager;
        this.editMusicInfoPopupWindow = document.getElementById("editMusicInfoPopupWindow") as HTMLElement;
        this.soundfilelistElement = this.editMusicInfoPopupWindow.getElementsByClassName("soundfilelist")[0] as HTMLDivElement;
        const titleInput = this.editMusicInfoPopupWindow.getElementsByClassName("titleInput")[0] as HTMLInputElement;
        titleInput.addEventListener("input", () => {
            if (!this.editingData) this.editingData = {};
            if (!this.editingData.infos) this.editingData.infos = [];
            this.editingData.infos[0] = {
                musicname: titleInput.value,
                languagetype: "ja"
            };
            console.log(this.editingData);
        });
        this.editMusicInfoPopupWindow.getElementsByClassName("artistSettingButton")[0].addEventListener("click", () => {
            this.popupManager.close("editMusicInfoPopupWindow", "window");
            this.popupManager.view("artistSettingPopup", "window", () => { this.popupManager.view("editMusicInfoPopupWindow", "window"); });
        });
        this.editMusicInfoPopupWindow.getElementsByClassName("fileAddButton")[0].addEventListener("click", () => {
            this.popupManager.close("editMusicInfoPopupWindow", "window");
            this.popupManager.popupClassList.editMusicAddFilePopup.view(() => {
                this.fileListReflash();
                this.popupManager.view("editMusicInfoPopupWindow", "window");
            })
        });
        this.editMusicInfoPopupWindow.getElementsByClassName("saveButton")[0].addEventListener("click", async () => {
            if (!this.editingData) return;
            this.editingData.createdate = String(Date.now());
            this.editingData.updatedate = String(Date.now());
            const res = await serverRequest({
                type: "musicInfoCreate",
                editdata: JSON.stringify(this.editingData)
            });
            this.emit("refleshRequest");
            this.popupManager.close("editMusicInfoPopupWindow", "window");

        });
        this.editMusicInfoPopupWindow.getElementsByClassName("cancelButton")[0].addEventListener("click", () => {
            this.popupManager.close("editMusicInfoPopupWindow", "window");
        });
    }
    view(newItem?: boolean) {
        if (newItem) {
            this.editingData = {};
        }
        this.fileListReflash();
        this.popupManager.view("editMusicInfoPopupWindow", "window");
    }
    fileListReflash() {
        this.soundfilelistElement.innerHTML = "";
        if (this.editingData?.sounds?.[0].filelist) {
            for (const soundfile of this.editingData.sounds[0].filelist) {
                const soundfileElement = document.createElement("div");
                soundfileElement.classList.add("soundfile");
                soundfileElement.innerText = soundfile.filename || "";
                this.soundfilelistElement.appendChild(soundfileElement);
            }
        }
    }
}
