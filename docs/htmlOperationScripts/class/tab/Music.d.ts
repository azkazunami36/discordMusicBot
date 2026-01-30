import { ActiveElement } from '../../../scripts/class/ActiveElement';
import { MusicPlayerClass } from '../MusicPlayerClass.js';
import { MusicList } from '../panel/List/MusicList.js';
import { PopupManager } from '../popup/popupManager.js';
export declare class MusicTab extends MusicList {
    constructor(activeElement: ActiveElement, popupManager: PopupManager, musicPlayerClass: MusicPlayerClass);
}
