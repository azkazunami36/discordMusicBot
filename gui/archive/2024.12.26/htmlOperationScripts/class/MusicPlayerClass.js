import { EventEmitter } from "../../scripts/class/EventEmitter.js";
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
    playList = {
        list: []
    };
    playNumber = 0;
    playType;
    shuffle = false;
    repeat = false;
    formatTime(seconds) {
        const hours = Math.floor(Math.floor(seconds) / 3600);
        const minutes = Math.floor((Math.floor(seconds) % 3600) / 60);
        const secs = Math.floor(seconds) % 60;
        // 時間と分をパディングして2桁にする
        const formattedHours = hours === 0 ? undefined : hours.toString().padStart(1, '0');
        const formattedMinutes = minutes?.toString().padStart(1, '0') || "0";
        const formattedSeconds = secs.toString().padStart(2, '0');
        return (formattedHours ? formattedHours + ":" : "") + formattedMinutes + ":" + formattedSeconds;
    }
    interval;
    seeking = false;
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
        state.duration = Math.floor(this.audioElement.duration);
        state.playbackRate = 1;
        state.position = Math.floor(this.audioElement.currentTime);
        navigator.mediaSession.setPositionState(state);
    }
    constructor(mainFileTabManager) {
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
        this.buttonsElement.playButton.addEventListener("click", () => {
            this.playChange();
        });
        this.audioElement.addEventListener("playing", () => { this.seekBarReDraw(); });
        mainFileTabManager.on("doubleClick", async (fileName) => {
            const query = {};
            query.type = "fileInfo";
            query.fileName = fileName.name;
            const url = window.location.origin + ":38671?" + new URLSearchParams(query);
            const init = {};
            init.method = "POST";
            const res = await fetch(url, init);
            const fileInfo = JSON.parse(await res.text());
            let flac;
            if (fileInfo.streams)
                for (const stream of fileInfo.streams)
                    if (stream.flacfilename)
                        flac = decodeURIComponent(stream.flacfilename);
            const playquery = {};
            playquery.fileName = flac;
            this.audioElement.src = window.location.origin + ":38671?" + new URLSearchParams(playquery);
            this.audioElement.play();
        });
        addEventListener("keydown", e => {
            if (e.key === " ")
                this.playChange();
        });
        const metadataInit = {};
        metadataInit.album = "test";
        metadataInit.artist = "init";
        metadataInit.title = "title";
        navigator.mediaSession.metadata = new MediaMetadata(metadataInit);
    }
    /**
     * 再生と停止を切り替える
     */
    playChange() {
        if (this.audioElement.paused) {
            this.audioElement.play();
            this.interval = setInterval(() => { this.seekBarReDraw(); }, 200);
        }
        else
            this.audioElement.pause();
    }
    ;
    get sessionData() {
        const clientSession = {
            nowtime: String(Date.now()),
            operating: "no",
            playstatus: "pause",
            playtime: "0"
        };
        return clientSession;
    }
}
;
