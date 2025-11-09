import { EventEmitter } from "../../../../scripts/class/EventEmitter.js";
import { MusicInfo } from "../../../../scripts/interfaces/MusicInfo.js";
import { PopupManager } from "../popupManager.js";
export declare class EditMusicPopup extends EventEmitter<{
    refleshRequest: [];
}> {
    popupManager: PopupManager;
    editMusicInfoPopupWindow: HTMLElement;
    soundfilelistElement: HTMLDivElement;
    editingData: MusicInfo | undefined;
    constructor(popupManager: PopupManager);
    view(newItem?: boolean): void;
    fileListReflash(): void;
}
