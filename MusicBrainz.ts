import { readFileSync, writeFileSync, existsSync } from "fs";

/**
 * MusicBrainz Release情報  
 * 例: https://musicbrainz.org/ws/2/release/<MBID>?fmt=json&inc=artist-credits
 */
export interface MusicBrainzRelease {
    /** リリースMBID（ユニークID）  
     * 例: "15d518d5-da62-4067-9d4d-93fc1cda1e23" */
    id: string;
    /** リリースタイトル  
     * 例: "まだ雨はやまない" */
    title: string;
    /** 国コード  
     * 例: "JP" */
    country?: string;
    /** 発売日  
     * 例: "2022-05-25" */
    date?: string;
    /** 発売イベント（地域などの情報） */
    "release-events"?: {
        /** 地域情報 */
        area: {
            /** 地域名  
             * 例: "Japan" */
            name: string;
            /** ソート用名称  
             * 例: "Japan" */
            "sort-name": string;
            /** 地域ID（UUID）  
             * 例: "2db42837-c832-3c27-b4a3-08198f75693c" */
            id: string;
            /** 国コード配列  
             * 例: ["JP"] */
            "iso-3166-1-codes": string[];
            /** 備考や補足情報（例: 空文字） */
            disambiguation: string;
            /** 種別（通常null） */
            type: string | null;
            /** 種別ID（通常null） */
            "type-id": string | null;
        };
        /** 発売日  
         * 例: "2022-05-25" */
        date: string;
    }[];
    /** カバーアートの存在情報 */
    "cover-art-archive"?: {
        /** Front画像が存在するか  
         * 例: true */
        front: boolean;
        /** Back画像が存在するか  
         * 例: false */
        back: boolean;
        /** 画像総数  
         * 例: 1 */
        count: number;
        /** 画像が暗く処理されているか  
         * 例: false */
        darkened: boolean;
        /** 何らかのアートワークがあるか  
         * 例: true */
        artwork: boolean;
    };
    /** バーコード  
     * 例: "4562250649683" */
    barcode?: string | null;
    /** リリースの状態  
     * 例: "Official" */
    status?: string;
    /** 状態ID  
     * 例: "4e304316-386d-3409-af2e-78857eec5cfe" */
    "status-id"?: string;
    /** パッケージ形態  
     * 例: "None" */
    packaging?: string | null;
    /** パッケージ形態ID  
     * 例: "119eba76-b343-3e02-a292-f0f00644bb9b" */
    "packaging-id"?: string | null;
    /** 品質  
     * 例: "normal" */
    quality?: string;
    /** 書式情報（言語・スクリプト） */
    "text-representation"?: {
        /** 言語コード  
         * 例: null */
        language: string | null;
        /** スクリプト  
         * 例: null */
        script: string | null;
    };
    /** 解釈や区別用の補足説明  
     * 例: "" */
    disambiguation?: string;
    /** ASIN（Amazon識別子、ない場合null）  
     * 例: null */
    asin?: string | null;
    /** アーティストクレジット */
    "artist-credit"?: {
        /** 表示名  
         * 例: "しぐれうい" */
        name: string;
        /** 結合句（例: "feat."など）  
         * 例: "" */
        joinphrase: string;
        /** 実際のアーティスト情報 */
        artist: {
            /** アーティストID（MBID）  
             * 例: "7c612c92-fa8e-4851-b33f-dce3c797c933" */
            id: string;
            /** 表示名  
             * 例: "しぐれうい" */
            name: string;
            /** ソート用名称  
             * 例: "Shigure, Ui" */
            "sort-name": string;
            /** 国コード  
             * 例: "JP" */
            country?: string;
            /** アーティストタイプ  
             * 例: "Person" */
            type?: string;
            /** タイプID  
             * 例: "b6e035f4-3ce9-331c-97df-83397230b0df" */
            "type-id"?: string;
            /** 備考  
             * 例: "VTuber and illustrator" */
            disambiguation?: string;
        };
    }[];
}

