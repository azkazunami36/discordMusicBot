import { DiscordGatewayAdapterCreator, getVoiceConnection, joinVoiceChannel, VoiceConnectionStatus, AudioPlayer, AudioPlayerStatus, createAudioResource, StreamType, entersState, PlayerSubscription, AudioResource, AudioPlayerState } from "@discordjs/voice";
import { Playlist } from "./envJSON.js";
import { SourcePathManager } from "./sourcePathManager.js";
import { ChildProcessByStdio, spawn } from "child_process";
import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import Stream from "stream";
import { EventEmitter } from "events";


interface PlayerEvent {
    playStart: [guildId: string];
    playAutoEnd: [guildId: string];
}
export declare interface Player {
    on<K extends keyof PlayerEvent>(event: K, listener: (...args: PlayerEvent[K]) => void): this;
    once<K extends keyof PlayerEvent>(event: K, listener: (...args: PlayerEvent[K]) => void): this;
    off<K extends keyof PlayerEvent>(event: K, listener: (...args: PlayerEvent[K]) => void): this;
    emit<K extends keyof PlayerEvent>(event: K, ...args: PlayerEvent[K]): boolean;
}

/**
 * FFmpegに時間を入力するためのものです。00:00:00.000になります。
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

/** 自動でVCの参加から音声のダウンロード、再生まで管理します。 */
export class Player extends EventEmitter {
    status: {
        [guildId: string]: {
            /** このサーバーで使用するプレイヤーです。 */
            player: AudioPlayer;
            /** playerGetで使用します。プレイヤーがconnectionに登録されているかどうかの状態検出ようです。 */
            subscription?: PlayerSubscription;
            /** 再生が終了したとコールバックするまでの猶予です。 */
            endCallbackTimeout?: NodeJS.Timeout;
            playing?: Playlist;
            volume?: number;
            /** 再生速度です。 */
            tempo?: number;
            /** 音程です。 */
            pitch?: number;
            /** FFmpegに依存しています。 */
            spawn?: ChildProcessByStdio<null, Stream.Readable, Stream.Readable>;
            /** 再生の際に使用します。FFmpegに依存しています。 */
            resource?: AudioResource;
            /** 再生開始位置です。現在の再生位置を取得するために使用します。FFmpegに依存しています。 */
            playtimeMargin?: number;
        } | undefined;
    } = {};
    /** 
     * YouTube、ニコニコ動画、オリジナル音声、ボイス音声などのデータを管理するクラスです。
     * 
     * プレイヤー内でクラスを管理します。
     */
    sourcePathManager: SourcePathManager;
    constructor() {
        super();
        this.sourcePathManager = new SourcePathManager();
    }
    /** ファイルパスやメタデータを取得します。undefinedだとファイルが存在しないか正しい内容でないか、壊れたファイルです。 */
    async #fileMetaGet(source: Playlist, statusCallback: (status: "loading" | "downloading" | "converting" | "formatchoosing" | "done", body: {
        percent?: number;
        type?: "niconico" | "youtube" | "twitter";
    }) => void) {
        // 1. 音声ファイルを取得する。
        const filePath = await this.sourcePathManager.getAudioPath(source, statusCallback);
        if (!filePath) return console.warn("Player.fileMetaGet: filePathが取得できませんでした。"); // ファイルが取得できずエラーが起きたときは何もしない。
        // 2. 音声のメタデータを取得する。
        const ffprobe = (await new Promise<ffmpeg.FfprobeStream | undefined>((resolve, reject) => {
            if (!filePath || !fs.existsSync(filePath)) return resolve(undefined);
            ffmpeg.ffprobe(filePath, (err, data) => {
                if (err) return reject(err);
                if (data.streams.length <= 0) return resolve(undefined);
                resolve(data.streams[0]);
            });
        }));
        if (!ffprobe) return console.warn("Player.fileMetaGet: FFprobe情報を取得できませんでした。"); // ファイルが取得できないか、エラーが起きたときは何もしない。
        return { filePath, ffprobe }
    }
    /** 
     * プレイヤーを返します。undefinedだと、VCの準備ができずbotが退出したことになります。
     * channelIdなどを入力しない場合、新しいVC接続はされないため、undefinedの場合、botがVCに接続していないことになります。
     */
    async #playerGet(guildId: string, channelId?: string, adapterCreator?: DiscordGatewayAdapterCreator) {
        function playerIdleEvent(this: Player) {
            if (this.status[guildId]) {
                this.status[guildId].playing = undefined;
                /** もしプロセス内部で回避のできないPlayerによるIdleイベントであった場合を加味して、1秒返信を遅らせます。 */
                this.status[guildId].endCallbackTimeout = setTimeout(() => { this.emit("playAutoEnd", guildId); }, 500);
            }
        };
        function playerNotIdleEvent(this: Player, newState: AudioPlayerState) {
            if (newState.status !== AudioPlayerStatus.Idle) {
                if (this.status[guildId]?.endCallbackTimeout) {
                    clearTimeout(this.status[guildId].endCallbackTimeout);
                    this.status[guildId].endCallbackTimeout = undefined;
                }
            }
        };
        // 1. 古い接続を取得する。
        const oldConnection = getVoiceConnection(guildId);
        if (oldConnection) {
            // 1. 古い接続が接続したいチャンネルに参加している場合はそのまま利用する。
            if (channelId && (oldConnection.joinConfig.channelId === channelId)) {
                const player = this.status[guildId]?.player;
                if (player) return player;
                else {
                    console.warn("Player.playerGet: ボイスチャンネルの取得に成功し、すでにプレイヤーが用意されていることが確定している状態で、プレイヤーを取得することができませんでした。挙動が不安定になる可能性があります。");
                    // プレイヤーが存在しなかったらプレイヤーを作成し、登録をした上で返す。これはあまり使われないコード。
                    const player = new AudioPlayer();
                    player.on(AudioPlayerStatus.Idle, (oldState, newState) => {
                        playerIdleEvent.call(this);
                    });
                    player.on("stateChange", (oldState, newState) => {
                        playerNotIdleEvent.call(this, newState);
                    });
                    const stats = (() => {
                        const stats = this.status[guildId] || { player };
                        if (!this.status[guildId]) this.status[guildId] = stats;
                        return stats;
                    })();
                    stats.subscription = oldConnection.subscribe(player);
                    return player;
                }
            }
            // 2. 接続したいチャンネルじゃなかったら古い接続を破棄する。
            if (this.status[guildId]) {
                this.status[guildId].subscription?.unsubscribe();
                this.status[guildId].subscription = undefined;
            }
            oldConnection.destroy();
        }
        if (!channelId || !adapterCreator) return console.log("Player.playerGet: すでに存在しているプレイヤーがありませんでした。ボイスチャットIDとボイスチャンネル作成変数が渡されていないため、プレイヤーは作成されませんでした。");
        // 2. 古い接続が正しい状態じゃなかったり存在しなかったら、新しい接続を始める。
        const connection = joinVoiceChannel({ guildId: guildId, channelId: channelId, adapterCreator: adapterCreator });
        // 3. プレイヤーを作成し、VCの接続を待った後にプレイヤーを登録して返す。
        if (this.status[guildId]?.player) {
            const player = this.status[guildId].player;
            try {
                await entersState(connection, VoiceConnectionStatus.Ready, 10000);
            } catch (e) {
                console.error("Player.playerGet: ボイスチャンネルが準備できるまでに時間がかかりすぎてしまい、エラー処理となりました。");
                connection.destroy();
                if (this.status[guildId]?.playing) this.status[guildId].playing = undefined;
                return undefined;
            }
            const stats = this.status[guildId];
            stats.subscription = connection.subscribe(player);
            return player;
        }
        const player = new AudioPlayer();
        player.on(AudioPlayerStatus.Idle, (oldState, newState) => {
            playerIdleEvent.call(this);
        });
        player.on("stateChange", (oldState, newState) => {
            playerNotIdleEvent.call(this, newState);
        });
        player.on("error", e => console.log("player", e));
        try {
            await entersState(connection, VoiceConnectionStatus.Ready, 10000);
        } catch (e) {
            console.error("Player.playerGet: ボイスチャンネルが準備できるまでに時間がかかりすぎてしまい、エラー処理となりました。");
            connection.destroy();
            if (this.status[guildId]?.playing) this.status[guildId].playing = undefined;
            return undefined;
        }
        const stats = (() => {
            const stats = this.status[guildId] || { player };
            if (!this.status[guildId]) this.status[guildId] = stats;
            return stats;
        })();
        stats.subscription = connection.subscribe(player);
        connection.on("stateChange", (oldState, newState) => {
            // VC接続がなくなったらこれで終了処理を完了させる。
            if (newState.status === VoiceConnectionStatus.Destroyed) {
                if (this.status[guildId]) {
                    this.status[guildId].subscription?.unsubscribe();
                    this.status[guildId].subscription = undefined;
                    if (this.status[guildId].playing) this.status[guildId].playing = undefined;
                }
            }
        })
        return player;
    }
    ffmpegPlay(data: {
        /** どのサーバーで再生するかを決めます。 */
        guildId: string;
        /** どのVCで再生するかを決めます。指定しない場合、再生ができないことがあります。 */
        channelId?: string;
        /** もしVCに参加していなかったらこれが必要です。指定しない場合、VCに参加できません。 */
        adapterCreator?: DiscordGatewayAdapterCreator;
        meta: {
            filePath: string;
            ffprobe: ffmpeg.FfprobeStream;
        }
    }) {
        const guildId = data.guildId;
        if (!this.status[guildId]) return console.warn("Player.ffmpegPlay: playerGetで定義されたはずのstatus内変数が取得できませんでした。再生はできません。");
        if (this.status[guildId].player.state.status === AudioPlayerStatus.Playing) this.status[guildId].player.stop();
        if (this.status[guildId].spawn) this.status[guildId].spawn.kill();
        if (this.status[guildId].resource) this.status[guildId].resource = undefined;
        /**
         * Created by ChatGPT
         * 速度と音程を自由に変えられます。
         */
        function buildTempoPitchFilter(
            tempo: number = 1,
            pitch: number = 0,
            sampleRate: number = 48000
        ): string {
            const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
            const round6 = (v: number) => Math.round(v * 1e6) / 1e6;

            const T0 = Number.isFinite(tempo) && tempo > 0 ? tempo : 1;
            const T = round6(clamp(T0, 0.01, 100));
            const P0 = Number.isFinite(pitch) ? pitch : 0;
            const pitchRatio = round6(Math.pow(2, P0 / 12));

            const absSemi = Math.abs(P0);
            const near1 = (T >= 0.95 && T <= 1.05);
            const micro = (T >= 0.85 && T <= 1.15);
            const fast = (T > 1.25);
            const highPitchUp = (P0 >= 12); // 大きく上げる(+12以上)ときのアーチファクト抑制

            // ★ ピッチを少し下げる時（-1〜-3）＆テンポ≈1：エコー抑制プロファイル
            // ねらい：残響感↓（window短め/phase=laminar/平滑OFF/位相一貫性優先）
            // ＊formant=shifted は“声質がやや低く”なるが、エコー感は減る傾向
            const isDownPitchEchoSensitive = (P0 < 0 && absSemi <= 3 && near1);
            const optsDownPitch = [
                `tempo=${T}`, `pitch=${pitchRatio}`,
                `transients=crisp`,
                `detector=soft`,          // ボーカル寄りの検出
                `phase=laminar`,
                `window=standard`,        // long よりにじみ少
                `smoothing=off`,          // 平滑で“もわっ”を避ける
                `formant=shifted`,        // preserved で出る残響感を回避
                `pitchq=consistency`,     // 位相一貫性を最優先
                `channels=together`,
            ];

            // 微調整域（反コーラス寄り）
            const optsMicro = [
                `tempo=${T}`, `pitch=${pitchRatio}`,
                `transients=crisp`,
                `detector=compound`,
                `phase=laminar`,
                `window=standard`,
                `smoothing=off`,
                `formant=preserved`,
                `pitchq=consistency`,
                `channels=together`,
            ];

            // 高速域（アンチ・チリ）
            const optsFast = [
                `tempo=${T}`, `pitch=${pitchRatio}`,
                `transients=crisp`,
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
                `transients=crisp`,
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
                `transients=mixed`,
                `detector=compound`,
                `phase=laminar`,
                `window=long`,
                `smoothing=on`,
                `formant=preserved`,
                `pitchq=quality`,
                `channels=together`,
            ];

            const opts = (highPitchUp ? optsHighPitchUp
                : isDownPitchEchoSensitive ? optsDownPitch
                : micro ? optsMicro
                : fast ? optsFast
                : optsHQ).join(":");

            // 仕上げ soxr（高品質リサンプル）
            return `rubberband=${opts},aresample=${sampleRate}:resampler=soxr:precision=28`;
        }
        const currentTempo = this.status[guildId].tempo ?? 1;
        const currentPitch = this.status[guildId].pitch ?? 0;
        const opusBitrate = (Math.abs(currentPitch) >= 12 || currentTempo > 1.25) ? "160k" : "128k";
        this.status[guildId].spawn = spawn("ffmpeg", [
            "-hide_banner", "-loglevel", "error", "-nostdin",
            "-ss", toTimestamp(this.status[guildId].playtimeMargin || 0),
            "-i", data.meta.filePath,
            "-ar", "48000",
            "-ac", "2",
            "-c:a", "libopus",
            "-b:a", opusBitrate,
            "-vbr", "on",
            "-application", "audio",
            "-frame_duration", "20",
            "-filter:a", buildTempoPitchFilter(this.status[guildId].tempo, this.status[guildId].pitch),
            "-f", "ogg",
            "pipe:1"
        ], { stdio: ["ignore", "pipe", "pipe"] });
        this.status[guildId].spawn.on("error", e => console.log(e));
        this.status[guildId].spawn.stderr.on("error", e => console.log(e));
        // === FFmpeg 出力バッファ（約1分相当を想定）===
        // Ogg/Opus は可変ビットレートのため厳密な秒数ではありませんが、
        // ここでは ~8〜12MB 程度のバッファで 1 分前後を目安にします。
        // 必要に応じて値を調整してください。
        const BUFFER_BYTES = 12 * 1024 * 1024; // 12MB くらい
        const bufferedOut = new Stream.PassThrough({ highWaterMark: BUFFER_BYTES });
        this.status[guildId].spawn.stdout.pipe(bufferedOut);
        this.status[guildId].spawn.stderr.on("data", data => {
            const msg = data.toString();
            // 無視してよい正常系エラー
            const ignorePatterns = [
                "Broken pipe",
                "Error muxing a packet",
                "Error writing trailer",
                "Error closing file",
                "Error submitting a packet to the muxer",
                "Task finished with error code",
                "Terminating thread with return code"
            ];
            if (ignorePatterns.some(p => msg.includes(p))) return; // 無視
            console.error("[ffmpeg stderr]", msg); // 本当のエラーのみ出力
        });
        // 8. 再生するためのリソースを作成。
        this.status[guildId].resource = createAudioResource(bufferedOut, {
            inputType: StreamType.OggOpus,
            inlineVolume: true
        });
        this.status[guildId].resource.volume?.setVolume((this.status[guildId].volume || 100) / 750);
        // 9. 再生を開始。
        this.status[guildId].player.play(this.status[guildId].resource);
    }
    /** 
     * 指定した内容に強制的に切り替えます。
     */
    async forcedPlay(data: {
        /** どのサーバーで再生するかを決めます。 */
        guildId: string;
        /** どのVCで再生するかを決めます。指定しない場合、再生ができないことがあります。 */
        channelId?: string;
        /** もしVCに参加していなかったらこれが必要です。指定しない場合、VCに参加できません。 */
        adapterCreator?: DiscordGatewayAdapterCreator;
        /** どのソースを再生するかを指定します。 */
        source: Playlist;
        /** どの位置から再生するかを指定します。予想外の位置の場合自動で補正されます。 */
        playtime: number;
        /** どの速度で再生するかを指定します。0.1-20から外れていても自動で補正されます。 */
        tempo: number;
        /** どの音程で再生するかを指定します。-100から100まで選べます。外れていても自動で補正されます。 */
        pitch: number;
        /** 声を削除するか、声のみにするかを決められます。0が声なし、1が通常、2が声のみです。小数点を使うと音量を変えられます。0-2の範囲外は自動で修正されます。入力しないと、通常再生になります。 */
        voiceVolume?: number;
        /** 音量を決められます。100%にしたいときは100と入力します。0以上であれば無制限です。0以下は自動で補正されます。 */
        volume: number;
    }, statusCallback?: (status: "loading" | "downloading" | "converting" | "formatchoosing" | "done", body: {
        percent?: number;
        type?: "niconico" | "youtube" | "twitter";
    }) => void) {
        const meta = await this.#fileMetaGet(data.source, statusCallback || (() => { }));
        if (!meta) return console.warn("Player.forcedPlay: metaが取得できませんでした。再生はできません。");
        const player = await this.#playerGet(data.guildId, data.channelId, data.adapterCreator);
        if (!player) return console.warn("Player.forcedPlay: playerが取得できませんでした。再生はできません。");
        const guildId = data.guildId;
        if (!this.status[guildId]) return console.warn("Player.forcedPlay: playerGetで定義されたはずのstatus内変数が取得できませんでした。再生はできません。");
        this.status[guildId].playing = data.source;
        // 7. FFmpeg再生ストリームを作成。
        this.status[guildId].playtimeMargin = (data.playtime > 0) ? (data.playtime < Number(meta.ffprobe.duration)) ? data.playtime : Number(meta.ffprobe.duration) : 0;
        this.status[guildId].tempo = (data.tempo > 0.1) ? (data.tempo < 20) ? data.tempo : 20 : 0.1;
        this.status[guildId].pitch = (data.pitch > -100) ? (data.pitch < 100) ? data.pitch : 100 : -100;
        this.status[guildId].volume = Math.pow(10, (((data.volume > 0) ? data.volume : 0) - 100) / 20) * 100;
        this.ffmpegPlay({
            guildId: data.guildId,
            channelId: data.channelId,
            adapterCreator: data.adapterCreator,
            meta: meta,
        })

    }
    /** 再生を停止します。サーバー内のどのチャンネルであっても停止をします。 */
    stop(guildId: string) {
        if (this.status[guildId]) {
            this.status[guildId].player.stop();
            if (this.status[guildId].spawn) this.status[guildId].spawn.kill();
            if (this.status[guildId].playing) this.status[guildId].playing = undefined;
        }
        const oldConnection = getVoiceConnection(guildId);
        if (oldConnection) oldConnection.destroy(); // destroyedイベントでplayerの登録は解除されます。
    }
    /** 現在の再生位置を出力します。 */
    playtimeGet(guildId: string) {
        return (this.status[guildId]?.playtimeMargin || 0) + (this.status[guildId]?.resource ? this.status[guildId].resource.playbackDuration / 1000 * (this.status[guildId].tempo || 1) : 0);
    }
    async playtimeSet(guildId: string, playtime: number) {
        if (!this.status[guildId] || !this.status[guildId].playing) return;
        const meta = await this.#fileMetaGet(this.status[guildId].playing, (() => { }));
        if (!meta) return;
        this.status[guildId].playtimeMargin = (playtime > 0) ? (playtime < Number(meta.ffprobe.duration)) ? playtime : Number(meta.ffprobe.duration) : 0;
        this.ffmpegPlay({
            guildId: guildId,
            meta: meta,
        })
    }
    /** 再生するファイルを変更します。FFmpeg依存のため、複雑なコードになっています。 */
    async sourceSet(guildId: string, source: Playlist, statusCallback?: (status: "loading" | "downloading" | "converting" | "formatchoosing" | "done", body: {
        percent?: number;
        type?: "niconico" | "youtube" | "twitter";
    }) => void) {
        if (!this.status[guildId]) return;
        this.status[guildId].playing = source;
        this.status[guildId].playtimeMargin = 0;
        const meta = await this.#fileMetaGet(this.status[guildId].playing, statusCallback || (() => { }));
        if (!meta) return;
        this.ffmpegPlay({
            guildId: guildId,
            meta: meta,
        })
    }
    /** 現在の再生しているメディアを出力します。VC情報が取得できないと再生していない判定として、undefinedを返します。 */
    playingGet(guildId: string) {
        return getVoiceConnection(guildId) ? this.status[guildId]?.playing : undefined;
    }
    /** 音量を設定します。 */
    volumeSet(guildId: string, volume: number) {
        if (!this.status[guildId]) return;
        this.status[guildId].volume = Math.pow(10, (((volume > 0) ? volume : 0) - 100) / 20) * 100;
        this.status[guildId].resource?.volume?.setVolume((this.status[guildId].volume || 100) / 750);
    }
    /** 速度を設定します。FFmpeg依存のため、複雑なコードになっています。新しいAPIになったら簡単になります。 */
    async speedSet(guildId: string, tempo: number) {
        if (!this.status[guildId] || !this.status[guildId].playing) return;
        this.status[guildId].playtimeMargin = this.playtimeGet(guildId);
        this.status[guildId].tempo = (tempo > 0.1) ? (tempo < 20) ? tempo : 20 : 0.1;
        const meta = await this.#fileMetaGet(this.status[guildId].playing, () => { });
        if (!meta) return;
        this.ffmpegPlay({
            guildId: guildId,
            meta: meta,
        })
    }
    /** 音程を設定します。FFmpeg依存のため、複雑なコードになっています。新しいAPIになったら簡単になります。 */
    async pitchSet(guildId: string, pitch: number) {
        if (!this.status[guildId] || !this.status[guildId].playing) return;
        this.status[guildId].playtimeMargin = this.playtimeGet(guildId);
        this.status[guildId].pitch = (pitch > -100) ? (pitch < 100) ? pitch : 100 : -100;
        const meta = await this.#fileMetaGet(this.status[guildId].playing, () => { });
        if (!meta) return;
        this.ffmpegPlay({
            guildId: guildId,
            meta: meta,
        })
    }
}
