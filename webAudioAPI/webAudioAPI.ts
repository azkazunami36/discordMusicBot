import pkg from "electron";
const { app, BrowserWindow, ipcMain } = pkg;
import { randomUUID } from "crypto";
import { Download, Upload } from "./interface.js";
import { EventEmitter, Readable } from "stream";
import fs, { stat } from "fs";

/** WebAudioPlayerを使いやすくしたAPIです。 */
export class WAPAPI {
    #playerId: string;
    get playerId() { return this.#playerId }
    #webAudioPlayer: WebAudioPlayer;
    #stream: Readable;
    get stream() { return this.#stream }
    #fileIds: string[] = [];
    constructor(playerId: string, webAudioPlayer: WebAudioPlayer, stream: Readable) { this.#playerId = playerId; this.#webAudioPlayer = webAudioPlayer; this.#stream = stream; };
    /** Web Audio APIに音声を追加します。 */
    async addAudioSource(sourcePath: string) {
        const fileId = randomUUID();
        if (!fs.existsSync(sourcePath)) return;
        const buffer = fs.readFileSync(sourcePath).buffer;
        const result = await this.#webAudioPlayer.send({ type: "sourceSet", fileId, buffer, playerId: this.#playerId });
        if (!result?.status) return;
        this.#fileIds.push(fileId);
        return new AudioSource(fileId, this.#playerId, this, this.#webAudioPlayer);
    }
    /** Web Audio APIから音声を削除します。削除したらAudioSourceクラスは意味をなさなくなります。 */
    async removeAudioSource(asik: AudioSource): Promise<void> {
        await this.#webAudioPlayer.send({ type: "sourceRemove", fileId: asik.fileId, playerId: this.#playerId });
        const index = this.#fileIds.findIndex(data => data === asik.fileId);
        if (index !== -1) this.#fileIds.splice(index, 1);
    }
}

/** 特定のPlayerに関連づけられた音声を操作するAPIです。 */
export class AudioSource {
    #fileId: string;
    get fileId() { return this.#fileId }
    #playerId: string;
    get playerId() { return this.#playerId }
    #WAPAPI: WAPAPI;
    #webAudioPlayer: WebAudioPlayer;
    #playtime = 0;
    constructor(fileId: string, playerId: string, WAPAPI: WAPAPI, webAudioPlayer: WebAudioPlayer) { this.#fileId = fileId; this.#playerId = playerId; this.#WAPAPI = WAPAPI; this.#webAudioPlayer = webAudioPlayer; };
    remove() { return this.#WAPAPI.removeAudioSource(this); }
    async #statusGet() {
        const status = await this.#webAudioPlayer.send({ type: "sourceStatus", fileId: this.#fileId, playerId: this.#playerId });
        if (status?.type === "sourceStatus") {
            return status;
        }
    }
    async playingIs() {
        return (await this.#statusGet())?.playing;
    }
    async play() {
        const playing = await this.playingIs();
        const result = await this.#webAudioPlayer.send({ type: "sourceConfig", fileId: this.#fileId, playerId: this.#playerId, play: true, playtime: playing ? this.#playtime : await this.playTimeGet() || 0 });
        return result?.status;
    }
    async pause() {
        const result = await this.#webAudioPlayer.send({ type: "sourceConfig", fileId: this.#fileId, playerId: this.#playerId, play: false });
        return result?.status;
    }
    async playTimeGet() {
        return (await this.#statusGet())?.playtime;
    }
    async playTimeSet(playtime: number) {
        this.#playtime = playtime
        if (await this.playingIs()) await this.play();
        return ;
    }
    async pitchGet() {
        return (await this.#statusGet())?.pitch;
    }
    async pitchSet(pitch: number) {
        const result = await this.#webAudioPlayer.send({ type: "sourceConfig", fileId: this.#fileId, playerId: this.#playerId, play: await this.playingIs(), pitch });
        return result?.status;
    }
    async speedGet() {
        return (await this.#statusGet())?.speed;
    }
    async speedSet(speed: number) {
        const result = await this.#webAudioPlayer.send({ type: "sourceConfig", fileId: this.#fileId, playerId: this.#playerId, play: await this.playingIs(), speed });
        return result?.status;
    }
    async volumeGet() {
        return (await this.#statusGet())?.volume;
    }
    async volumeSet(volume: number) {
        const result = await this.#webAudioPlayer.send({ type: "sourceConfig", fileId: this.#fileId, playerId: this.#playerId, play: await this.playingIs(), volume });
        return result?.status;
    }
}

export class WebAudioPlayer extends EventEmitter {
    #processing = false;
    #ready = false;
    get ready() { return this.#ready; }
    window?: pkg.BrowserWindow;
    constructor() { super(); this.#init(); }
    async #init() {
        if (this.#processing) return;
        this.#processing = true;
        app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
        await app.whenReady();
        this.window = new BrowserWindow({
            show: false,
            width: 300,
            height: 300,
            webPreferences: {
                contextIsolation: true,
                sandbox: true,
                nodeIntegration: false,
                backgroundThrottling: false,
                preload: process.cwd() + "/webAudioAPI/.preload-dist/preload.js"
            },
        });

        const wc = this.window.webContents;

        const preloadReady = new Promise<void>((resolve) => {
            const onPreloadReady = (event: pkg.IpcMainEvent) => {
                if (event.sender === wc) {
                    ipcMain.off("preload-ready", onPreloadReady);
                    resolve();
                }
            };
            ipcMain.on("preload-ready", onPreloadReady);
        });

        this.window.removeMenu();

        await this.window.loadFile(process.cwd() + "/webAudioAPI/index.html");

        await preloadReady;
        this.window.webContents.openDevTools({ mode: "detach" });
        app.on("window-all-closed", () => app.quit());
        this.#ready = true;
        this.emit("ready");
    }
    /**
     * Web Audio APIを管理しているElectronに向けてデータを送信します。かなり低レイヤーなコードです。
     */
    async send(json: Upload): Promise<Download | undefined> {
        if (!this.window) return;
        const id = randomUUID();
        this.window.webContents.send("post", { id, data: json });
        return new Promise(resolve => { ipcMain.once("post-" + id, (ignore, data) => { resolve(data); }) });
    }
    /**
     * 新しいプレイヤーストリームを作成したい場合はこの関数を使用してください。ここに入力したIDがこれから使用するプレイヤーIDとなります。ストリームが破棄されると、自動でプレイヤーは削除されます。
     * 
     * Web Audio APIの出力をここから取得します。pipeされるとすぐに再生開始します。
     * 
     * さまざまな例外は全てエラーになります。pipe前にerrorを処理するようにしてください。
     * 
     * 正しい操作をする場合は、sendで要求をしてください。
     * 
     * @param playerId Web Audio APIの操作用IDを入力します。
     */
    async stream(playerId: string) {
        if (!this.window) return;
        const createResult = await this.send({ type: "streamCreate", playerId: playerId });
        if (!createResult?.status) return;
        const stream = new Readable({ read: () => { }, highWaterMark: 1024 * 1024 });
        let ended = false;
        let cleaned = false;

        /** スタート合図です。 */
        stream.once("resume", async () => {
            ipcMain.on("stream-" + playerId, (ignore, chunk) => { push(chunk); });
            ipcMain.once("stream-error-" + playerId, (ignore, error) => {
                stream.destroy(error);
            });
            ipcMain.once("stream-end-" + playerId, (ignore) => {
                end();
                ipcMain.removeAllListeners("stream-" + playerId);
            });
            await this.send({ type: "streamReady", playerId: playerId });
        });
        /** ストリームが終了されたら後始末をします。 */
        const cleanUp = () => {
            if (cleaned) return;
            cleaned = true;
            ipcMain.removeAllListeners("stream-" + playerId);
            this.send({ type: "streamEnd", playerId: playerId });
        }
        /** Web Audio APIがendしたらストリームを終了します。 */
        function end() {
            push(null);
            ended = true;
        }
        /** ストリームにデータを送ります。 */
        function push(chunk: Buffer | Uint8Array | null) {
            if (ended) return;
            const result = stream.push(chunk);
            if (!result) stream.destroy(new Error("バッファが異常に蓄積しました。"));
        }
        stream.once("close", cleanUp);
        stream.once("end", cleanUp);

        return stream;
    }
    /** 簡易操作のできるPlayerAPIを返します。作成に失敗するとundefinedになります。 */
    async getPlayer() {
        const playerId = randomUUID();
        const stream = await this.stream(playerId);
        if (!stream) return;
        return new WAPAPI(playerId, this, stream);
    }
}

