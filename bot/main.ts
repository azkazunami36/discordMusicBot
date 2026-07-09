import * as Discord from "discord.js";
import * as DiscordVoice from "@discordjs/voice";
import Stream, { EventEmitter } from "stream";
import { ChildProcessByStdio, spawn } from "child_process";

/**
 * プレイヤークラスです。
 * 
 * 主にこのクラスを使ってさまざまなクライアントに対して再生状態を変更したりすることができます。
 * 
 * 再生状態の追跡・アクティビティ記録・Discord.jsのプレイヤーを管理するクラスを同梱しています。
 * 
 * このクラス単体の役割は、全ての抽象化されたクラスを統合し、外部から操作できるようにするためのものです。しかし、ほとんどの場合このクラスで完結する思想です。
 */
class Player {
    discordClient: Discord.Client;
    constructor(discordClient: Discord.Client) {
        this.discordClient = discordClient;
    }
    /**
     * デバイスIDとセッションIDを紐付けます。デバイスがどのセッションに参加しているかを検索するのに役立ちます。
     */
    deviceStatus = new Map<string, string>();
}

/**
 * 再生に使用するソースを識別するための情報です。
 * 
 * 以後１つの曲にボーカルトラックやドラムトラックといった具合で分割された音声ファイルを提供する場合がありますが、それをここに含める必要は現時点でありません。しかし、プレイリストにそれら情報を記録するといった手段が現れた場合、この型定義を削除して、そのプレイリストの型定義を使用することで拡張できます。
 */
interface FocusSource {
    /** 使用するサービス名です。例: YouTube、アップロードされたファイル等 */
    service: string;
    /** 識別するためのIDです。 */
    id: string;
    /** 存在する場合、ソース番号です。 */
    item: number;
}

/**
 * デバイスと接続するためのシステムをここに定義します。関数が呼ばれた際に、どのように行動するかをここで決定します。
 * 
 * デバイスを破棄する場合は必ずこのクラスのdestroyを呼び出してください。
 */
interface ConnectSystemFunctions {
    device: Device;
    deviceType: DeviceType;
    get destroyed(): boolean;
    /** システムの状態を示します。readyの場合正しく関数を受け付けますが、notworkingの場合関数を送信しても処理はクライアントに届きません。 */
    get status(): "ready" | "notworking";
    syncPlayStatus(): void;
    destroy(): void;
}

/**
 * 現在未完成のイベントです。設計が明確になり次第実装します。
 */
interface PlaySessionEvent {
    play: [];
    repeat: [];
    error: [error: { error?: Error; unknown?: unknown; }];
}

declare interface PlaySession {
    on<K extends keyof PlaySessionEvent>(event: K, listener: (...args: PlaySessionEvent[K]) => void): this;
    once<K extends keyof PlaySessionEvent>(event: K, listener: (...args: PlaySessionEvent[K]) => void): this;
    off<K extends keyof PlaySessionEvent>(event: K, listener: (...args: PlaySessionEvent[K]) => void): this;
    emit<K extends keyof PlaySessionEvent>(event: K, ...args: PlaySessionEvent[K]): boolean;
}

/**
 * セッション内での状態を記録します。これを基準に全てのデバイスが同期されるようになります。
 * 
 * 状態は再生開始時にのみ読み込みます。再生開始前の値は無効であると考えるべきです。同期関数を呼ぶ時までに書き換え済みの内容になる想定です。
 */
interface PlayStatus {
    playing: boolean;
    /** 再生を開始した時の時刻 */
    playstartMTime: number;
    /** 再生開始した時点での音声の再生位置(開始した時の時刻と逆算して現在再生位置を取得できるようにするために必要) */
    playStartPointMTime: number;
    /** 素材の全体時間 */
    durationms: number;
    repeat: "off" | "normal" | "only";
    /** 標準は1。 */
    speed: number;
    equalizer: undefined;
    /** 標準は0。1オクターブ上げるには12、逆は-12。 */
    pitch: number;
    source?: FocusSource;
}

/**
 * セッションという概念です。１人１台のデバイスに再生する場合にも使用し、複数人で曲を楽しむ場合も、１人で複数台のデバイスで音楽を楽しむ場合も、Discord.jsで音楽を楽しむ場合も使用します。
 * 
 * セッションでは同じ曲を全てのデバイスで楽しめるように設計します。同期と複数人の操作を正しく扱う必要があります。
 * 
 * ここに用意されている関数は全てデバイスに送信される関数です。しかし、デバイスIDを指定すると目的のデバイスに送信できます。
 * 
 * 再生に関するイベントを取り出せます。リピート操作やイベント操作などの取得が可能です。
 */