/**
 * MusicBrainz Recording（楽曲）情報  
 * 例: https://musicbrainz.org/ws/2/recording/<MBID>?fmt=json&inc=releases
 */
export interface MusicBrainzRecording {
    /** 録音MBID（ユニークID）  
     * 例: "54b9dd1d-cc5c-4288-9420-9150306b3bff" */
    id: string;
    /** 楽曲タイトル  
     * 例: "シンカケイスケッチ" */
    title: string;
    /** 再生時間（ミリ秒）  
     * 例: 230000 */
    length?: number;
    /** 初出リリース日  
     * 例: "2022-05-25" */
    "first-release-date"?: string;
    /** 動画かどうか  
     * 例: false */
    video?: boolean;
    /** 解釈・補足  
     * 例: "" */
    disambiguation?: string;
    /** 紐づくリリース情報一覧 */
    releases?: {
        /** リリースMBID  
         * 例: "15d518d5-da62-4067-9d4d-93fc1cda1e23" */
        id: string;
        /** タイトル  
         * 例: "まだ雨はやまない" */
        title: string;
        /** 国コード  
         * 例: "JP" */
        country?: string;
        /** 日付  
         * 例: "2022-05-25" */
        date?: string;
        /** バーコード  
         * 例: "4562250649683" */
        barcode?: string | null;
        /** リリース状態  
         * 例: "Official" */
        status?: string;
        /** 状態ID  
         * 例: "4e304316-386d-3409-af2e-78857eec5cfe" */
        "status-id"?: string;
        /** 品質  
         * 例: "normal" */
        quality?: string;
        /** パッケージ  
         * 例: "None" */
        packaging?: string | null;
        /** パッケージID  
         * 例: "119eba76-b343-3e02-a292-f0f00644bb9b" */
        "packaging-id"?: string | null;
        /** 書式情報 */
        "text-representation"?: {
            /** 言語コード  
             * 例: "jpn" */
            language: string | null;
            /** スクリプト  
             * 例: "Jpan" */
            script: string | null;
        };
        /** 発売イベント */
        "release-events"?: {
            /** 発売日  
             * 例: "2022-05-25" */
            date: string;
            /** 地域情報 */
            area: {
                /** 地域ID  
                 * 例: "2db42837-c832-3c27-b4a3-08198f75693c" */
                id: string;
                /** 地域名  
                 * 例: "Japan" */
                name: string;
                /** ソート名  
                 * 例: "Japan" */
                "sort-name": string;
                /** 国コード配列  
                 * 例: ["JP"] */
                "iso-3166-1-codes": string[];
                /** 備考  
                 * 例: "" */
                disambiguation: string;
                /** 種別（通常null） */
                type: string | null;
                /** 種別ID（通常null） */
                "type-id": string | null;
            };
        }[];
        /** 補足説明  
         * 例: "" */
        disambiguation?: string;
    }[];
}

/**
 * MusicBrainz Artist情報  
 * 例: https://musicbrainz.org/ws/2/artist/<MBID>?fmt=json
 */
