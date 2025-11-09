import { ActiveElement } from "../../../scripts/class/ActiveElement.js";
import { AddFilePopup } from "./file/addFilePopup.js";
import { EditMusicAddFilePopup } from "./music/editMusicAddFilePopup.js";
import { EditMusicPopup } from "./music/editMusicPopup.js";
export declare class PopupManager {
    popup: HTMLElement | null;
    popupList: {
        type: "full" | "window";
        element: HTMLElement;
        closed?: () => void;
    }[];
    popupClassList: {
        addFilePopup: AddFilePopup;
        editMusicPopup: EditMusicPopup;
        editMusicAddFilePopup: EditMusicAddFilePopup;
    };
    activeElement: ActiveElement;
    constructor(activeElement: ActiveElement);
    view(name: string, type: "window" | "full", closed?: () => void): void;
    close(name?: string, type?: "window" | "full"): void;
}
