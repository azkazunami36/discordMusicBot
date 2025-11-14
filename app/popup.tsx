"use client";

export default function popup() {
    return (
        <section id="popup" className="popup">
            <div className="popupWindow">
                <div className="headerToolBar">
                    <div className="closeButton">
                        <span className="material-symbols-outlined">close</span>
                    </div>
                </div>
                <div className="mainWindowList">
                    <div id="addFilePopupWindow" className="popupBody">
                        <div className="main">
                            <span className="material-symbols-outlined">upload_file</span>
                            <h1>ファイルを選択してアップロード</h1>
                            <input className="fileInput" type="file" multiple />
                            <input className="buttonInput" type="button" value="アップロード" />
                        </div>
                    </div>
                    <div id="editMusicInfoPopupWindow" className="popupBody">
                        <div className="main">
                            <h1>曲を作成</h1>
                            <div className="mainInfo">
                                <div className="image"></div>
                                <div className="right">
                                    <p>タイトル</p>
                                    <div className="title">
                                        <input className="titleInput" type="text" />
                                    </div>
                                    <div className="button buttonFullSize artistSettingButton">
                                        <div className="icon">
                                            <span className="material-symbols-outlined">settings</span>
                                        </div>
                                        <div className="text">アーティスト設定</div>
                                    </div>
                                </div>
                            </div>
                            <div className="info">
                                <h1>ファイル</h1>
                                <div className="soundfilelist"></div>
                                <div className="button fileAddButton">
                                    <div className="icon">
                                        <span className="material-symbols-outlined">add</span>
                                    </div>
                                    <div className="text">ファイルを追加</div>
                                </div>
                            </div>
                        </div>
                        <div className="footer">
                            <div className="button saveButton">
                                <div className="icon">
                                    <span className="material-symbols-outlined">save</span>
                                </div>
                                <div className="text">保存</div>
                            </div>
                            <div className="button cancelButton">
                                <div className="icon">
                                    <span className="material-symbols-outlined">cancel</span>
                                </div>
                                <div className="text">キャンセル</div>
                            </div>
                        </div>
                    </div>
                    <div id="editMusicInfoAddFilePopup" className="popupBody">
                        <div className="main">
                            <h1>ファイルを追加</h1>
                            <div className="fileTabWindow listTabWindow">
                                <div className="functionbar">
                                    <div className="button selectButton">
                                        <div className="icon">
                                            <span className="material-symbols-outlined">add</span>
                                        </div>
                                        <div className="text">選択</div>
                                    </div>
                                    <div className="button cancelButton">
                                        <div className="icon">
                                            <span className="material-symbols-outlined">cancel</span>
                                        </div>
                                        <div className="text">キャンセル</div>
                                    </div>
                                    <div className="button reFlashButton">
                                        <div className="icon">
                                            <span className="material-symbols-outlined">refresh</span>
                                        </div>
                                        <div className="text">再読み込み</div>
                                    </div>
                                </div>
                                <div className="main">
                                    <table>
                                        <thead>
                                            <tr>
                                                <td>名前</td>
                                                <td>種類</td>
                                                <td>追加日</td>
                                            </tr>
                                        </thead>
                                        <tbody>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div id="artistSettingPopup" className="popupBody">
                        <div className="main">
                            <h1>アーティスト設定</h1>
                            <div className="mainInfo">
                                <div className="image"></div>
                                <div className="right">
                                    <p>名前</p>
                                    <div className="name">
                                        <input className="nameInput" type="text" />
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="footer">
                            <div className="button saveButton">
                                <div className="icon">
                                    <span className="material-symbols-outlined">save</span>
                                </div>
                                <div className="text">保存</div>
                            </div>
                            <div className="button cancelButton">
                                <div className="icon">
                                    <span className="material-symbols-outlined">cancel</span>
                                </div>
                                <div className="text">キャンセル</div>
                            </div>
                        </div>
                    </div>
                    <div id="editAlbumInfoPopupWindow" className="popupBody">
                        <div className="main">
                            <h1>アルバムを作成</h1>
                            <div className="mainInfo">
                                <div className="image"></div>
                                <div className="right">
                                    <p>アルバム名</p>
                                    <div className="title">
                                        <input className="titleInput" type="text" />
                                    </div>
                                    <div className="button buttonFullSize artistSettingButton">
                                        <div className="icon">
                                            <span className="material-symbols-outlined">settings</span>
                                        </div>
                                        <div className="text">アーティスト設定</div>
                                    </div>
                                </div>
                            </div>
                            <div className="info">
                                <h1>ミュージック</h1>
                                <div className="soundfilelist"></div>
                                <div className="button fileAddButton">
                                    <div className="icon">
                                        <span className="material-symbols-outlined">add</span>
                                    </div>
                                    <div className="text">ミュージックを追加</div>
                                </div>
                            </div>
                        </div>
                        <div className="footer">
                            <div className="button saveButton">
                                <div className="icon">
                                    <span className="material-symbols-outlined">save</span>
                                </div>
                                <div className="text">保存</div>
                            </div>
                            <div className="button cancelButton">
                                <div className="icon">
                                    <span className="material-symbols-outlined">cancel</span>
                                </div>
                                <div className="text">キャンセル</div>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="popupFull">
                    <div className="headerToolBar">
                        <div className="closeButton">
                            <span className="material-symbols-outlined">close</span>
                        </div>
                    </div>
                    <div className="mainWindowList">
                    </div>
                </div>
            </div>
        </section>
    );
}