export interface MusicBrainzArtist {
    /** アーティストMBID  
     * 例: "7c612c92-fa8e-4851-b33f-dce3c797c933" */
    id: string;
    /** 表示名  
     * 例: "しぐれうい" */
    name: string;
    /** ソート用名称  
     * 例: "Shigure, Ui" */
    "sort-name": string;
    /** アーティストタイプ  
     * 例: "Person" */
    type?: string;
    /** タイプID  
     * 例: "b6e035f4-3ce9-331c-97df-83397230b0df" */
    "type-id"?: string;
    /** 性別  
     * 例: "Female" */
    gender?: string;
    /** 性別ID  
     * 例: "93452b5a-a947-30c8-934f-6a4056b151c2" */
    "gender-id"?: string;
    /** 国コード  
     * 例: "JP" */
    country?: string;
    /** 補足説明  
     * 例: "VTuber and illustrator" */
    disambiguation?: string;
    /** ISNI識別子配列  
     * 例: ["0000000502392586"] */
    isnis?: string[];
    /** 生誕地情報 */
    "begin-area"?: {
        /** 地域ID  
         * 例: "9097982d-c3bf-466a-be1f-3fa57996048e" */
        id: string;
        /** 地域名  
         * 例: "Yokkaichi" */
        name: string;
        /** ソート名  
         * 例: "Yokkaichi" */
        "sort-name": string;
        /** 備考（例: ""） */
        disambiguation: string;
        /** 種別（通常null） */
        type: string | null;
        /** 種別ID（通常null） */
        "type-id": string | null;
    } | null;
    /** 活動地域情報 */
    area?: {
        /** 地域ID  
         * 例: "2db42837-c832-3c27-b4a3-08198f75693c" */
        id: string;
        /** 地域名  
         * 例: "Japan" */
        name: string;
        /** ソート名  
         * 例: "Japan" */
        "sort-name": string;
        /** 備考  
         * 例: "" */
        disambiguation: string;
        /** 国コード配列  
         * 例: ["JP"] */
        "iso-3166-1-codes": string[];
        /** 種別（通常null） */
        type: string | null;
        /** 種別ID（通常null） */
        "type-id": string | null;
    } | null;
    /** 生没期間 */
    "life-span"?: {
        /** 開始日  
         * 例: "????-05-30" */
        begin: string | null;
        /** 終了日（例: null） */
        end: string | null;
        /** 終了済みかどうか  
         * 例: false */
        ended: boolean;
    };
    /** IPIs（内部識別子）  
     * 例: [] */
    ipis?: string[];
    /** 終了地域情報（通常null） */
    "end-area"?: null | Record<string, unknown>;
}

/** キャッシュ1件分の形 */
interface CacheEntry<T> {
    /** 取得時刻（UNIX ms） 例: 1739052345123 */
    fetchedAt: number;
    /** 実データ本体（APIのJSONまるごと） */
    data: T;
}

/** musicBrainzCache.json の全体形 */
interface MusicBrainzCacheShape {
    artist:   Record<string, CacheEntry<MusicBrainzArtist>>;
    release:  Record<string, CacheEntry<MusicBrainzRelease>>;
    recording:Record<string, CacheEntry<MusicBrainzRecording>>;
}

class MusicBrainz {
    /**
     * 直前の処理完了時刻（ms）。次の処理開始まで 1 秒の猶予を担保するために使用。
     */
    private _lastDoneAt = 0;

    /**
     * 逐次実行用チェーン。常にこのチェーンに後続タスクをぶら下げて直列化する。
     */
    private _chain: Promise<void> = Promise.resolve();

    /** キャッシュファイルのパス */
    private readonly _cachePath = "musicBrainzCache.json";
    /** キャッシュTTL(ミリ秒)。現在は6ヶ月 */
    private readonly _cacheTTLms = 6 * 30 * 24 * 60 * 60 * 1000;

    /**
     * タスクを直列実行し、前回完了から 1 秒空けてから着手します。
     * @template T 戻り値の型
     * @param task 実行したい非同期処理（例: fetch を含む関数）
     * @returns タスクの戻り値
     */
    private _enqueue<T>(task: () => Promise<T>): Promise<T> {
        const run = async () => {
            const now = Date.now();
            const elapsed = now - this._lastDoneAt;
            const waitMs = Math.max(0, 1000 - elapsed);
            if (waitMs > 0) {
                await new Promise((r) => setTimeout(r, waitMs));
            }
            const result = await task();
            this._lastDoneAt = Date.now();
            return result;
        };

        // 直前のチェーンに必ず連結する（前タスクの成否に関わらず次を実行）
        const p = this._chain.then(run, run);
        // 次のタスク用にチェーンを更新（resolve/reject を吸収）
        this._chain = p.then(() => { }, () => { });
        return p;
    }

