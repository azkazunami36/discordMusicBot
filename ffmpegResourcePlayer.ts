
import Stream from "stream";
import * as DiscordVoice from "@discordjs/voice";
import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import { ChildProcessByStdio, spawn } from "child_process";

export class FfmpegResourcePlayer {
    audioPath?: string;
    #playingPath?: string;
    #spawn?: ChildProcessByStdio<null, Stream.Readable, null>;
    #resource?: DiscordVoice.AudioResource;
    #player: DiscordVoice.AudioPlayer;
    #ffprobeStreamInfo?: ffmpeg.FfprobeStream;
    constructor() { this.#player = new DiscordVoice.AudioPlayer() };
    async play() {
        if (!this.audioPath) return;
        // もしすでに再生中で、クライアント指定の音声パスが同じだったら無視
        if (this.#player.state.status === DiscordVoice.AudioPlayerStatus.Playing && this.audioPath === this.#playingPath) return;
        if (this.#ffprobeStreamInfo) this.#ffprobeStreamInfo = (await new Promise<ffmpeg.FfprobeStream | undefined>((resolve, reject) => {
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
        audioStreamInfo.duration;
        this.#spawn = spawn("ffmpeg", [
            "-ss", "00:00:00",
            "-i", this.#playingPath,
            "-map", "0:a:0",
            "-c:a", "libopus",
            "pipe:1"
        ], { stdio: ["ignore", "pipe", "ignore"] });
        this.#resource = DiscordVoice.createAudioResource(this.#spawn.stdout, {
            inputType: DiscordVoice.StreamType.Opus,
            inlineVolume: true
        });
        this.#player.play(this.#resource);
    };
    async stop() {
        this.#player.stop();
        this.#resource = undefined;
        if (this.#spawn) {
            this.#spawn.kill();
            this.#spawn = undefined;
        }
    }
    get player() { return this.#player; };
}
