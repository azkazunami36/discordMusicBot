import { EventEmitter } from "../../../../scripts/class/EventEmitter.js";
import { PopupManager } from "../popupManager.js";
import { FileList } from "../../panel/List/FileList.js";
export declare class EditMusicAddFilePopup extends EventEmitter<{}> {
    popupManager: PopupManager;
    editMusicInfoAddFilePopup: HTMLElement;
    editMusicInfoAddFileTabManager: FileList;
    mainElement: HTMLElement;
    constructor(popupManager: PopupManager);
    view(func?: () => void): void;
    addAndClose(this: EditMusicAddFilePopup): void;
}
