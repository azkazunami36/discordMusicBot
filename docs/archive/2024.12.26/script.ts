// interface
import { MusicInfo } from "./scripts/interfaces/MusicInfo.js";

// class
import { ActiveElement } from "./scripts/class/ActiveElement.js";
import { TabManage } from "./htmlOperationScripts/class/TabManage.js";
import { MusicPlayerClass } from "./htmlOperationScripts/class/MusicPlayerClass.js";
import { FileTab } from "./htmlOperationScripts/class/tab/File.js";
import { PopupManager } from "./htmlOperationScripts/class/popup/popupManager.js";
import { MusicTab } from "./htmlOperationScripts/class/tab/Music.js";

// function

addEventListener("load", async () => {
    const activeElement = new ActiveElement();
    const popupManager = new PopupManager(activeElement);
    const tabManage = new TabManage();
    const FileListTab = new FileTab(activeElement, popupManager);
    const musicPlayerClass = new MusicPlayerClass(FileListTab);
    const MusicListTab = new MusicTab(activeElement, popupManager);
    FileListTab.on("selectItem", fileName => { console.log(fileName); });
});
