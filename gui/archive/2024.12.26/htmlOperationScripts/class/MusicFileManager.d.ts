import { ActiveElement } from '../../scripts/class/ActiveElement.js';
import { ListManagerV2 } from './ListManager.js';
export declare class MusicFileManager extends ListManagerV2 {
    listReflashing: boolean;
    constructor(musicListTabWindow: HTMLElement, musicListTable: HTMLElement, activeElement: ActiveElement);
    listReflash(): Promise<void>;
}
