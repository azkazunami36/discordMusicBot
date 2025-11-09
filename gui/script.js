// class
import { ActiveElement } from "./scripts/class/ActiveElement.js";
import { TabManage } from "./htmlOperationScripts/class/TabManage.js";
import { MusicPlayerClass } from "./htmlOperationScripts/class/MusicPlayerClass.js";
import { FileTab } from "./htmlOperationScripts/class/tab/File.js";
import { PopupManager } from "./htmlOperationScripts/class/popup/popupManager.js";
import { MusicTab } from "./htmlOperationScripts/class/tab/Music.js";
addEventListener("load", async () => {
    const activeElement = new ActiveElement();
    const popupManager = new PopupManager(activeElement);
    const tabManage = new TabManage();
    const musicPlayerClass = new MusicPlayerClass();
    const FileListTab = new FileTab(activeElement, popupManager);
    const MusicListTab = new MusicTab(activeElement, popupManager, musicPlayerClass);
});