    get customMetadata(): {
        release: { [MBID: string]: MusicBrainzRelease | undefined; }
        artist: { [MBID: string]: MusicBrainzArtist | undefined; }
        recording: { [MBID: string]: MusicBrainzRecording | undefined; }
    } { return JSON.parse(String(readFileSync("albumInfo.json"))); }

    /**
     * キャッシュを読み込みます。ファイルが無い/壊れている場合は空で初期化します。
     */
    private _loadCache(): MusicBrainzCacheShape {
        try {
            if (!existsSync(this._cachePath)) {
                const empty: MusicBrainzCacheShape = { artist: {}, release: {}, recording: {} };
                writeFileSync(this._cachePath, JSON.stringify(empty, null, 2));
                return empty;
            }
            const raw = String(readFileSync(this._cachePath));
            const parsed = JSON.parse(raw);
            // 簡易バリデーション
            if (!parsed || typeof parsed !== 'object') throw new Error('cache malformed');
            if (!('artist' in parsed) || !('release' in parsed) || !('recording' in parsed)) throw new Error('cache keys missing');
            return parsed as MusicBrainzCacheShape;
        } catch {
            const empty: MusicBrainzCacheShape = { artist: {}, release: {}, recording: {} };
            writeFileSync(this._cachePath, JSON.stringify(empty, null, 2));
            return empty;
        }
    }

    /** キャッシュを書き込みます。 */
    private _saveCache(cache: MusicBrainzCacheShape): void {
        writeFileSync(this._cachePath, JSON.stringify(cache, null, 2));
    }

    /** キャッシュが新鮮かどうかを判定 */
    private _isFresh(ts: number): boolean {
        return (Date.now() - ts) < this._cacheTTLms;
    }

    /**
     * フェッチを行わず、キャッシュを覗き見る（ヒット時はそのまま返す）。
     * ファイルI/Oのみなので、直列キューを経由せず即時判定してOK。
     */
    private _peekCache<K extends keyof MusicBrainzCacheShape, T>(kind: K, MBID: string): { hit: boolean; data?: T; cache: MusicBrainzCacheShape } {
        const cache = this._loadCache();
        const bag = cache[kind] as unknown as Record<string, CacheEntry<T> | undefined>;
        const entry = bag[MBID];
        if (entry && this._isFresh(entry.fetchedAt)) {
            return { hit: true, data: entry.data, cache };
        }
        return { hit: false, cache };
    }

    /**
     * キャッシュを考慮してJSONを取得します。新鮮ならキャッシュ、古ければfetch→更新。
     * @param kind "artist" | "release" | "recording"
     * @param MBID 対象MBID
     * @param url  API URL
     */
    private async _getWithCache<K extends keyof MusicBrainzCacheShape, T>(kind: K, MBID: string, url: string): Promise<T> {
        const cache = this._loadCache();
        const bag = cache[kind] as unknown as Record<string, CacheEntry<T> | undefined>;
        const now = Date.now();
        const hit = bag[MBID];
        if (hit && this._isFresh(hit.fetchedAt)) {
            return hit.data;
        }
        const fresh = await this._fetchJSON<T>(url);
        bag[MBID] = { fetchedAt: now, data: fresh };
        this._saveCache(cache);
        return fresh;
    }

