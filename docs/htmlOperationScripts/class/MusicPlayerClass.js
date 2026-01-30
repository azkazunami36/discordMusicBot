import { EventEmitter } from "../../scripts/class/EventEmitter.js";
import { serverRequest } from "../../scripts/function/serverRequest.js";
export class MusicPlayerClass extends EventEmitter {
    audioElement = document.createElement("audio");
    buttonsElement = {
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
    playList = {
        list: []
    };
    /**
     * プレイリストのどこを再生しているかを示す番号。0から始まる。
     */
    playNumber = 0;
    /**
     * 再生する音楽の種類。flacかaacのどちらかを指定する。
     */
    playType = "aac";
    /**
     * プレイリストをシャッフルするかどうか。
     */
    shuffle = false;
    /**
     * リピートするかどうか。
     */
    repeat = false;
    /**
     * シークバーの更新用インターバル
     */
    interval;
    /**
     * シークバーを操作中かどうか
     */
    seeking = false;
    constructor() {
        super();
        document.body.appendChild(this.audioElement);
        this.buttonsElement.playButton = this.buttonsElement.footerElement.getElementsByClassName("playButton")[0];
        this.buttonsElement.repeatButton = this.buttonsElement.footerElement.getElementsByClassName("repeatButton")[0];
        this.buttonsElement.repeatButton.addEventListener("click", () => { this.audioElement.loop = !this.audioElement.loop; });
        this.buttonsElement.seekBar = this.buttonsElement.footerElement.getElementsByClassName("seekBarInput")[0];
        this.buttonsElement.nowTime = this.buttonsElement.footerElement.getElementsByClassName("nowTime")[0];
        this.buttonsElement.maxTime = this.buttonsElement.footerElement.getElementsByClassName("maxTime")[0];
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
            if (e.key === "ArrowLeft")
                this.audioElement.currentTime -= 5;
            if (e.key === " ")
                this.playChange();
            if (e.key === "ArrowRight")
                this.audioElement.currentTime += 5;
        });
    }
    /**
     * 時間をフォーマットする
     */
    formatTime(seconds) {
        if (!seconds)
            return "0:00";
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
        }
        else if (!this.interval && !this.seeking) {
            this.interval = setInterval(() => { this.seekBarReDraw(); }, 200);
        }
        if (!(this.buttonsElement.seekBar && this.buttonsElement.nowTime && this.buttonsElement.maxTime))
            return;
        if (!this.seeking)
            this.buttonsElement.seekBar.value = String((this.audioElement.currentTime / this.audioElement.duration) * 100);
        this.buttonsElement.nowTime.innerText = this.formatTime(this.seeking ? (Number(this.buttonsElement.seekBar.value) * this.audioElement.duration) / 100 : this.audioElement.currentTime);
        this.buttonsElement.maxTime.innerText = this.formatTime(this.audioElement.duration);
        const state = {};
        /** 再生速度 */
        state.playbackRate = 1;
        /** 再生地点 */
        state.position = Math.floor(this.audioElement.currentTime);
        /** 音楽の合計時間 */
        state.duration = Math.floor(this.audioElement.duration || 0);
        navigator.mediaSession.setPositionState(state);
        const metadataInit = {};
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
            const query = {};
            let fileName = "";
            if (this.playType === "flac")
                fileName = streamfilenames?.flacfilename;
            else
                fileName = streamfilenames?.aacfilename;
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
        else
            this.audioElement.pause();
    }
    ;
    /**
     * セッションデータの取得。oldplaytimeとoperatingは初期値のため、必要な場合に上書きする必要がある。
     */
    get sessionData() {
        const clientSession = {
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
        if (!this.playNumber)
            this.playNumber = 0;
        if (this.playList.list[this.playNumber] && !this.playList.list[this.playNumber].musicfilelistcache) {
            const musicuuid = this.playList.list[this.playNumber].musicuuid;
            if (!musicuuid)
                return;
            const query = { type: "musicInfo", musicuuid: musicuuid };
            const data = JSON.parse(await serverRequest(query));
            if (data.sounds && data.sounds[this.playNumber].filelist)
                this.playList.list[this.playNumber].musicfilelistcache = data.sounds[this.playNumber].filelist;
        }
        return this.playList.list[this.playNumber].musicfilelistcache?.[this.playList.list[this.playNumber].filesNumber || 0].filename || this.playList.list[this.playNumber].filename;
    }
    /**
     * 再生中のストリーム内ファイル名を取得する
     */
    async getPlayingStreamFilename() {
        if (!this.playNumber)
            this.playNumber = 0;
        if (this.playList.list[this.playNumber] && !this.playList.list[this.playNumber].streaminfocache) {
            const filename = await this.getPlayingFilename();
            if (!filename)
                return;
            const query = { type: "fileInfo", fileName: filename };
            const data = JSON.parse(await serverRequest(query));
            if (data.streams)
                this.playList.list[this.playNumber].streaminfocache = data.streams;
        }
        return this.playList.list[this.playNumber].streaminfocache?.[this.playList.list[this.playNumber].streamNumber || 0];
    }
    async addAndPlay(musicInfos) {
        this.playList.list = musicInfos.map(musicInfo => {
            return {
                musicuuid: musicInfo.musicuuid,
                artistuuid: musicInfo.artists?.[0].artistuuid,
                filesNumber: musicInfo.defaultsound,
                streamNumber: musicInfo.sounds?.[0].defaultstream,
                musicfilelistcache: musicInfo.sounds?.[0].filelist,
            };
        });
        await this.playChange();
    }
}
;
