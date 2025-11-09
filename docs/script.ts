// class
import { ActiveElement } from "./scripts/class/ActiveElement.js";
import { TabManage } from "./htmlOperationScripts/class/TabManage.js";
import { MusicPlayerClass } from "./htmlOperationScripts/class/MusicPlayerClass.js";
import { FileTab } from "./htmlOperationScripts/class/tab/File.js";
import { PopupManager } from "./htmlOperationScripts/class/popup/popupManager.js";
import { MusicTab } from "./htmlOperationScripts/class/tab/Music.js";

addEventListener("load", async () => {
    /** マウスでクリックされたHTMLElementを取得することができます。 */
    const activeElement = new ActiveElement();
    /** ポップアップの表示や非表示に関する管理をしています。 */
    const popupManager = new PopupManager(activeElement);
    /** タブの切り替えに利用します。(現在はクラス内部で全てを実行しています。) */
    const tabManage = new TabManage();
    /** ミュージックプレイヤーに関するシステムです。 */
    const musicPlayerClass = new MusicPlayerClass();
    /** ファイルリストのタブに関するシステムです。(現在はクラス内部で全てを実行しています。) */
    const FileListTab = new FileTab(activeElement, popupManager);
    /** ミュージックリストのタブに関するシステムです。 */
    const MusicListTab = new MusicTab(activeElement, popupManager, musicPlayerClass);
});
