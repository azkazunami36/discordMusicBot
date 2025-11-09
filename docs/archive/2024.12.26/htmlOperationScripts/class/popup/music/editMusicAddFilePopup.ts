import { EventEmitter } from "../../../../scripts/class/EventEmitter.js";
import { PopupManager } from "../popupManager.js";
import { FileList } from "../../panel/List/FileList.js";

export class EditMusicAddFilePopup extends EventEmitter<{}> {
    popupManager: PopupManager;
    editMusicInfoAddFilePopup: HTMLElement;
    editMusicInfoAddFileTabManager: FileList;
    mainElement: HTMLElement;
    constructor(popupManager: PopupManager) {
        super();
        this.popupManager = popupManager;
        this.editMusicInfoAddFilePopup = document.getElementById("editMusicInfoAddFilePopup") as HTMLElement;
        this.mainElement = this.editMusicInfoAddFilePopup.getElementsByClassName("main")[0] as HTMLElement
        this.editMusicInfoAddFileTabManager = new FileList(this.editMusicInfoAddFilePopup, this.mainElement, this.popupManager.activeElement);
        const functionBarElement = this.editMusicInfoAddFilePopup.getElementsByClassName("functionbar")[0];
        const selectButton = functionBarElement.getElementsByClassName("selectButton")[0] as HTMLButtonElement;
        selectButton.addEventListener("click", () => { this.addAndClose(); });
        this.editMusicInfoAddFileTabManager.on("openedItem", () => { this.addAndClose(); });
    }
    view(func?: () => void) {
        this.editMusicInfoAddFileTabManager.listReflash(true);
        this.popupManager.view("editMusicInfoAddFilePopup", "window", func);
    }
    addAndClose(this: EditMusicAddFilePopup) {
        const fileName = this.editMusicInfoAddFileTabManager.selectItemGet();
        if (fileName) {
            // 編集データにサウンド情報を追加
            if (!this.popupManager.popupClassList.editMusicPopup.editingData) this.popupManager.popupClassList.editMusicPopup.editingData = {};
            const editingData = this.popupManager.popupClassList.editMusicPopup.editingData;
            if (!editingData.sounds) editingData.sounds = [];
            if (!editingData.sounds[0]) editingData.sounds[0] = { languagetype: "ja" };
            if (!editingData.sounds[0].filelist) editingData.sounds[0].filelist = [];
            if (!editingData.sounds[0].filelist.find(value => value.filename === fileName)) editingData.sounds[0].filelist.push({
                filename: fileName.name,
                filetypename: "default",
                filetype: "default",
                timediff: 0
            });
            // ポップアップを閉じる
            this.popupManager.close("editMusicInfoAddFilePopup", "window");
        }
    }
}
