export type POSTData = {
    type?: "fileUpload"
    | "fileList"
    | "filePracticalInfo"
    | "fileInfo"
    | "fileDelete"
    | "musicList"
    | "musicSearch"
    | "musicInfo"
    | "musicInfoCreate"
    | "musicInfoEdit"
    | "musicDelete"
    | "artistList"
    | "artistSearch"
    | "artistInfo"
    | "artistInfoCreate"
    | "artistInfoEdit"
    | "artistDelete"
    | "playList"
    | "playlistSearch"
    | "playlistInfo"
    | "playlistInfoCreate"
    | "playlistInfoEdit"
    | "playlistDelete"
    | "albumList"
    | "albumSearch"
    | "albumInfo"
    | "albumInfoCreate"
    | "albumInfoEdit"
    | "albumDelete"
    | "playHistory"
    | "sessionPing";
    /** 何らかの理由でGridFSまたはCollection内に直接アクセスする必要がある場合 */
    _id?: string;
    /** ファイルを指定する */
    fileName?: string;
    /** アルバムを指定する */
    albumuuid?: string;
    /** アルバムを検索する */
    albumname?: string;
    /** アーティストを指定する */
    artistuuid?: string;
    /** アーティストを検索する */
    artistname?: string;
    /** 曲を指定する */
    musicuuid?: string;
    /** 曲を検索する */
    musicname?: string;
    /** プレイリストを指定する */
    playlistuuid?: string;
    /** プレイリストを検索する */
    playlistname?: string;
    /** 年単位で絞る */
    year?: string;
    /** 月単位で絞る */
    month?: string;
    /** 日単位で絞る */
    day?: string;
    /** 時間単位で絞る */
    hour?: string;
    /** 分単位で絞る */
    miniute?: string;
    /** 秒単位で絞る */
    seconds?: string;
    /** 再生状況。play, pauseの２つ */
    playstatus?: string;
    /** 再生している曲の操作前の地点 */
    oldplaytime?: string;
    /** 再生している曲の現在地点 */
    playtime?: string;
    /** 編集を保存するためにJSONを格納する */
    editdata?: string;
    /** 操作を加えられた場合。seek, pause, play, repeat, changeの５つ */
    operating?: string;
    /** クライアントでセッション情報を作成した時間 */
    nowtime?: string;
};
