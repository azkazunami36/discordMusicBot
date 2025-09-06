export type Upload = {
    /** ストリームを作成します。 */
    type: "streamCreate";
    /**
     * プレイヤーIDで使います。
     */
    playerId: string;
} | {
    /** ストリームの準備が整ったと知らせます。 */
    type: "streamReady";
    /**
     * プレイヤーIDで使います。
     */
    playerId: string;
} | {
    /** ストリームを破棄します。 */
    type: "streamEnd";
    /**
     * プレイヤーIDで使います。
     */
    playerId: string;
} | {
    /** プレイヤーにソースを設定します。 */
    type: "sourceSet";
    /** ファイルIDを入力します。 */
    fileId: string;
    /** プレイヤーIDを入力します。 */
    playerId: string;
    /** ファイルを入力します。 */
    buffer: ArrayBuffer;
} | {
    /** プレイヤーからソースをはずします。 */
    type: "sourceRemove";
    /** ファイルIDを入力します。 */
    fileId: string;
    /** プレイヤーIDを入力します。 */
    playerId: string;
} | {
    /** ソースの設定を変更します。 */
    type: "sourceConfig";
    /** ファイルIDを入力します。 */
    fileId: string;
    /** プレイヤーIDを入力します。 */
    playerId: string;
    /** 
     * 再生するかどうか選択します。指定しないと音が止まります。
     * 
     * Trueだとどんな状況でも再生し、最後まで再生されている場合は１から再生されます。
     */
    play?: boolean;
    /** 
     * 再生位置を設定します。
     * 
     * すぐに再生位置が変わります。playを指定しなくても再生されます。
     */
    playtime?: number;
    /** 音量を設定します。 */
    volume?: number;
    /** 速度を設定します。 */
    speed?: number;
    /** 音程を設定します。 */
    pitch?: number;
} | {
    /** ソースの状況を出力します。 */
    type: "sourceStatus";
    /** ファイルIDを入力します。 */
    fileId: string;
    /** プレイヤーIDを入力します。 */
    playerId: string;
}

export type Download = {
    /** 処理が成功したらTrue、そうでない場合や懸念点がある場合はFalseです。 */
    status: boolean;
    error?: Error;
    type?: "";
} | {
    /** 処理が成功したらTrue、そうでない場合や懸念点がある場合はFalseです。 */
    status: boolean;
    error?: Error;
    type: "sourceStatus";
    playing: boolean;
    volume: number;
    playtime: number;
    pitch: number;
    speed: number;
}
