export interface ClientSession {
    /** セッションIDを保持 */
    sessionid?: string;
    /** 再生中の曲 */
    musicuuid?: string;
    /** 再生に使用しているプレイリスト */
    playlistuuid?: string;
    /** 再生中のアルバム */
    albumuuid?: string;
    /** 再生中のアーティスト */
    artistuuid?: string;
    /** 再生状況。play, pauseの２つ */
    playstatus: string;
    /** 再生している曲の操作前の地点 */
    oldplaytime?: string;
    /** 再生している曲の現在地点 */
    playtime: string;
    /** 操作を加えられた場合。seek, pause, play, repeat, change, noの６つ */
    operating: string;
    /** クライアントでセッション情報を作成した時間 */
    nowtime: string;
}