class PlaySession extends EventEmitter {
    player: Player;
    /**
     * このセッションのID。
     */
    readonly sessionId;
    /**
     * セッションに接続しているデバイス。また、ユーザーID同梱。
     * 
     * アクティビティ監視のため、整合性を高めてください。
     */
    #devices: Device[] = [];
    /**
     * セッションが破棄されたかどうか。クラスを利用できなくしたりするためのものでもあります。
     */
    #destroyed = false;
    /**
     * セッションが破棄されたかどうか。
     */
    get destroyed() { return this.#destroyed; }
    /**
     * セッションで共有される再生リスト。
     */
    playlist: FocusSource[] = [];
    /** 再生リストのどの位置を再生しているか。プレイリストの内容を変更した際にこの数字も変動させる必要がある場合がある。 */
    playlistPointingNumber = 0;
    #status: PlayStatus = {
        playing: false,
        playstartMTime: 0,
        playStartPointMTime: 0,
        durationms: 0,
        repeat: "off",
        speed: 1,
        equalizer: undefined,
        pitch: 0,
        source: undefined
    }
    get status() { return this.#status }

    constructor(player: Player, sessionId: string, devices?: Device[]) {
        super();
        this.player = player;
        this.sessionId = sessionId;
        if (devices) this.#devices.push(...devices);
    }
    play() {
        if (!this.status.source) return;
        this.status.playing = true;
        this.status.playstartMTime = Date.now();
        for (const device of this.#devices) {
            device.connectSystem.syncPlayStatus();
        }
    }
    pause() { }
    volume(vol: number, deviceTo: string) { }
    repeat(type: "off" | "normal" | "only") { }
    speed(vol: number) { }
    equalizer() { }
    pitch(vol: number) { }
    seek(msec: number) { }
    changeSource(source: FocusSource) { }
    destroy() {
        this.#destroyed = true;
        for (const device of this.#devices) {
            device.destroy();
        }
        this.removeAllListeners();
        this.on = () => { console.error("破棄されたクラス「PlaySession」のイベントリスナーを利用しようとしました。"); return this; }
        this.emit = () => { console.error("破棄されたクラス「PlaySession」のイベントリスナーを利用しようとしました。"); return false; }
        this.addListener = () => { console.error("破棄されたクラス「PlaySession」のイベントリスナーを利用しようとしました。"); return this; }
    }
}

/** デバイスタイプです。デバイスによって実装が異なる(ことがある)ため、ここで挙動を識別する可能性もあるため、定義します。 */
type DeviceType = "Discord.js" | "Web";

/**
 * 再生先のデバイスです。デバイスごとに操作する必要のあるものがここに定義されます。
 * 
 * セッションを破棄する場合に必ずデバイスを破棄してください。
 */
class Device {
    playSession: PlaySession;
    /**
     * 誰のデバイスかを識別する。ほとんどの場合シングルだが、Discord.jsといったサービスを跨ぐ場合の例外のため、配列で対応。
     */
    readonly userId: string[];
    /**
     * クラスの処理タイプを選択する。
     */
    readonly type: DeviceType;
    /**
     * デバイスのID。ログイン時に付与される固有のID。
     */
    readonly id;
    /**
     * デバイス名。空欄でも可能。
     */
    readonly name;
    /**
     * 実際にデバイスとやりとりするためのクラスです。
     * 
     * 詳細はinterfaceで解説しています。
     */
    readonly connectSystem: DiscordConnectSystem | WebConnectSystem;
    /**
     * デバイスとの接続が破棄されたかどうか。クラスを利用できなくしたりするためのものでもあります。
     */
    #destroyed = false;
    /**
     * デバイスとの接続が破棄されたかどうか。
     */
    get destroyed() { return this.#destroyed; }
    volume = 100;
    constructor(playSession: PlaySession, userId: string[], type: DeviceType, id: string, name: string) {
        this.playSession = playSession;
        this.userId = [...userId];
        this.type = type;
        this.id = id;
        this.name = name;
        if (type === "Discord.js") {
            this.connectSystem = new DiscordConnectSystem(this);
        } else if (type === "Web") {
            this.connectSystem = new WebConnectSystem(this);
        } else this.connectSystem = new WebConnectSystem(this);
    }
    /**
     * デバイスとの接続を終了します。
     */
    destroy() {
        this.#destroyed = true;
        this.connectSystem.destroy();
    }
}

/**
 * 現在未完成のイベントです。設計が明確になり次第実装します。
 */
interface DiscordConnectSystemEvent {
    play: [];
    error: [error: { error?: Error; unknown?: unknown; }];
}

declare interface DiscordConnectSystem {
    on<K extends keyof DiscordConnectSystemEvent>(event: K, listener: (...args: DiscordConnectSystemEvent[K]) => void): this;
    once<K extends keyof DiscordConnectSystemEvent>(event: K, listener: (...args: DiscordConnectSystemEvent[K]) => void): this;
    off<K extends keyof DiscordConnectSystemEvent>(event: K, listener: (...args: DiscordConnectSystemEvent[K]) => void): this;
    emit<K extends keyof DiscordConnectSystemEvent>(event: K, ...args: DiscordConnectSystemEvent[K]): boolean;
}

/**
 * Discord.jsのボイスチャンネルと接続するためのクラスです。
 * 
 * 設計前提として
 * - Discord.js Client
 * - Guild ID
 * - Channel ID
 * が必要です。しかし、ClientはPlayerクラスに同梱します。クラス初期化時にclientを設置するだけです。
 * 
 * デバイスIDは「DiscordJs-[Guild ID]」で作成します。PlayerのdeviceStatusで検索するのに役立ちます。
 */
class DiscordConnectSystem extends EventEmitter implements ConnectSystemFunctions {
    device: Device;
    /**
     * デバイスとの接続が破棄されたかどうか。クラスを利用できなくしたりするためのものでもあります。
     */
    #destroyed = false;
    /**
     * デバイスとの接続が破棄されたかどうか。
     */
    get destroyed() { return this.#destroyed; }
    #guildId?: string;
    set guildId(id: string) { this.#guildId = id; this.voiceChannelConnectSet() }
    #channelId?: string;
    set channelId(id: string) { this.#channelId = id; this.voiceChannelConnectSet() }
    /**
     * 接続です。ここに独自で"destroy"イベントリスナーを準備しているため、
     * ```ts
     * this.subscription.connect.emit("destroy");
     * ```
     * を実行するだけで接続だけでなく関連するクラス自体の破棄処理が行われます。
     * 
     * しかし通常はクラスのdestroyを使うことが望ましいです。バグ回避です。
     */
    subscription?: DiscordVoice.PlayerSubscription;
    /** FFmpegを管理するためのものです。ほとんどの場合killするために保持されます。 */
    spawn?: ChildProcessByStdio<null, Stream.Readable, Stream.Readable>;
    /** 再生中の音声の操作を行うものです。 */
    resource?: DiscordVoice.AudioResource;
    /** 
     * システムの状態を示します。readyの場合正しく関数を受け付けますが、notworkingの場合関数を送信しても処理はクライアントに届きません。 
     */
    get status(): "ready" | "notworking" { if (this.#guildId && this.#channelId && this.subscription && !this.destroyed) return "ready"; else return "notworking" }
    readonly deviceType = "Discord.js";
    constructor(device: Device) {
        super();
        this.device = device;
    }
    /**
     * 全ての準備が整った場合ボイスチャンネルに接続します。また、再接続・接続先の修正のために呼び出しても構いません。
     * 
     * 接続不良はこの関数を呼び出して修正も可能ですが、現時点の仕様を貫いたままではあまり最適な修正方法ではないため、必要な場合は継続的な改良が必要かも。
     */
    async voiceChannelConnectSet() {
        if (!this.#guildId || !this.#channelId) return;
        /**
         * oldConnectionに引っかかる前にあらかじめ接続を破棄します。
         * 
         * 意図的に前回の接続を破棄したか、意図せず接続を破棄したか区別するためです。
         */
        if (this.subscription) this.subscription.connection.emit("destroy");
        const voiceAdapterCreatorGet = async (guildId: string): Promise<DiscordVoice.DiscordGatewayAdapterCreator | undefined> => {
            try {
                if (!guildId) return;
                const guild = this.device.playSession.player.discordClient.guilds.cache.get(guildId) || await this.device.playSession.player.discordClient.guilds.fetch(guildId);
                return guild.voiceAdapterCreator
            } catch { }
        }
        const oldConnection = DiscordVoice.getVoiceConnection(this.#guildId);
        if (oldConnection) {
            // もし過去の接続があったら問答無用で破棄
            let destroyed = false;
            oldConnection.addListener("destroy", () => {
                destroyed = true;
            });
            oldConnection.emit("destroy"); // 独自で破棄する旨を送信
            if (!destroyed) {
                oldConnection.destroy();
            }
            console.log(
                "すでに接続中のサーバーに新しいセッションで再度接続を試みたため、前回のセッションが破棄されました。",
                "通常同じサーバーに対して複数のセッションが開始される設計を想定していないため、バグのマークとしてログを出力します。",
                !destroyed ? "また、この接続はクラス外で作成された接続です。" : ""
            );
        }
        const adapterCreator = await voiceAdapterCreatorGet(this.#guildId);
        if (!adapterCreator) return;
        const connection = DiscordVoice.joinVoiceChannel({ guildId: this.#guildId, channelId: this.#channelId, adapterCreator });
        const player = new DiscordVoice.AudioPlayer();
        const subscription = connection.subscribe(player);
        if (!subscription) {
            connection.destroy();
            return;
        }
        this.subscription = subscription;
        connection.addListener("destroy", () => { // 独自で破棄処理を行う
            connection.removeAllListeners();
            player.removeAllListeners();
            subscription?.unsubscribe(); // playerとconnectionの登録を解除
            player.emit("destroy"); // playerを利用している先にも通知を行う
            connection.destroy(); // 自分自身を破棄する
            this.subscription = undefined;
        });
    }
    #statusTemp?: PlayStatus;
    #volumeTemp?: number;
    /**
     * セッションと再生状態を一致させます。
     * 
     * Discord再生ロジックではなるべく音声の遮断がないように注意して実装しています。
     * 
     * 音量変更の場合は高速に処理されます。何も内容が変わらない場合は何も処理しないようにしています。
     */
    syncPlayStatus() {
        if (!this.subscription) return;
        if (!this.device.playSession.status.playing) {
            this.spawn?.kill(); // 再生を終了しておしまい。
            this.spawn = undefined;
            return;
        }
        if (this.#statusTemp) {
            function matchTest(base: Record<string, any>, to: Record<string, any>, ignore: string[]) {
                const ignoreSet = new Set(ignore);
                const baseStr = Object.keys(base).filter(name => !ignoreSet.has(name));
                for (const name of baseStr) {
                    if (base[name] === to[name]) continue;
                    else return false;
                }
                return true;
            }
            if (matchTest(this.#statusTemp, this.device.playSession.status, [])) return;
            if (this.#volumeTemp !== this.device.volume && matchTest(this.#statusTemp, this.device.playSession.status, [])) {
                this.resource?.volume?.setVolume(this.device.volume / 750);
                this.#volumeTemp = this.device.volume;
                return;
            }
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
        /** 基本情報と開始時刻、ファイルパスを入力 */
        const args: string[] = [
            "-hide_banner", "-loglevel", "error", "-nostdin",
            "-ss", toTimestamp(this.device.playSession.status.playstartMTime * 1000),
            "-i", "" // ファイルパスを入力する必要があるが、まだその仕組みが確定していないため後で実装しなさい！？
        ];
        /** フィルタを決定 */
        args.push(
            "-filter_complex", buildTempoPitchFilter(this.device.playSession.status.speed, this.device.playSession.status.pitch)
        );
        /** そのほか出力設定 */
        args.push(
            "-ar", "48000",
            "-ac", "2",
            "-c:a", "pcm_s16le",
            "-f", "wav",
            "pipe:1"
        );
        const app = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
        const bufferSize = 12_000_000;
        const buffer = new Stream.PassThrough({ highWaterMark: bufferSize });
        app.stdout.pipe(buffer);
        const resource = DiscordVoice.createAudioResource(buffer, {
            inputType: DiscordVoice.StreamType.Raw,
            inlineVolume: true
        });
        /** 100%はDiscordクライアントにとって音がでかいので、音量を1/7.5、大体13%を基準にします。 */
        resource.volume?.setVolume(this.device.volume / 750);
        this.spawn?.kill();
        this.spawn = app;
        this.subscription.player.play(resource);
        this.resource = resource;
        app.on("error", e => {
            try {
                console.log("spawnエラー", e);
                this.subscription?.player.stop();
                buffer.destroy();
            } catch { }
        });
        app.stderr.on("data", data => {
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
            console.error("FFmpeg内で通常とは異なるメッセージを受信しました。", msg); // 本当のエラーのみ出力
        });
        app.on("close", () => {
            try {
                this.subscription?.player.stop();
                buffer.destroy();
            } catch { }
        });
        this.#statusTemp = {...this.device.playSession.status};
        this.#volumeTemp = this.device.volume;
    }
    destroy() {
        this.#destroyed = true;
        this.spawn?.kill();
        this.subscription?.connection.emit("destroy");
        this.removeAllListeners();
        this.on = () => { console.error("破棄されたクラス「DiscordConnectSystem」のイベントリスナーを利用しようとしました。"); return this; }
        this.emit = () => { console.error("破棄されたクラス「DiscordConnectSystem」のイベントリスナーを利用しようとしました。"); return false; }
        this.addListener = () => { console.error("破棄されたクラス「DiscordConnectSystem」のイベントリスナーを利用しようとしました。"); return this; }
    }
}

class WebConnectSystem implements ConnectSystemFunctions {
    device: Device;
    /**
     * デバイスとの接続が破棄されたかどうか。クラスを利用できなくしたりするためのものでもあります。
     */
    #destroyed = false;
    /**
     * デバイスとの接続が破棄されたかどうか。
     */
    get destroyed() { return this.#destroyed; }
    /**
     * システムの状態を示します。readyの場合正しく関数を受け付けますが、notworkingの場合関数を送信しても処理はクライアントに届きません。 
     */
    get status(): "ready" { return "ready" }
    readonly deviceType = "Web";
    constructor(device: Device) {
        this.device = device;
    }
    syncPlayStatus() { }
    destroy() {
        this.#destroyed = true;
    }
}

/**
 * アクティビティを追跡するためのツールです。主にConnectSystem内で使用します。Device内では追跡しきれないことがあるため、必ずConnectSystem内に実装してください。
 * 
 * 以下のタイミングで記録する必要があります。
 * - 再生開始時
 * - シーク時
 * - 再生中断時
 * - ユーザー退出時
 * - ユーザー入室時
 * 
 * セッションクラスを入力した上で、上記のタイミングで適切な関数を呼び出し、その関数通りの記録を行います。基本的にplayとstopのみです。使い方は以下です。
 * - 速度変更はstopの後変更後の情報をplayに書き込む
 * - 最後まで再生された場合、stopを行わないでも良い
 * - シークの場合もstopの後にplayを行う
 * 
 * このクラスは生データをそのままJSONLにします。アクティビティ情報が誰のものであり、どれほど再生されたかなどを追跡する場合は、別途解析クラスを利用してください。
 * 
 * また、JSONL１行に必ずバージョンを明記します。バージョンと一致する型定義を利用し、その通りに解析してください。
 */
class ActivityRecorder { }

interface ActivityDatav1 {
    /** 
     * セッションID。複数のデバイスで再生していた場合にこのセッションIDが重なった場合は同じイベントとしてグループ化して処理することになり、少々重要です。なくてもイベント区間の重複は適切に処理されます。
     */
    sessionId: string;
    /** イベント時間 */
    timestamp: number;
    /** イベントが適用されたユーザー */
    userId: string;
    /** イベントタイプ */
    type: "play" | "stop";
    /** 再生速度 */
    speed: number;
    /** 視聴していたソース */
    source: FocusSource;
    /** 再生していた地点 */
    mtime: number;
    /** アクティビティの追加情報 */
    info: {
        type: "Discord.js";
        guildId: string;
        channelId: string;
    } | {
        type: "Web";
        deviceId: string;
        deviceName: string;
    }
}

/*
設計

プレイヤークラスは操作用クラスを返答する。それには「getPlayer」を利用する。ユーザーIDを入力すると、セッションIDが生成されて返ってくる。セッションIDはユーザーIDと紐づけられるため、連番でつけられる。
また、getPlayerにはデバイス名やデバイスタイプなども入力できる。そして、Discord.jsと入力された時に限り、Discord.jsの状態を扱うクラスが内部的に使用される。

getPlayerで返ってくるクラス名を「PlaySession」とする。destroyすると再生中のデバイスが無効化される。ただし、再生されないまま５分以上や、再生中の楽曲が停止したのちにリピートが起こらないなどした場合、そこから１時間ほどブランクが続くと自動でdestroyされる。

getPlayerでセッションを取得するが、listPlayerとユーザーIDで全てのセッションIDを見ることもできる。また、セッション情報はPlaySessionの中に記録されている。

セッションをグループ化する構想を考える。グループ化した際、新しいセッションIDを作成し、過去のセッションIDを破棄すればいいと考える。その前に、どのセッションがどのデバイスと関連づけられているかを判別する方法を改めて考え直す。

デバイスはセッションIDを取得しようと試みて、成功すると以後そのセッションIDをsubscribeして、監視を続ける。そのセッションIDをとりあえず複数デバイスに分ければいい。

しかし、どのデバイスがセッションIDを取得しているのか、利用しているのかを追跡する必要がある。各デバイスにはログイン時にデバイス識別のできるIDを付与すると良いかもしれない。連番で問題ない。

次に、セッションは他人とも共有できるようにする。例えばユーザーが複数人いるなど。その場合はユーザーIDを配列にする。デバイス情報にもユーザーIDを同梱することで、デバイスの識別を間違えないようにする。





*/
