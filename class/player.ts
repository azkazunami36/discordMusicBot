import * as Discord from "discord.js";
import * as DVoice from "@discordjs/voice";
import * as cp from "child_process";
import Stream from "stream";
import mysql from "mysql2/promise";
import { ServerInfoAPI } from "../dbAPIs.js";
import { ffprobe } from "../func/ffprobe.js";

/**
 * FFmpegに時間を入力するためのものです。00:00:00.000になります。小数点の入力が可能です。
 */
function toTimestamp(totalSeconds: number): string {
    if (!Number.isFinite(totalSeconds) || totalSeconds < 0) totalSeconds = 0;
    const totalMs = Math.round(totalSeconds * 1000);
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

/** 全てのサーバーのプレイヤーのハブです。ほとんど情報は管理していません。 */
export class Player {
    #client: Discord.Client;
    #players: Record<string, GuildVoicePlayer> = {};
    #db: mysql.Pool;
    constructor(client: Discord.Client, db: mysql.Pool) {
        this.#client = client;
        this.#db = db;
    }
    async getPlayer(guildId: string) {
        if (this.#players[guildId]) return this.#players[guildId];
        try {
            const guild = this.#client.guilds.cache.get(guildId) ?? await this.#client.guilds.fetch(guildId);
            if (!guild) return;
            const serverInfo = new ServerInfoAPI(guild.id, this.#db);
            this.#players[guildId] = new GuildVoicePlayer(guild, serverInfo);
            return this.#players[guildId];
        } catch (e) {
            return;
        }
    }
}

/** 
 * 各サーバー毎のプレイヤー情報です。
 * 
 * `play()`の使い方のみ慎重にお願いします。以下解説です。
 * 
 * playは`join()`の後に行います。また、playのコールバックがありますが、
 * 再生セッションがなくなるとその関数は破棄されます。
 * 
 * コールバックを利用する場合、その再生セッションが正しく終了・異常終了すると呼び出し、
 * 手動終了(`stop()`や`leave()`を呼び出す)をすると呼び出されません。
 * 
 * つまり、この関数では今再生していると思われる曲が何らかの理由で再生終了すると呼び出されると思ってください。
 * 意図的に関数を利用して停止した場合には呼び出されないため注意してください。
 */
export class GuildVoicePlayer {
    #guild: Discord.Guild;
    #player: DVoice.AudioPlayer;
    #subscription?: DVoice.PlayerSubscription;
    #spawn?: cp.ChildProcessByStdio<null, Stream.Readable, Stream.Readable>;
    #resource?: DVoice.AudioResource;
    #serverInfo: ServerInfoAPI;
    #timeout?: NodeJS.Timeout;
    #source?: {
        /** 開始した現在時刻です。`(Date.now() / 1000) - startTime`で再生からの経過時間が求められます。単位はsです。 */
        startTime: number;
        /** ソースの再生開始位置です。単位はsです。 */
        startPoint: number;
        url: string;
        /** ソースの長さです。単位はsです。 */
        sourceLength: number;
        playEndCall: (type: "played" | "error" | "leaved") => void;
    }
    constructor(guild: Discord.Guild, serverInfo: ServerInfoAPI) {
        this.#guild = guild;
        this.#player = new DVoice.AudioPlayer();
        this.#player.on("error", e => {
            console.error(e);
        });
        this.#player.on("stateChange", (oldState, newState) => {
            console.log(oldState.status, newState.status);
        });
        this.#serverInfo = serverInfo;
    }
    /** 参加します。チャンネルが違うものに対して指定されている場合、切り替えられます。 */
    async join(channelId: string) {
        try {
            const oldConnection = DVoice.getVoiceConnection(this.#guild.id);
            if (oldConnection) {
                if (oldConnection.joinConfig.channelId == channelId) return true;
                this.leave();
            }
            const channel = this.#guild.channels.cache.get(channelId) ?? await this.#guild.channels.fetch(channelId);
            if (!channel) return false;
            if (!channel.isVoiceBased()) return false;
            const connection = DVoice.joinVoiceChannel({ guildId: this.#guild.id, channelId: channel.id, adapterCreator: this.#guild.voiceAdapterCreator });
            try {
                await DVoice.entersState(connection, DVoice.VoiceConnectionStatus.Ready, 10000);
            } catch (e) {
                this.leave();
                return false;
            }
            connection.on("stateChange", (oldState, newState) => {
                if (newState.status === DVoice.VoiceConnectionStatus.Destroyed) {
                    try { this.leave.bind(this)(); } catch { };
                }
                if (newState.status === DVoice.VoiceConnectionStatus.Disconnected) {
                    try { this.#source?.playEndCall("leaved"); this.leave.bind(this)(); } catch { };
                }
                if (newState.status === DVoice.VoiceConnectionStatus.Ready) {
                }
            })
            this.#subscription = connection.subscribe(this.#player);
            return true;
        } catch (e) {
            return false;
        }
    }
    /**
     * 接続がリセットされます。いかなる理由があっても、正しく接続を破棄します。再生状態のリセットも担当します。
     */
    leave() {
        this.stop();
        const oldConnection = DVoice.getVoiceConnection(this.#guild.id);
        try { this.#subscription?.unsubscribe(); } catch { }
        this.#subscription = undefined;
        try { oldConnection?.destroy(); } catch { }
    }
    /** 
     * 再生します。trueで正常再生、falseで失敗です。
     * 
     * endCallはtrueの場合「最後まで再生された時」です。falseの場合は「不測の事態」です。通常の`stop()`では呼び出されません。
     */
    async play(url: string, startPoint: number, endCall: (type: "played" | "error" | "leaved") => void) {
        const ffprobeInfo = await (async () => { try { return await ffprobe(url) } catch { } })();
        if (!ffprobeInfo) return false;
        const sourceLength = Number(ffprobeInfo.streams[0]?.duration);
        if (Number.isNaN(sourceLength)) return false;
        this.#source = {
            url,
            startPoint,
            startTime: Date.now() / 1000,
            sourceLength,
            playEndCall: endCall
        }
        await this.playUpdate();
        return this.playingCheck();
    }
    /** 
     * すでにこのクラスに入ってる情報を利用して再生状態を更新します。
     * 
     * 再生開始位置を計算して、途中からの場合その時点の再生を行う設計です。
     * 
     * VCに入っていない、再生データが不足しているなどの場合は何も起きません。
     * 
     * 正しく動いたかどうかは、この後に`playingCheck()`を確認してください。エラーは飛びません。
     */
    async playUpdate() {
        try {
            if (!this.playingCheck()) return this.stop(); // 参加してない証拠なので。
            const { tempo, pitch, volume } = await this.#serverInfo.transaction(async connection => {
                return await this.#serverInfo.infoGet(connection, "tempo", "pitch", "volume");
            });
            if (!(this.#subscription !== undefined
                && this.#source !== undefined)) return this.stop(); // 参加してない証拠なので。
            const startTime = Date.now() / 1000; // 下のコードにて、Date.now()を置き換えています。startTimeの名前の意味ではないので注意。ただの現在時刻です。
            const startPoint = this.#source.startPoint + (startTime - this.#source.startTime);
            const args: [string | undefined, string | undefined][] = [];
            args.push(
                ["-hide_banner", undefined],
                ["-loglevel", "error"],
                ["-nostdin", undefined],
                ["-ss", toTimestamp(startPoint ?? 0)],
                ["-i", this.#source.url]
            );
            args.push(
                ["-filter_complex", this.#buildTempoPitchFilter(tempo, pitch)]
            );
            args.push(
                ["-map", "[dry]"]
            )
            args.push(
                ["-ar", "48000"],
                ["-ac", "2"],
                ["-c:a", "libopus"],
                ["-b:a", "160k"],
                ["-vbr", "on"],
                ["-application", "audio"],
                ["-frame_duration", "20"],
                ["-f", "ogg"],
                [undefined, "pipe:1"]
            );
            this.#source.startPoint = startPoint;
            this.#source.startTime = startTime;
            const source = this.#source;
            this.stop();
            this.#source = source;
            this.#spawn = cp.spawn(
                "ffmpeg",
                args.flat().filter(str => str !== undefined),
                { stdio: ["ignore", "pipe", "pipe"] }
            );
            this.#spawn.on("error", e => {
                console.error(e);
                try { this.#source?.playEndCall("error"); } catch { };
                this.stop();
            });
            this.#spawn.stderr.on("error", e => {
                console.error(e);
                try { this.#source?.playEndCall("error"); } catch { };
                this.stop();
            });
            this.#resource = DVoice.createAudioResource(this.#spawn.stdout, {
                inlineVolume: true,
                inputType: DVoice.StreamType.OggOpus
            });
            this.#resource.volume?.setVolume(volume / 100);
            this.#player.play(this.#resource);
            this.#timeout = setTimeout(() => {
                try { this.#source?.playEndCall("played"); } catch { };
                this.stop();
            }, (this.#source.sourceLength - startPoint) * 1000);
        } catch (e) {
            console.error(e);
            this.stop();
        };
    }
    /** 参加しているIDまたはundefinedが返ります。無効なIDもundefinedです。 */
    joiningCheck() {
        return this.#subscription?.connection.joinConfig.channelId || undefined;
    }
    /** 再生中のソース情報を返します。再生していなかったりするとundefinedになります。 */
    playingCheck() {
        return this.#subscription !== undefined
            && this.#source !== undefined ? { ...this.#source } : undefined;
    }
    stop() {
        try { this.#player.stop(true); } catch { }
        try { if (this.#spawn) this.#spawn.kill(); } catch { }
        try { clearTimeout(this.#timeout); } catch { }
        this.#spawn = undefined;
        this.#resource = undefined;
        this.#source = undefined;
    }
    /**
     * Created by ChatGPT
     * 速度と音程を自由に変えられます。
     */
    #buildTempoPitchFilter(
        tempo: number = 1,
        pitch: number = 0,
        sampleRate: number = 48000
    ): string {
        const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
        const round6 = (v: number) => Math.round(v * 1e6) / 1e6;

        const T0 = Number.isFinite(tempo) && tempo > 0 ? tempo : 1;
        const T = round6(clamp(T0, 0.01, 100));
        const P0 = Number.isFinite(pitch) ? pitch : 0;
        // helpers for exact tempo and pitch-only
        const exactTempo = (T >= 0.98 && T <= 1.02);
        const pitchOnly = (exactTempo && P0 !== 0);
        const pitchRatio = round6(Math.pow(2, P0 / 12));

        const absSemi = Math.abs(P0);
        const near1 = (T >= 0.95 && T <= 1.05);
        const fast = (T > 1.25);
        const highPitchUp = (P0 >= 12); // 大きく上げる(+12以上)ときのアーチファクト抑制

        // choose transient type based on tempo
        let transientMode: string;
        if (T < 0.85) transientMode = "mixed";
        else if (T <= 1.1) transientMode = "smooth";
        else transientMode = "crisp";

        // If tempo is exactly 1x but pitch is changed, prefer a bit more attack
        if (T === 1 && P0 !== 0) {
            transientMode = "mixed";
        }

        // ★ ピッチを少し下げる時（-1〜-3）＆テンポ≈1：周期的リフレッシュ感を除去し自然なサウンドを保つ
        // → 分析窓を長く・smoothing=on・formant=preserved で自然さ優先
        // widen tempo band so 0.90× hits this profile
        const isDownPitchEchoSensitive = (P0 < 0 && absSemi <= 3 && (T >= 0.85 && T <= 1.05));
        const optsDownPitch = [
            `tempo=${T}`, `pitch=${pitchRatio}`,
            `transients=${transientMode}`,
            `detector=compound`,
            `phase=laminar`,
            `window=${near1 ? "standard" : "long"}`,
            `smoothing=${pitchOnly ? "off" : "on"}`,
            `formant=preserved`,
            `pitchq=${pitchOnly ? "quality" : "consistency"}`,
            `channels=${pitchOnly ? "together" : "together"}`,
        ];

        // 高速域（アンチ・チリ）
        const optsFast = [
            `tempo=${T}`, `pitch=${pitchRatio}`,
            `transients=${transientMode}`,
            `detector=compound`,
            `phase=laminar`,
            `window=standard`,
            `smoothing=on`,
            `formant=preserved`,
            `pitchq=consistency`,
            `channels=together`,
        ];

        // 高い方向に大きく上げる(+12以上)：高域チリ抑制寄り
        const optsHighPitchUp = [
            `tempo=${T}`, `pitch=${pitchRatio}`,
            `transients=${transientMode}`,
            `detector=compound`,
            `phase=laminar`,
            `window=standard`,      // longだとチリが出やすい
            `smoothing=on`,
            `formant=preserved`,
            `pitchq=consistency`,   // 位相一貫性優先
            `channels=together`,
        ];

        // それ以外は HQ（解像度寄り）
        const optsHQ = [
            `tempo=${T}`, `pitch=${pitchRatio}`,
            `transients=${transientMode}`,
            `detector=compound`,
            `phase=laminar`,
            `window=${exactTempo ? "standard" : "long"}`,
            `smoothing=${pitchOnly ? "off" : "on"}`,
            `formant=preserved`,
            `pitchq=${pitchOnly ? "quality" : "quality"}`,
            `channels=${pitchOnly ? "together" : "together"}`,
        ];

        // safe bypass for truly no-change case
        if (T === 1 && P0 === 0) {
            return `[0:a]aresample=${sampleRate}:resampler=soxr:precision=28,aformat=sample_rates=${sampleRate}:channel_layouts=stereo[dry]`;
        }

        // Refined: If pitchOnly at 1x, preserve stereo image (channels=together)
        // This is now handled above in the optsHQ and optsDownPitch definitions.

        const opts = (highPitchUp ? optsHighPitchUp
            : isDownPitchEchoSensitive ? optsDownPitch
                : fast ? optsFast
                    : optsHQ).join(":");

        // 仕上げ soxr（高品質リサンプル）
        return `[0:a]rubberband=${opts},aresample=${sampleRate}:resampler=soxr:precision=28,aformat=sample_rates=${sampleRate}:channel_layouts=stereo[dry]`;
    }
}