    /**
     * JSONを取得する共通fetch。User-AgentとAcceptを明示し、エラーも整形。
     */
    private async _fetchJSON<T>(url: string): Promise<T> {
        const res = await fetch(url, {
            headers: {
                // MusicBrainzの礼儀としてUser-Agentを必ず送る
                'User-Agent': 'KazunamiDiscordBot/1.0 (+https://example.com/contact)',
                'Accept': 'application/json'
            }
        });
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(`HTTP ${res.status} for ${url}\n${text}`);
        }
        return res.json() as Promise<T>;
    }

    /**
     * プレーンオブジェクト判定（配列やnullを除外）
     */
    private _isPlainObject(value: unknown): value is Record<string, unknown> {
        return (
            typeof value === 'object' &&
            value !== null &&
            Object.prototype.toString.call(value) === '[object Object]'
        );
    }

    /**
     * 深いマージ：overrideに存在するプロパティだけをbaseへ上書き。
     * - オブジェクトは再帰的にマージ
     * - 配列は置き換え
     * - プリミティブは上書き
     */
    private _deepMerge<T>(base: T, override: Partial<T>): T {
        if (!override) return base;
        // baseが配列なら、overrideが配列のときのみ置換
        if (Array.isArray(base)) {
            return (Array.isArray(override) ? override : base) as unknown as T;
        }
        // 両方プレーンオブジェクトのときは再帰マージ
        if (this._isPlainObject(base) && this._isPlainObject(override)) {
            const out: Record<string, unknown> = { ...base as Record<string, unknown> };
            for (const [k, v] of Object.entries(override)) {
                const cur = (out as Record<string, unknown>)[k];
                if (Array.isArray(v)) {
                    out[k] = v; // 配列は置換
                } else if (this._isPlainObject(v) && this._isPlainObject(cur)) {
                    out[k] = this._deepMerge(cur, v as Record<string, unknown>);
                } else if (v !== undefined) {
                    out[k] = v; // プリミティブ or 片方が非オブジェクトなら上書き
                }
            }
            return out as T;
        }
        // それ以外はoverrideが定義されていれば丸ごと置換
        return ((override as unknown) !== undefined ? (override as T) : base);
    }

    async artistInfoGet(MBID: string): Promise<MusicBrainzArtist> {
        const peek = this._peekCache('artist', MBID) as { hit: boolean; data?: MusicBrainzArtist };
        if (peek.hit && peek.data) {
            const override = this.customMetadata.artist[MBID];
            return override ? this._deepMerge<MusicBrainzArtist>(peek.data, override) : peek.data;
        }
        return this._enqueue(async () => {
            const url = `https://musicbrainz.org/ws/2/artist/${MBID}?fmt=json`;
            const fetched = await this._getWithCache('artist', MBID, url) as MusicBrainzArtist;
            const override = this.customMetadata.artist[MBID];
            return override ? this._deepMerge<MusicBrainzArtist>(fetched, override) : fetched;
        });
    }

    async releaseInfoGet(MBID: string): Promise<MusicBrainzRelease> {
        const peek = this._peekCache('release', MBID) as { hit: boolean; data?: MusicBrainzRelease };
        if (peek.hit && peek.data) {
            const override = this.customMetadata.release[MBID];
            return override ? this._deepMerge<MusicBrainzRelease>(peek.data, override) : peek.data;
        }
        return this._enqueue(async () => {
            const url = `https://musicbrainz.org/ws/2/release/${MBID}?fmt=json&inc=artist-credits`;
            const fetched = await this._getWithCache('release', MBID, url) as MusicBrainzRelease;
            const override = this.customMetadata.release[MBID];
            return override ? this._deepMerge<MusicBrainzRelease>(fetched, override) : fetched;
        });
    }

    async recordingInfoGet(MBID: string): Promise<MusicBrainzRecording> {
        const peek = this._peekCache('recording', MBID) as { hit: boolean; data?: MusicBrainzRecording };
        if (peek.hit && peek.data) {
            const override = this.customMetadata.recording[MBID];
            return override ? this._deepMerge<MusicBrainzRecording>(peek.data, override) : peek.data;
        }
        return this._enqueue(async () => {
            const url = `https://musicbrainz.org/ws/2/recording/${MBID}?fmt=json&inc=releases`;
            const fetched = await this._getWithCache('recording', MBID, url) as MusicBrainzRecording;
            const override = this.customMetadata.recording[MBID];
            return override ? this._deepMerge<MusicBrainzRecording>(fetched, override) : fetched;
        });
    }
}

export const musicBrainz = new MusicBrainz();
