const time = Date.now();
import { SourceManagerResultUnidata } from "./interface.js";
import { fetch, Agent } from 'undici';

export type ServiceType = "youtube" | "niconico" | "twitter" | "soundcloud";
type getSetvice = "youtube" | "niconico" | "twitter" | "soundcloud" | "urlparse";
type getContent = "audio" | "json";

export interface UniSourceData {
    title?: string;
    userName?: string;
    userId?: string;
    description?: string;
    thumbnailUrl?: string;
    userIconUrl?: string;
};

/**
 * このクラスを使う場合、ifで内容をチェックする前に`fetch()`をしてください。
 * 
 * すでに準備が整っている場合、何も起こらずに`fetch()`関数を通過します。そのあとにifを使って内容を解析してください。
 */
export class Unidata<T> {
    #master: DBmgrAPI;
    #id: string;
    #servicetype: ServiceType;
    #data: UniSourceData[] = [];
    #fetched = false;
    #sourceReadyIs = false;
    /**
     * １つの動画に複数のソースがある場合、選択できます。
     */
    index: number;
    metadata: T
    constructor(master: DBmgrAPI, id: string, servicetype: ServiceType, index: number, metadata: T) {
        this.#master = master;
        this.#id = id;
        this.#servicetype = servicetype;
        this.index = index;
        this.metadata = metadata;
    }
    /** エラーが発生すると格納されます。 */
    error: string[] | undefined;
    /**
     * 取得の失敗などを通知しません。ifを用いてください。
     * 
     * ステータスは以下の通りです。
     * - waiting: まだすべてのデータが存在しません。
     * - downloading: Unidataから情報を取得できる状態です。
     * - converting: 音声の準備中です。
     * - Promise end: 処理が終わったか、異常終了しました。ifでチェックし、正しく終了したかを確認してください。
     */
    async fetch(mediaReadyCheck: boolean = false, progress: (percent: number, elapsed: number, eta: number, status: "waiting" | "downloading" | "converting") => void = () => { }) {
        if (mediaReadyCheck && this.#fetched && this.#sourceReadyIs) return;
        if (!mediaReadyCheck && this.#fetched) return;
        const startTime = Date.now();
        if (!this.#fetched) {
            const interval = setInterval(() => {
                try {
                    progress(0, Date.now() - startTime, -1, "waiting");
                } catch { }
            }, this.#master.refleshrate);
            try {
                const data = await this.#dataFetch();
                if (data?.data) {
                    this.#data = data.data;
                    this.#fetched = true;
                } else {
                    if (!this.error) this.error = data?.error.dbmgrErrorCode;
                }
            } catch (e) { console.log(e); }
            clearInterval(interval);
        }
        if (mediaReadyCheck && !this.#sourceReadyIs) {
            const getTime = Date.now();
            /** 進捗が50%を超えるとこれは変換開始時間となります。 */
            let timeTmp = 0;
            function etaGet(progress: number): { eta: number, status: "downloading" | "converting", per: number } {
                if (progress < 50) {
                    timeTmp = Date.now();
                    const eta = ((Date.now() - getTime) / Math.min(progress, 50)) * 50;
                    return {
                        eta: Math.max(eta - (Date.now() - getTime) + (eta / 10)), // ffmpegでかかりそうな時間も追加している
                        status: "downloading",
                        per: (progress / 50) * 85
                    }
                } else {
                    if ((Date.now() - timeTmp) >= 2000) return {
                        eta: Math.max((((Date.now() - timeTmp) / (Math.max(50, progress) - 1)) * 50) - (Date.now() - timeTmp), 0),
                        status: "converting",
                        per: 85 + (((progress - 50) / 50) * 15)
                    }
                    else {
                        const eta = ((timeTmp - getTime) / Math.min(progress, 50)) * 5;
                        return {
                            eta: Math.max((Date.now() - timeTmp) - eta, 0),
                            status: "converting",
                            per: 85 + (((progress - 50) / 50) * 15)
                        }
                    }
                }
            }
            const interval = setInterval(async () => {
                try {
                    const data = await this.#dataFetch();
                    if (data?.progress !== undefined) {
                        const { eta, status, per } = etaGet(data.progress);
                        progress?.(Math.floor(per), Date.now() - startTime, eta, status);
                    } else if (data?.error) {
                        if (!this.error) this.error = data.error.dbmgrErrorCode;
                        clearInterval(interval);
                    }
                } catch (e) { console.log(e) }
            }, this.#master.refleshrate);
            try {
                const data = await this.#sourceWait();
                if (!data || data.error === undefined) {
                    this.#sourceReadyIs = true;
                } else {
                    if (!this.error) this.error = data.error.dbmgrErrorCode;
                }
            } catch (e) { console.log(e); }
            clearInterval(interval);

        }
    }
    async #dataFetch() {
        const uri = this.#master.uriCreator(this.#id + (this.#servicetype === "twitter" ? "-" + (this.index + 1) : ""), this.#servicetype, "json");
        const res = await fetch(uri, {
            method: "GET"
        });
        if (!res.ok) {
            try {
                const error = JSON.parse(await res.text()) as { dbmgrErrorCode: string[] };
                console.log("datafetch", error);
                return { error };
            } catch { }
        }
        const json = (await res.json() as any)?.unidata as SourceManagerResultUnidata;
        if (
            !Array.isArray(json.data)
            || json.resulttype !== "media"
            || json.id !== this.#id
            || json.servicetype !== this.#servicetype
            || json.data.find(d => !["string", "undefined"].includes(typeof d.title)
                || !["string", "undefined"].includes(typeof d.userName)
                || !["string", "undefined"].includes(typeof d.description)
                || !["string", "undefined"].includes(typeof d.thumbnailUrl)
                || !["string", "undefined"].includes(typeof d.userIconUrl)
                || !["string", "undefined"].includes(typeof d.userId))
            || !["number", "undefined"].includes(typeof json.progress)
        ) return
        return { data: json.data, progress: json.progress };
    }
    async #sourceWait() {
        const uri = this.#master.uriCreator(this.#id + (this.#servicetype === "twitter" ? "-" + (this.index + 1) : ""), this.#servicetype, "audio");
        // 1日（ミリ秒換算）：24 * 60 * 60 * 1000 = 86400000
        const ONE_DAY_MS = 86400000;

        const customAgent = new Agent({
            headersTimeout: ONE_DAY_MS, // ヘッダー待機時間を1日に延長（0にすると無制限）
            bodyTimeout: ONE_DAY_MS,    // ボディ受信時間を1日に延長（0にすると無制限）
            connectTimeout: 10000       // 接続自体のタイムアウトは10秒（任意）
        });
        const res = await fetch(uri, {
            method: "GET",
            // undiciのカスタムAgentを適用
            dispatcher: customAgent,
            // fetch自体のタイムアウトも1日に設定
            signal: AbortSignal.timeout(ONE_DAY_MS)
        });
        if (res.ok) {
            const g = res.body?.getReader();
            if (g) {
                await g.read();
            }
            return { error: undefined };
        } else {
            try {
                const error = JSON.parse(await res.text()) as { dbmgrErrorCode: string[] };
                console.log("sourceWait", error);
                return { error };
            } catch { }
        }
    }
    get length() { return this.#data.length; }
    getInfo(index: number = 0): UniSourceData | undefined { return this.#data[index]; }
    get id() { return this.#id; }
    get servicetype() { return this.#servicetype; }
    /** 情報が取得できたかどうか。稀に失敗します。 */
    get fetched() { return this.#fetched; }
    /** ソースの準備ができたかどうか。稀に失敗します。 */
    get sourceReadyIs() { return this.#sourceReadyIs };
}

export class DBmgrAPI {
    accessDomain = "localhost";
    accessPort = 81;
    httpsIs = false;
    /** 取得中に進捗状況を返します。その頻度(ms)です。 */
    refleshrate = 1000;
    /**
     * `http://localhost:81/`
     * 
     * APIのベースURLが出力されます。
     */
    get baseURL() {
        return (this.httpsIs ? "https" : "http") + "://" + this.accessDomain + ":" + this.accessPort + "/";
    }
    /** 取得したいIDやサービス名などを入力すると、URIが作成されます。 */
    uriCreator(id: string, service: getSetvice, content: getContent, arg?: string) {
        return this.baseURL + service + "/" + id + "/" + content + (arg ? "/" + arg : "");
    }
    createUnidata<T>(id: string, servicetype: ServiceType, index: number, metadata: T): Unidata<T> {
        return new Unidata(this, id, servicetype, index, metadata);
    }
    /** dbmgrのURLパーサーを利用します。 */
    async urlParser(string: string) {
        const uri = this.uriCreator("g", "urlparse", "json", string);
        const res = await fetch(uri, {
            method: "GET"
        });
        if (res.ok) {
            const json = await res.json() as SourceManagerResultUnidata;
            if (
                Array.isArray(json?.data)
                && typeof json.id === "string"
                && json.resulttype === "APIURL"
                && !json.data.find(d => typeof d.id !== "string" || typeof d.audiourl !== "string")
                && (["youtube", "niconico", "twitter", "soundcloud"] as (ServiceType)[]).includes(json.servicetype as never)
            ) return {
                playlistId: json.id === "%@not*playlist%" ? undefined : json.id,
                servicetype: json.servicetype,
                data: json.data as { id: string, audiourl: string }[]
            };
        } else {
            console.log(res.status, res.ok, res.statusText)
        }
        return undefined;
    }
}


