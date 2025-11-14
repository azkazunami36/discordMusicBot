"use client";


export default function main() {
    return (
        <main>
            <section id="main">
                <div className="tab tabList tabName-search">
                    <div className="functionbar">

                    </div>
                    <div className="main">

                    </div>
                </div>
                <div className="tab tabList tabName-dashboard active">
                    <div className="functionbar">

                    </div>
                    <div className="main">

                    </div>
                </div>
                <div className="tab tabList tabName-recommend">
                    <div className="functionbar">

                    </div>
                    <div className="main">

                    </div>
                </div>
                <div className="tab tabList tabName-history">
                    <div className="functionbar">

                    </div>
                    <div className="main">

                    </div>
                </div>
                <div className="tab tabList tabName-album">
                    <div className="functionbar">
                        <div className="button addMusicButton">
                            <div className="icon">
                                <span className="material-symbols-outlined">add</span>
                            </div>
                            <div className="text">アルバムを作成</div>
                        </div>
                        <div className="button">
                            <div className="icon">
                                <span className="material-symbols-outlined">edit</span>
                            </div>
                            <div className="text">編集</div>
                        </div>
                        <div className="button">
                            <div className="icon">
                                <span className="material-symbols-outlined">info</span>
                            </div>
                            <div className="text">情報</div>
                        </div>
                        <div className="button removeButton">
                            <div className="icon">
                                <span className="material-symbols-outlined">delete</span>
                            </div>
                            <div className="text">アルバムを削除</div>
                        </div>
                        <div className="button reFlashButton">
                            <div className="icon">
                                <span className="material-symbols-outlined">refresh</span>
                            </div>
                            <div className="text">再読み込み</div>
                        </div>
                    </div>
                    <div className="main">

                    </div>
                </div>
                <div className="tab tabList tabName-artist">
                    <div className="functionbar">

                    </div>
                    <div className="main">

                    </div>
                </div>
                <div id="musicListTabWindow" className="tab tabList tabName-music listTabWindow">
                    <div className="functionbar">
                        <div className="button addMusicButton">
                            <div className="icon">
                                <span className="material-symbols-outlined">add</span>
                            </div>
                            <div className="text">曲を作成</div>
                        </div>
                        <div className="button">
                            <div className="icon">
                                <span className="material-symbols-outlined">edit</span>
                            </div>
                            <div className="text">編集</div>
                        </div>
                        <div className="button">
                            <div className="icon">
                                <span className="material-symbols-outlined">info</span>
                            </div>
                            <div className="text">情報</div>
                        </div>
                        <div className="button removeButton">
                            <div className="icon">
                                <span className="material-symbols-outlined">delete</span>
                            </div>
                            <div className="text">曲を削除</div>
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
                <div className="tab tabList tabName-genre">
                    <div className="functionbar">

                    </div>
                    <div className="main">

                    </div>
                </div>
                <div id="fileTabWindow" className="tab tabList tabName-file fileTabWindow listTabWindow">
                    <div className="functionbar">
                        <div className="button addFileButton">
                            <div className="icon">
                                <span className="material-symbols-outlined">add</span>
                            </div>
                            <div className="text">追加</div>
                        </div>
                        <div className="button">
                            <div className="icon">
                                <span className="material-symbols-outlined">edit</span>
                            </div>
                            <div className="text">編集</div>
                        </div>
                        <div className="button">
                            <div className="icon">
                                <span className="material-symbols-outlined">info</span>
                            </div>
                            <div className="text">情報</div>
                        </div>
                        <div className="button removeButton">
                            <div className="icon">
                                <span className="material-symbols-outlined">delete</span>
                            </div>
                            <div className="text">削除</div>
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
            </section>
        </main>
    );
}
