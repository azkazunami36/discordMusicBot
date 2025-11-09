import { MusicFileManager } from "./MusicFileManager.js";
import { FileTabManager } from "./FileTabManager.js";
export class MainMusicFileManager extends MusicFileManager {
    editMusicInfoPopupWindow;
    soundfilelist;
    functionBarElement;
    editMusicInfoAddFilePopup;
    fileTabWindow;
    constructor(activeElement, popupManage) {
        super(document.getElementById("musicListTabWindow"), document.getElementById("musicListTabWindow").getElementsByClassName("main")[0], activeElement);
        this.musicTabWindow = document.getElementById("musicListTabWindow");
        this.listReflash().then(() => {
            this.listReDraw();
        });
        this.editMusicInfoPopupWindow = document.getElementById("editMusicInfoPopupWindow");
        if (this.musicTabWindow && this.editMusicInfoPopupWindow) {
            this.soundfilelist = this.editMusicInfoPopupWindow.getElementsByClassName("soundfilelist")[0];
            function fileListReDraw() {
                console.log(this, this.editingData.sounds?.[0]?.filelist);
                this.soundfilelist.innerHTML = "";
                if (!this.editingData.sounds)
                    this.editingData.sounds = [];
                if (!this.editingData.sounds[0])
                    this.editingData.sounds[0] = { languagetype: "ja", filelist: [] };
                const filelist = this.editingData.sounds[0].filelist;
                if (filelist)
                    for (const file of filelist) {
                        const div = document.createElement("div");
                        if (!file.filename)
                            continue;
                        div.innerText = file.filename;
                        this.soundfilelist.appendChild(div);
                    }
            }
            this.functionBarElement = this.musicTabWindow.getElementsByClassName("functionbar")[0];
            if (this.functionBarElement) {
                const addMusicButton = this.functionBarElement.getElementsByClassName("addMusicButton")[0];
                if (addMusicButton) {
                    addMusicButton.addEventListener("click", async () => {
                        this.editingData = {};
                        const editMusicInfoPopupWindow = document.getElementById("editMusicInfoPopupWindow");
                        if (editMusicInfoPopupWindow) {
                            const titleInput = editMusicInfoPopupWindow.getElementsByClassName("titleInput")[0];
                            if (titleInput) {
                                titleInput.value = "";
                            }
                        }
                        fileListReDraw.bind(this)();
                        popupManage.view("editMusicInfoPopupWindow", "window");
                    });
                }
                ;
                const reFlashButton = this.functionBarElement.getElementsByClassName("reFlashButton")[0];
                if (reFlashButton) {
                    reFlashButton.addEventListener("click", async () => {
                        const musicListTBody = this.musicTabWindow.getElementsByTagName("tbody")[0];
                        console.log(musicListTBody);
                        if (musicListTBody)
                            musicListTBody.innerHTML = "読み込み中...";
                        await this.listReflash();
                        this.listReDraw();
                    });
                }
                ;
                const removeButton = this.functionBarElement.getElementsByClassName("removeButton")[0];
                if (removeButton) {
                    removeButton.addEventListener("click", async () => {
                        const info = this.selectItemGet();
                        console.log(info);
                        if (this.tableElement && info) {
                            const query = {};
                            query.type = "musicDelete";
                            query.musicuuid = info.musicuuid;
                            const url = window.location.origin + ":38671?" + new URLSearchParams(query);
                            const init = {};
                            init.method = "POST";
                            const res = await fetch(url, init);
                            await this.listReflash();
                            this.listReDraw();
                        }
                    });
                }
            }
            ;
            this.editMusicInfoAddFilePopup = document.getElementById("editMusicInfoAddFilePopup");
            if (this.editMusicInfoAddFilePopup) {
                let editMusicInfoAddFileTabManager;
                if (this.editMusicInfoPopupWindow) {
                    // タイトル入力フィールドの設定
                    const titleInput = this.editMusicInfoPopupWindow.getElementsByClassName("titleInput")[0];
                    titleInput.addEventListener("input", () => {
                        // タイトル入力時に編集データを更新
                        if (!this.editingData.infos)
                            this.editingData.infos = [];
                        this.editingData.infos[0] = {
                            musicname: titleInput.value,
                            languagetype: "ja"
                        };
                        console.log(this.editingData);
                    });
                    // アーティスト設定ボタンの設定
                    const artistSettingButton = this.editMusicInfoPopupWindow.getElementsByClassName("artistSettingButton")[0];
                    artistSettingButton.addEventListener("click", () => {
                        const artistSettingPopup = document.getElementById("artistSettingPopup");
                        const infoInArtist = [];
                        infoInArtist[0];
                        if (artistSettingPopup) {
                            // アーティスト設定ポップアップの保存ボタンの設定
                            const saveButton = artistSettingPopup.getElementsByClassName("saveButton")[0];
                            saveButton.addEventListener("click", () => {
                                popupManage.close("artistSettingPopup", "window");
                            });
                            // アーティスト設定ポップアップのキャンセルボタンの設定
                            const cancelButton = artistSettingPopup.getElementsByClassName("cancelButton")[0];
                            cancelButton.addEventListener("click", () => {
                                popupManage.close("artistSettingPopup", "window");
                            });
                        }
                        // アーティスト設定ポップアップを表示
                        popupManage.close("editMusicInfoPopupWindow", "window");
                        popupManage.view("artistSettingPopup", "window", () => {
                            popupManage.view("editMusicInfoPopupWindow", "window");
                        });
                    });
                    // ファイル追加ボタンの設定
                    const fileAddButton = this.editMusicInfoPopupWindow.getElementsByClassName("fileAddButton")[0];
                    fileAddButton.addEventListener("click", () => {
                        popupManage.close("editMusicInfoPopupWindow", "window");
                        editMusicInfoAddFileTabManager?.listReflash().then(() => {
                            editMusicInfoAddFileTabManager?.listReDraw();
                        });
                        popupManage.view("editMusicInfoAddFilePopup", "window", () => {
                            fileListReDraw.bind(this)();
                            popupManage.view("editMusicInfoPopupWindow", "window");
                        });
                    });
                    // 保存ボタンの設定
                    const saveButton = this.editMusicInfoPopupWindow.getElementsByClassName("saveButton")[0];
                    saveButton.addEventListener("click", async () => {
                        // 保存ボタンがクリックされたときの処理
                        const query = {};
                        query.type = "musicInfoCreate";
                        this.editingData.createdate = String(Date.now());
                        this.editingData.updatedate = String(Date.now());
                        query.editdata = JSON.stringify(this.editingData);
                        const url = window.location.origin + ":38671?" + new URLSearchParams(query);
                        const init = {};
                        init.method = "POST";
                        try {
                            const res = await fetch(url, init);
                            const text = await res.text();
                            console.log(text);
                        }
                        catch (error) {
                            console.error("Error:", error);
                        }
                        popupManage.close("editMusicInfoPopupWindow", "window");
                    });
                    // キャンセルボタンの設定
                    const cancelButton = this.editMusicInfoPopupWindow.getElementsByClassName("cancelButton")[0];
                    cancelButton.addEventListener("click", () => {
                        popupManage.close("editMusicInfoPopupWindow", "window");
                    });
                }
                this.fileTabWindow = this.editMusicInfoAddFilePopup.getElementsByClassName("fileTabWindow")[0];
                if (this.fileTabWindow) {
                    const fileListTable = this.fileTabWindow.getElementsByTagName("table")[0];
                    const fileListTBody = this.fileTabWindow.getElementsByTagName("tbody")[0];
                    editMusicInfoAddFileTabManager = new FileTabManager(this.fileTabWindow, fileListTable, activeElement);
                    const functionBarElement = this.fileTabWindow.getElementsByClassName("functionbar")[0];
                    if (functionBarElement) {
                        // ファイル選択ボタンの設定
                        const selectButton = functionBarElement.getElementsByClassName("selectButton")[0];
                        if (selectButton) {
                            /**
                             * @this {MainMusicFileManager}
                             */
                            function addAndClose() {
                                const fileName = editMusicInfoAddFileTabManager?.selectNameGet();
                                if (fileName) {
                                    // 編集データにサウンド情報を追加
                                    if (!this.editingData.sounds)
                                        this.editingData.sounds = [];
                                    if (!this.editingData.sounds[0])
                                        this.editingData.sounds[0] = { languagetype: "ja" };
                                    if (!this.editingData.sounds[0].filelist)
                                        this.editingData.sounds[0].filelist = [];
                                    if (!this.editingData.sounds[0].filelist.find(value => value.filename === fileName))
                                        this.editingData.sounds[0].filelist.push({
                                            filename: fileName,
                                            filetypename: "default",
                                            filetype: "default",
                                            timediff: 0
                                        });
                                    fileListReDraw.bind(this)();
                                    // ポップアップを閉じる
                                    popupManage.close("editMusicInfoAddFilePopup", "window");
                                }
                            }
                            selectButton.addEventListener("click", () => {
                                addAndClose.bind(this)();
                            });
                            editMusicInfoAddFileTabManager.on("doubleClick", () => {
                                addAndClose.bind(this)();
                            });
                            editMusicInfoAddFileTabManager.on("openedItem", () => {
                                addAndClose.bind(this)();
                            });
                        }
                        // キャンセルボタンの設定
                        const cancelButton = functionBarElement.getElementsByClassName("cancelButton")[0];
                        if (cancelButton) {
                            cancelButton.addEventListener("click", () => {
                                popupManage.close("editMusicInfoAddFilePopup", "window");
                            });
                        }
                        // リフレッシュボタンの設定
                        const reFlashButton = functionBarElement.getElementsByClassName("reFlashButton")[0];
                        if (reFlashButton) {
                            reFlashButton.addEventListener("click", async () => {
                                fileListTBody.innerHTML = "読み込み中...";
                                await editMusicInfoAddFileTabManager?.listReflash();
                                editMusicInfoAddFileTabManager?.listReDraw();
                            });
                        }
                    }
                }
            }
        }
        ;
    }
    // 編集データとファイルタブマネージャの初期化
    editingData = {};
    musicTabWindow;
}
