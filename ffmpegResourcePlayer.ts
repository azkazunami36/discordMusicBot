import Stream from "stream";
import * as DiscordVoice from "@discordjs/voice";
import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import { ChildProcessByStdio, spawn } from "child_process";
import { Playlist } from "./envJSON.js";

export class FfmpegResourcePlayer {
    audioPath?: string;
    #playingPath?: string;
    #spawn?: ChildProcessByStdio<null, Stream.Readable, Stream.Readable>;
    #resource?: DiscordVoice.AudioResource;
    #player: DiscordVoice.AudioPlayer;
    #ffprobeStreamInfo?: ffmpeg.FfprobeStream;
    #volume = 0.5;
    #seekmargen = 0;
    #playbackSpeed = 1;
    constructor() { this.#player = new DiscordVoice.AudioPlayer() };
    async #audioPlay(seconds: number) {
        if (!this.#playingPath || !this.#ffprobeStreamInfo) return;
        if (this.#player.state.status === DiscordVoice.AudioPlayerStatus.Playing) this.#player.stop();
        this.#resource = undefined;
        if (this.#spawn) {
            this.#spawn.kill();
            this.#spawn = undefined;
        }

        // Build a safe timestamp like "HH:MM:SS.mmm" using integer milliseconds to avoid 59.999 -> 60.000 rounding jumps
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
        // include small start_time offset if available to keep precise alignment when using input-after -ss
        const startTime = Number(this.#ffprobeStreamInfo?.start_time) || 0;
        const seekTs = toTimestamp(seconds + startTime);
        /** Created by ChatGPT */
        function buildAtempoChain(speed: number): string {
            if (speed <= 0) throw new Error("speed must be positive");

            const parts: string[] = [];

            // 倍速が 1 の場合はそのまま
            if (speed === 1) return "atempo=1";

            let remaining = speed;

            if (speed > 2) {
                // 2で割れるだけ割っていく
                while (remaining > 2) {
                    parts.push("atempo=2.0");
                    remaining /= 2;
                }
                // 最後に 0.5〜2 の範囲に収まった残りを追加
                parts.push(`atempo=${remaining.toFixed(3).replace(/\.?0+$/, "")}`);
            } else if (speed < 0.5) {
                // 0.5で割れるだけ割っていく
                while (remaining < 0.5) {
                    parts.push("atempo=0.5");
                    remaining /= 0.5;
                }
                parts.push(`atempo=${remaining.toFixed(3).replace(/\.?0+$/, "")}`);
            } else {
                // 0.5〜2 の範囲はそのまま
                parts.push(`atempo=${remaining.toFixed(3).replace(/\.?0+$/, "")}`);
            }

            return parts.join(",");
        }
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
        await this.#audioPlay(0);
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
        this.#audioPlay(seconds);
    }
    async speedChange(mag: number) {
        const playtime = this.playtime;
        if (mag <= 0.1) this.#playbackSpeed = 0.1;
        else this.#playbackSpeed = mag;
        this.#seekmargen = playtime;
        this.#audioPlay(playtime);
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
        const filename = this.#playingPath.split("cache/")[1];
        if (!filename) return undefined;
        const videoId = filename.split(".")[0];
        if (!videoId) return undefined;
        return {
            type: "videoId",
            body: videoId
        } as Playlist;
    }
}
