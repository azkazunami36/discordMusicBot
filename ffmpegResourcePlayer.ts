import Stream from "stream";
import * as DiscordVoice from "@discordjs/voice";
import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import { ChildProcessByStdio, spawn } from "child_process";
import { Playlist } from "./envJSON.js";

export class FfmpegResourcePlayer {
    #audioPath?: string;
    set audioPath(audioPath: string | undefined) {
        this.#audioPath = audioPath;
        this.#ffprobeStreamInfo = undefined;
    }
    get audioPath() {
        return this.#audioPath;
    }
    #playingPath?: string;
    #spawn?: ChildProcessByStdio<null, Stream.Readable, Stream.Readable>;
    #resource?: DiscordVoice.AudioResource;
    #player: DiscordVoice.AudioPlayer;
    #ffprobeStreamInfo?: ffmpeg.FfprobeStream;
    #volume = 0.5;
    #seekmargen = 0;
    #playbackSpeed = 1;
    constructor() { this.#player = new DiscordVoice.AudioPlayer() };
    /**
     * ffmpegを利用して音声を再生します。ここはちょっとしたブラックボックスに見えるかもしれません。
     * 
     * 途中から再生する時は絶対にseekmarginを適切な場所に設定してからこの関数を呼びましょう。最初から再生する場合は絶対にseekmarginを0にしてください。
     * 
     */
    async #audioPlay() {
        if (!this.#playingPath || !this.#ffprobeStreamInfo) return;
        if (this.#player.state.status === DiscordVoice.AudioPlayerStatus.Playing) this.#player.stop();
        this.#resource = undefined;
        if (this.#spawn) {
            this.#spawn.kill();
            this.#spawn = undefined;
        }

        function toTimestamp(totalSeconds: number): string {
            if (!Number.isFinite(totalSeconds) || totalSeconds < 0) totalSeconds = 0;
            const totalMs = Math.round(totalSeconds * 1000); // integer milliseconds
            const h = Math.floor(totalMs / 3_600_000);
            const m = Math.floor((totalMs % 3_600_000) / 60_000);
            const sec = Math.floor((totalMs % 60_000) / 1_000);
            const ms = totalMs % 1_000;
            const hh = h.toString().padStart(2, "0");
            const mm = m.toString().padStart(2, "0");
            const ss = sec.toString().padStart(2, "0");
            const mmm = ms.toString().padStart(3, "0");
            return `${hh}:${mm}:${ss}.${mmm}`;
        }
        const seekTs = toTimestamp(this.#seekmargen + (Number(this.#ffprobeStreamInfo?.start_time) || 0));
        this.#spawn = spawn("ffmpeg", [
            "-ss", seekTs,
            "-i", this.#playingPath,
            "-map", "0:a:0",
            "-c:a", "libopus",
            "-b:a", "96k",
            "-filter:a", `asetrate=${this.#ffprobeStreamInfo.sample_rate || 48000}*${this.#playbackSpeed},aresample=${this.#ffprobeStreamInfo.sample_rate || 48000}`,
            "-f", "ogg",
            "pipe:1"
        ], { stdio: ["ignore", "pipe", "pipe"] });
        this.#resource = DiscordVoice.createAudioResource(this.#spawn.stdout, {
            inputType: DiscordVoice.StreamType.OggOpus,
            inlineVolume: true
        });
        this.#resource.volume?.setVolume(this.#volume);
        this.#player.play(this.#resource);
    }
    async play() {
        if (!this.audioPath) return;
        if (this.#player.state.status === DiscordVoice.AudioPlayerStatus.Playing && this.audioPath === this.#playingPath) return;
        if (!this.#ffprobeStreamInfo) this.#ffprobeStreamInfo = (await new Promise<ffmpeg.FfprobeStream | undefined>((resolve, reject) => {
            if (!this.audioPath || !fs.existsSync(this.audioPath)) return resolve(undefined);
            ffmpeg.ffprobe(this.audioPath, (err, data) => {
                if (err) reject(err);
                if (data.streams.length <= 0) return resolve(undefined);
                resolve(data.streams[0]);
            });
        }));
        if (this.#ffprobeStreamInfo === undefined) return;
        this.#playingPath = this.audioPath;
        const audioStreamInfo = this.#ffprobeStreamInfo;
        this.#seekmargen = 0;
        await this.#audioPlay();
    };
    async stop() {
        this.#player.stop();
        this.#resource = undefined;
        if (this.#spawn) {
            this.#spawn.kill();
            this.#spawn = undefined;
        }
        this.#playingPath = undefined;
    }
    async seek(seconds: number) {
        if (seconds >= this.duration) seconds = this.duration - 1;
        if (seconds <= 0) seconds = 0;
        this.#seekmargen = seconds;
        this.#audioPlay();
    }
    async speedChange(mag: number) {
        const playtime = this.playtime;
        if (mag <= 0.1) this.#playbackSpeed = 0.1;
        else this.#playbackSpeed = mag;
        this.#seekmargen = playtime;
        this.#audioPlay();
    }
    /** 現在の再生時間を出力します。msではなくsです。 */
    get playtime() {
        return this.#resource?.playbackDuration !== undefined ? this.#seekmargen + (this.#resource.playbackDuration / 1000 * this.#playbackSpeed) : 0;
    }
    /** 再生中の曲の長さを出力します。 */
    get duration() {
        return Number(this.#ffprobeStreamInfo?.duration) || 0;
    }
    get player() { return this.#player; };
    set volume(vol: number) {
        this.#volume = vol;
        if (this.#resource) this.#resource.volume?.setVolume(vol);
    }
    get playing() {
        if (!this.#playingPath) return undefined;
        const filename = this.#playingPath.split("Cache/")[1];
        if (!filename) return undefined;
        const id = filename.split(".")[0];
        if (!id) return undefined;
        return {
            type: id.startsWith("sm") ? "nicovideoId" : "videoId",
            body: id
        } as Playlist;
    }
}
