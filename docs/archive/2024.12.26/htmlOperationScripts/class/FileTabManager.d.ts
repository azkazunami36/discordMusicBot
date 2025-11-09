import { ActiveElement } from "../../scripts/class/ActiveElement.js";
import { ListManager } from "./ListManager.js";
export declare class FileTabManager extends ListManager {
    private listReflashing;
    constructor(fileTabWindow: HTMLElement, fileListTable: HTMLElement, activeElement: ActiveElement);
    listReflash(callback?: (loadedFileNo: number, total: number) => void): Promise<void>;
}
