import { ClientSession } from "../../scripts/interfaces/ClientSession.js";
import { EventEmitter } from "../../scripts/class/EventEmitter.js";
import { MusicInfo } from "../../scripts/interfaces/MusicInfo.js";
export declare class MusicPlayerClass extends EventEmitter<{
    play: [];
    pause: [];
    stop: [];
    next: [];
    previous: [];
    repeat: [];
}> {
    audioElement: HTMLAudioElement;
    buttonsElement: {
        footerElement: HTMLElement;
        playButton: HTMLElement | null;
        repeatButton: HTMLElement | null;
        seekBar: HTMLInputElement | null;
        nowTime: HTMLDivElement | null;
        maxTime: HTMLDivElement | null;
    };
    /**
     * 再生する予定の音楽をリストにしたもの。全てを置き換えたりすることができる。
     */
    playList: {
        /**
         * プレイリストから再生する場合プレイリストのuuidを指定する。
         */
        playlistuuid?: string;
        /**
         * アルバムから再生する場合アルバムのuuidを指定する。
         */
        albumuuid?: string;
        /**
         * アルバムアーティストが存在する場合はアーティストのuuidを指定する。
         */
        artistuuid?: string;
        list: {
            /**
             * ミュージックを再生する場合ミュージックのuuidを指定する。
             */
            musicuuid?: string;
            /**
             * ミュージックアーティストが存在する場合はアーティストのuuidを指定する。
             */
            artistuuid?: string;
            /**
             * ミュージック内のファイルを指定する。無い場合は0が指定される。
             */
            filesNumber?: number;
            /**
             * ファイルを再生する場合ファイル名を指定する。
             */
            filename?: string;
            /**
             * ファイルのストリーム番号を指定する。無い場合は0が指定される。この指定はファイルを再生するときだけでなく、ミュージック内のファイルを再生するときにも指定する必要がある。
             */
            streamNumber?: number;
            /**
             * ファイルストリームのキャッシュ。再生の上でネットアクセスの手間を省くために使用する。
             */
            streaminfocache?: {
                /** GridFSに保存されているファイル名です。 */
                originalfilename?: string;
                /** 非圧縮で変換したものです。 */
                flacfilename?: string;
                /** 圧縮で変換したものです。 */
                aacfilename?: string;
            }[];
            /**
             * ミュージックファイルリストのキャッシュ。再生の上でネットアクセスの手間を省くために使用する。
             */
            musicfilelistcache?: {
                /** ファイル名 */
                filename?: string;
                /** ファイルのデフォルトストリーム */
                defaultstream?: string;
                /** ファイルタイプ */
                filetype?: "default" | "instrumental" | "vocalonly";
                /** 遅延 */
                timediff?: number;
            }[];
        }[];
    };
    /**
     * プレイリストのどこを再生しているかを示す番号。0から始まる。
     */
    playNumber: number;
    /**
     * 再生する音楽の種類。flacかaacのどちらかを指定する。
     */
    playType: "flac" | "aac";
    /**
     * プレイリストをシャッフルするかどうか。
     */
    shuffle: boolean;
    /**
     * リピートするかどうか。
     */
    repeat: boolean;
    /**
     * シークバーの更新用インターバル
     */
    private interval;
    /**
     * シークバーを操作中かどうか
     */
    private seeking;
    constructor();
    /**
     * 時間をフォーマットする
     */
    private formatTime;
    /**
     * シークバーを再描画する
     */
    seekBarReDraw(): void;
    /**
     * 再生と停止を切り替える
     */
    playChange(): Promise<void>;
    /**
     * セッションデータの取得。oldplaytimeとoperatingは初期値のため、必要な場合に上書きする必要がある。
     */
    get sessionData(): ClientSession;
    /**
     * 再生中のファイル名を取得する
     */
    getPlayingFilename(): Promise<string | undefined>;
    /**
     * 再生中のストリーム内ファイル名を取得する
     */
    getPlayingStreamFilename(): Promise<{
        /** GridFSに保存されているファイル名です。 */
        originalfilename?: string;
        /** 非圧縮で変換したものです。 */
        flacfilename?: string;
        /** 圧縮で変換したものです。 */
        aacfilename?: string;
    } | undefined>;
    addAndPlay(musicInfos: MusicInfo[]): Promise<void>;
}
