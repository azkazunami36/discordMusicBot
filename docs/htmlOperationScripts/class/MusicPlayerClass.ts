import { FileInfo } from "../../scripts/interfaces/FileInfo.js";
import { POSTData } from "../../scripts/interfaces/POSTData.js";
import { ClientSession } from "../../scripts/interfaces/ClientSession.js";
import { EventEmitter } from "../../scripts/class/EventEmitter.js";
import { FileTab } from "./tab/File.js";
import { MusicInfo } from "../../scripts/interfaces/MusicInfo.js";
import { serverRequest } from "../../scripts/function/serverRequest.js";

export class MusicPlayerClass extends EventEmitter<{
    play: [];
    pause: [];
    stop: [];
    next: [];
    previous: [];
    repeat: [];
}> {
    audioElement: HTMLAudioElement = document.createElement("audio");
    buttonsElement: {
        footerElement: HTMLElement;
        playButton: HTMLElement | null;
        repeatButton: HTMLElement | null;
        seekBar: HTMLInputElement | null;
        nowTime: HTMLDivElement | null;
        maxTime: HTMLDivElement | null;
    } = {
            footerElement: document.getElementsByTagName("footer")[0],
            playButton: null,
            repeatButton: null,
            seekBar: null,
            nowTime: null,
            maxTime: null
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
    } = {
            list: []
        };
    /**
     * プレイリストのどこを再生しているかを示す番号。0から始まる。
     */
    playNumber: number = 0;
    /** 
     * 再生する音楽の種類。flacかaacのどちらかを指定する。
     */
    playType: "flac" | "aac" = "aac";
    /**
     * プレイリストをシャッフルするかどうか。
     */
    shuffle: boolean = false;
    /**
     * リピートするかどうか。
     */
    repeat: boolean = false;
    /**
     * シークバーの更新用インターバル
     */
    private interval: number | undefined;
    /**
     * シークバーを操作中かどうか
     */
    private seeking = false;

    constructor() {
        super();
        document.body.appendChild(this.audioElement);
        this.buttonsElement.playButton = this.buttonsElement.footerElement.getElementsByClassName("playButton")[0] as HTMLElement;
        this.buttonsElement.repeatButton = this.buttonsElement.footerElement.getElementsByClassName("repeatButton")[0] as HTMLElement;
        this.buttonsElement.repeatButton.addEventListener("click", () => { this.audioElement.loop = !this.audioElement.loop; });
        this.buttonsElement.seekBar = this.buttonsElement.footerElement.getElementsByClassName("seekBarInput")[0] as HTMLInputElement;
        this.buttonsElement.nowTime = this.buttonsElement.footerElement.getElementsByClassName("nowTime")[0] as HTMLDivElement;
        this.buttonsElement.maxTime = this.buttonsElement.footerElement.getElementsByClassName("maxTime")[0] as HTMLDivElement;
        this.buttonsElement.seekBar.addEventListener("input", () => {
            this.seeking = true;
            this.seekBarReDraw();
        });

        this.buttonsElement.seekBar.addEventListener("change", () => {
            // クリックが離された時に再生地点を変える
            if (this.buttonsElement.seekBar)
                this.audioElement.currentTime = this.audioElement.duration * Number(this.buttonsElement.seekBar.value) / 100;
            this.seeking = false;
        });

        this.buttonsElement.playButton.addEventListener("click", () => { this.playChange(); });

        this.audioElement.addEventListener("playing", () => { this.seekBarReDraw(); });
        addEventListener("keydown", e => {
            console.log(e.key);
            if (e.key === "ArrowLeft") this.audioElement.currentTime -= 5;
            if (e.key === " ") this.playChange();
            if (e.key === "ArrowRight") this.audioElement.currentTime += 5;
        });
    }

    /**
     * 時間をフォーマットする
     */
    private formatTime(seconds: number) {
        if (!seconds) return "0:00";
        const hours = Math.floor(Math.floor(seconds) / 3600);
        const minutes = Math.floor((Math.floor(seconds) % 3600) / 60);
        const secs = Math.floor(seconds) % 60;

        // 時間と分をパディングして2桁にする
        const formattedHours = hours === 0 ? undefined : hours.toString().padStart(1, '0');
        const formattedMinutes = minutes?.toString().padStart(1, '0') || "0";
        const formattedSeconds = secs.toString().padStart(2, '0');

        return (formattedHours ? formattedHours + ":" : "") + formattedMinutes + ":" + formattedSeconds;
    }
    /**
     * シークバーを再描画する
     */
    seekBarReDraw() {
        if (this.audioElement.paused && this.interval) {
            clearInterval(this.interval);
            this.interval = undefined;
        } else if (!this.interval && !this.seeking) {
            this.interval = setInterval(() => { this.seekBarReDraw(); }, 200);
        }
        if (!(this.buttonsElement.seekBar && this.buttonsElement.nowTime && this.buttonsElement.maxTime)) return;
        if (!this.seeking) this.buttonsElement.seekBar.value = String((this.audioElement.currentTime / this.audioElement.duration) * 100);
        this.buttonsElement.nowTime.innerText = this.formatTime(this.seeking ? (Number(this.buttonsElement.seekBar.value) * this.audioElement.duration) / 100 : this.audioElement.currentTime);
        this.buttonsElement.maxTime.innerText = this.formatTime(this.audioElement.duration);

        const state: MediaPositionState = {};
        /** 再生速度 */
        state.playbackRate = 1;
        /** 再生地点 */
        state.position = Math.floor(this.audioElement.currentTime);
        /** 音楽の合計時間 */
        state.duration = Math.floor(this.audioElement.duration || 0);
        navigator.mediaSession.setPositionState(state);

        const metadataInit: MediaMetadataInit = {};
        /** アルバム名 */
        metadataInit.album = "test";
        /** アーティスト名 */
        metadataInit.artist = "init";
        /** タイトル */
        metadataInit.title = "title";
        navigator.mediaSession.metadata = new MediaMetadata(metadataInit);
    }
    /**
     * 再生と停止を切り替える
     */
    async playChange() {
        const streamfilenames = await this.getPlayingStreamFilename();
        function uriGet() {
            const query: POSTData = {};
            let fileName: string | undefined = "";
            if (this.playType === "flac") fileName = streamfilenames?.flacfilename;
            else fileName = streamfilenames?.aacfilename;
            return window.location.origin + ":38671/?" + new URLSearchParams({ fileName: decodeURIComponent(fileName || "") });
        }
        console.log(this.audioElement.src, uriGet.bind(this)());
        if (this.audioElement.src !== uriGet.bind(this)()) {
            this.audioElement.src = uriGet.bind(this)();
            this.audioElement.currentTime = 0;
        }

        if (this.audioElement.paused) {
            this.audioElement.play();
            this.seekBarReDraw();
        }
        else this.audioElement.pause();
    };
    /**
     * セッションデータの取得。oldplaytimeとoperatingは初期値のため、必要な場合に上書きする必要がある。
     */
    get sessionData() {
        const clientSession: ClientSession = {
            musicuuid: this.playList.list[this.playNumber].musicuuid,
            playlistuuid: this.playList.playlistuuid,
            albumuuid: this.playList.albumuuid,
            artistuuid: this.playList.list[this.playNumber].artistuuid || this.playList.artistuuid,
            playstatus: this.audioElement.paused ? "pause" : "play",
            oldplaytime: String(this.audioElement.currentTime),
            playtime: String(this.audioElement.currentTime),
            operating: "no",
            nowtime: String(Date.now()),
        };
        return clientSession;
    }
    /**
     * 再生中のファイル名を取得する
     */
    async getPlayingFilename() {
        if (!this.playNumber) this.playNumber = 0;
        if (this.playList.list[this.playNumber] && !this.playList.list[this.playNumber].musicfilelistcache) {
            const musicuuid = this.playList.list[this.playNumber].musicuuid;
            if (!musicuuid) return;
            const query: POSTData = { type: "musicInfo", musicuuid: musicuuid };
            const data = JSON.parse(await serverRequest(query)) as MusicInfo;
            if (data.sounds && data.sounds[this.playNumber].filelist)
                this.playList.list[this.playNumber].musicfilelistcache = data.sounds[this.playNumber].filelist;
        }
        return this.playList.list[this.playNumber].musicfilelistcache?.[this.playList.list[this.playNumber].filesNumber || 0].filename || this.playList.list[this.playNumber].filename;
    }
    /**
     * 再生中のストリーム内ファイル名を取得する
     */
    async getPlayingStreamFilename() {
        if (!this.playNumber) this.playNumber = 0;
        if (this.playList.list[this.playNumber] && !this.playList.list[this.playNumber].streaminfocache) {
            const filename = await this.getPlayingFilename();
            if (!filename) return;
            const query: POSTData = { type: "fileInfo", fileName: filename };
            const data = JSON.parse(await serverRequest(query)) as FileInfo;
            if (data.streams) this.playList.list[this.playNumber].streaminfocache = data.streams;
        }

        return this.playList.list[this.playNumber].streaminfocache?.[this.playList.list[this.playNumber].streamNumber || 0];
    }
    async addAndPlay(musicInfos: MusicInfo[]) {
        this.playList.list = musicInfos.map(musicInfo => {
            return {
                musicuuid: musicInfo.musicuuid,
                artistuuid: musicInfo.artists?.[0].artistuuid,
                filesNumber: musicInfo.defaultsound,
                streamNumber: musicInfo.sounds?.[0].defaultstream,
                musicfilelistcache: musicInfo.sounds?.[0].filelist,
            }
        });
        await this.playChange();
    }
};
