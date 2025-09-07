import { DiscordGatewayAdapterCreator, getVoiceConnection, joinVoiceChannel, VoiceConnectionStatus, AudioPlayer, AudioPlayerStatus, createAudioResource, StreamType, entersState, PlayerSubscription, AudioResource, AudioPlayerState } from "@discordjs/voice";
import { Playlist } from "./envJSON.js";
import { SourcePathManager } from "./sourcePathManager.js";
import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import { EventEmitter } from "events";
import { AudioSource, WAPAPI, WebAudioPlayer } from "./webAudioAPI/webAudioAPI.js";


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
            /** 再生が１０秒間されなかったときにタイムアウトするためのものです。 */
            timeout?: NodeJS.Timeout;
            /** 再生が終了したとコールバックするまでの猶予です。 */
            endCallbackTimeout?: NodeJS.Timeout;
            playing?: Playlist;
            wap?: WAPAPI;
            resource?: AudioResource;
            mainAudio?: AudioSource;
        } | undefined;
    } = {};
    /** 
     * YouTube、ニコニコ動画、オリジナル音声、ボイス音声などのデータを管理するクラスです。
     * 
     * プレイヤー内でクラスを管理します。
     */
    sourcePathManager: SourcePathManager;
    /** 
     * 実際に音声を再生するために使用するものです。
     */
    webAudioPlayer: WebAudioPlayer;
    constructor() {
        super();
        this.webAudioPlayer = new WebAudioPlayer();
        this.sourcePathManager = new SourcePathManager();
    }
    /** ファイルパスやメタデータを取得します。undefinedだとファイルが存在しないか正しい内容でないか、壊れたファイルです。 */
    async #fileMetaGet(source: Playlist) {
        // 1. 音声ファイルを取得する。
        const filePath = await this.sourcePathManager.getAudioPath(source);
        if (!filePath) return; // ファイルが取得できずエラーが起きたときは何もしない。
        // 2. 音声のメタデータを取得する。
        const ffprobe = (await new Promise<ffmpeg.FfprobeStream | undefined>((resolve, reject) => {
            if (!filePath || !fs.existsSync(filePath)) return resolve(undefined);
            ffmpeg.ffprobe(filePath, (err, data) => {
                if (err) return reject(err);
                if (data.streams.length <= 0) return resolve(undefined);
                resolve(data.streams[0]);
            });
        }));
        if (!ffprobe) return; // ファイルが取得できないか、エラーが起きたときは何もしない。
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
                this.status[guildId].timeout = setTimeout(() => {
                    if (this.status[guildId]) {
                        this.status[guildId].subscription?.unsubscribe();
                        this.status[guildId].subscription = undefined;
                        this.status[guildId].timeout = undefined;
                    }
                    const oldConnection = getVoiceConnection(guildId);
                    if (oldConnection) oldConnection.destroy();
                }, 10000);
            }
        };
        function playerNotIdleEvent(this: Player, newState: AudioPlayerState) {
            if (newState.status !== AudioPlayerStatus.Idle) {
                if (this.status[guildId]?.endCallbackTimeout) {
                    clearTimeout(this.status[guildId].endCallbackTimeout);
                    this.status[guildId].endCallbackTimeout = undefined;
                }
                if (this.status[guildId]?.timeout) {
                    clearTimeout(this.status[guildId].timeout);
                    this.status[guildId].timeout = undefined;
                }
            }
        };
        // 1. 古い接続を取得する。
        const oldConnection = getVoiceConnection(guildId);
        if (oldConnection) {
            // 1. 古い接続が接続したいチャンネルに参加している場合はそのまま利用する。
            if (!channelId || (oldConnection.joinConfig.channelId === channelId)) {
                const player = this.status[guildId]?.player;
                if (player) return player;
                else {
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
        if (!channelId || !adapterCreator) return;
        // 2. 古い接続が正しい状態じゃなかったり存在しなかったら、新しい接続を始める。
        const connection = joinVoiceChannel({ guildId: guildId, channelId: channelId, adapterCreator: adapterCreator });
        // 3. プレイヤーを作成し、VCの接続を待った後にプレイヤーを登録して返す。
        const player = new AudioPlayer();
        player.on(AudioPlayerStatus.Idle, (oldState, newState) => {
            playerIdleEvent.call(this);
        });
        player.on("stateChange", (oldState, newState) => {
            playerNotIdleEvent.call(this, newState);
        });
        try {
            await entersState(connection, VoiceConnectionStatus.Ready, 10000);
        } catch (e) {
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
        speed: number;
        /** 声を削除するか、声のみにするかを決められます。0が声なし、1が通常、2が声のみです。小数点を使うと音量を変えられます。0-2の範囲外は自動で修正されます。入力しないと、通常再生になります。 */
        voiceVolume?: number;
        /** 音量を決められます。100%にしたいときは100と入力します。0以上であれば無制限です。0以下は自動で補正されます。 */
        volume: number;
    }) {
        const meta = await this.#fileMetaGet(data.source);
        if (!meta) return;
        const player = await this.#playerGet(data.guildId, data.channelId, data.adapterCreator);
        if (!player) return;
        const guildId = data.guildId;
        if (!this.status[guildId]) return;
        this.status[guildId].playing = data.source;
        if (this.status[guildId].mainAudio) await this.status[guildId].mainAudio.remove();
        if (this.status[guildId].resource) player.stop();
        this.status[guildId].resource = undefined;
        if (this.status[guildId].wap) await this.webAudioPlayer.send({ type: "streamEnd", playerId: this.status[guildId].wap.playerId });
        this.status[guildId].wap = undefined;
        this.status[guildId].wap = await this.webAudioPlayer.getPlayer();
        if (!this.status[guildId].wap) return;
        this.status[guildId].resource = createAudioResource(this.status[guildId].wap.stream);
        player.play(this.status[guildId].resource);
        this.status[guildId].mainAudio = await this.status[guildId].wap.addAudioSource(meta.filePath);
        if (!this.status[guildId].mainAudio) {
            await this.webAudioPlayer.send({ type: "streamEnd", playerId: this.status[guildId].wap.playerId });
            return;
        }
        await this.status[guildId].mainAudio.play();
        console.log("おk");
    }
    /** 再生を停止します。サーバー内のどのチャンネルであっても停止をします。 */
    async stop(guildId: string) {
        if (this.status[guildId]) {
            if (this.status[guildId].mainAudio) await this.status[guildId].mainAudio.remove();
            this.status[guildId].resource = undefined;
            if (this.status[guildId].wap) await this.webAudioPlayer.send({ type: "streamEnd", playerId: this.status[guildId].wap.playerId });
            this.status[guildId].wap = undefined;
        }
        const oldConnection = getVoiceConnection(guildId);
        if (oldConnection) oldConnection.destroy(); // destroyedイベントでplayerの登録は解除されます。
    }
    /** 現在の再生位置を出力します。 */
    async playtimeGet(guildId: string) {
        return this.status[guildId]?.mainAudio ? await this.status[guildId].mainAudio.playTimeGet() : 0;
    }
    async playtimeSet(guildId: string, playtime: number) {
    }
    /** 再生するファイルを変更します。 */
    async sourceSet(guildId: string, source: Playlist) {
    }
    /** 現在の再生しているメディアを出力します。 */
    playingGet(guildId: string) {
        return this.status[guildId]?.playing;
    }
    /** 音量を設定します。 */
    volumeSet(guildId: string, volume: number) {
        this.status[guildId]?.mainAudio?.volumeSet(volume / 750);
    }
    /** 速度を設定します。 */
    async speedSet(guildId: string, speed: number) {
        const result = await this.status[guildId]?.mainAudio?.pitchSet(speed);
    }
}
