
import Stream from "stream";
import * as Discord from "discord.js";
import * as DiscordVoice from "@discordjs/voice";
import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import { ChildProcessByStdio, ChildProcessWithoutNullStreams, spawn } from "child_process";
import { Playlist } from "./envJSON.js";

export class FfmpegResourcePlayer {
    audioPath?: string;
    #playingPath?: string;
    #spawn?: ChildProcessByStdio<null, Stream.Readable, Stream.Readable>;
    #resource?: DiscordVoice.AudioResource;
    #player: DiscordVoice.AudioPlayer;
    #ffprobeStreamInfo?: ffmpeg.FfprobeStream;
    #guildId?: string;
    #volume = 0.5;
    #seekmargen = 0;
    #playbackSpeed = 1;
    constructor() { this.#player = new DiscordVoice.AudioPlayer() };
    async #audioPlay(seconds: number) {
        if (!this.#playingPath) return;
        if (this.#player.state.status === DiscordVoice.AudioPlayerStatus.Playing) this.#player.stop();
        this.#resource = undefined;
        if (this.#spawn) {
            this.#spawn.kill();
            this.#spawn = undefined;
        }

        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = (seconds % 60);
        const ss = `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toFixed(3).padStart(6, "0")}`;
        this.#spawn = spawn("ffmpeg", [
            "-ss", ss,
            "-i", this.#playingPath,
            "-map", "0:a:0",
            "-c:a", "libopus",
            "-b:a", "96k",
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
        if (!this.#guildId) return;
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
        if (mag < 0.001) this.#playbackSpeed = 0.001;
        else this.#playbackSpeed = mag;
        this.#audioPlay(this.playtime);
    }
    /** 現在の再生時間を出力します。msではなくsです。 */
    get playtime() {
        return this.#resource?.playbackDuration !== undefined ? this.#seekmargen + (this.#resource.playbackDuration / 1000 / this.#playbackSpeed) : 0;
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
    set guildId(guildId: string) {
        this.#guildId = guildId;
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
