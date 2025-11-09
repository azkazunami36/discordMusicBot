import { ActiveElement } from "../../scripts/class/ActiveElement.js";
import { MusicFileManager } from "./MusicFileManager.js";
import { PopupManage } from "./PopupManage.js";
import { MusicInfo } from "../../scripts/interfaces/MusicInfo.js";
export declare class MainMusicFileManager extends MusicFileManager {
    editMusicInfoPopupWindow: HTMLElement;
    soundfilelist: HTMLDivElement;
    functionBarElement: HTMLElement;
    editMusicInfoAddFilePopup: HTMLElement;
    fileTabWindow: HTMLElement;
    constructor(activeElement: ActiveElement, popupManage: PopupManage);
    editingData: MusicInfo;
    musicTabWindow: HTMLElement;
}
