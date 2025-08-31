export interface NicoSnapshotItem {
    // 基本
    contentId: string;
    title: string;
    description?: string;
    // カウンタ類
    viewCounter?: number;
    mylistCounter?: number;
    likeCounter?: number;
    commentCounter?: number;
    // 動画情報
    lengthSeconds?: number;
    startTime?: string;
    lastResBody?: string;
    // サムネ・ジャンル・タグ
    thumbnailUrl?: string;
    genre?: string;
    tags?: string;
    // ユーザー / チャンネル情報
    userId?: string;
    userNickname?: string;
    channelId?: string;
    channelName?: string;
    // その他（APIが追加で返す可能性のある項目をキャッチ）
    [key: string]: string | number | undefined;
}

export async function searchNicoVideo(
    query: string
): Promise<NicoSnapshotItem[] | undefined> {
    // 入力が contentId（動画ID sm/so/nm）なら contentId 検索、そうでなければキーワード検索
    const isContentId = /^(sm|so|nm)[1-9]\d*$/.test(query);

    // --- contentId が直接来た場合は oEmbed を優先して取得（403/CORS回避 & 単発高速） ---
    if (isContentId) {
        try {
            const oembedUrl = `https://www.nicovideo.jp/oembed?url=${encodeURIComponent(`https://www.nicovideo.jp/watch/${query}`)}&format=json`;
            const oRes = await fetch(oembedUrl, {
                headers: {
                    "User-Agent":
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) NodeFetch/1.0 Chrome/123.0.0.0 Safari/537.36",
                    "Accept": "application/json, text/plain, */*",
                    "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
                    "Referer": "https://www.nicovideo.jp/",
                    "Accept-Encoding": "gzip, deflate, br"
                }
            });
            if (oRes.ok) {
                const ojson = await oRes.json() as any;
                // oEmbed から得られる情報を NicoSnapshotItem にマッピング
                const item: NicoSnapshotItem = {
                    contentId: query,
                    title: typeof ojson.title === "string" ? ojson.title : "",
                    description: typeof ojson.description === "string" ? ojson.description : undefined,
                    thumbnailUrl: typeof ojson.thumbnail_url === "string" ? ojson.thumbnail_url : undefined,
                    // 取得できないカウンター類は未定義のまま
                    // 取得できる場合に備えて予備の拾い上げ
                    userNickname: typeof ojson.author_name === "string" ? ojson.author_name : undefined,
                    channelName: typeof ojson.provider_name === "string" ? ojson.provider_name : undefined,
                    // その他未知フィールドは捨てる（型安全のため）
                };
                return [item];
            } else {
                console.error("oEmbed HTTP error:", oRes.status, oRes.statusText);
            }
            // oEmbed が失敗した場合のみ、従来のスナップショット API へフォールバック
        } catch (e) {
            console.error("oEmbed fetch error:", e);
        }

        // 追加のフォールバック: getthumbinfo XML API
        try {
            const xmlUrl = `https://ext.nicovideo.jp/api/getthumbinfo/${query}`;
            const xmlRes = await fetch(xmlUrl, {
                headers: {
                    "User-Agent":
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) NodeFetch/1.0 Chrome/123.0.0.0 Safari/537.36",
                    "Accept": "application/xml, text/xml, */*",
                    "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
                    "Referer": "https://www.nicovideo.jp/",
                    "Accept-Encoding": "gzip, deflate, br"
                }
            });
            if (!xmlRes.ok) {
                console.error("getthumbinfo HTTP error:", xmlRes.status, xmlRes.statusText);
                // 失敗したらスナップショットAPIへフォールバック（下で処理）
            } else {
                const xml = await xmlRes.text();
                const getTag = (tag: string): string | undefined => {
                    const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
                    return m ? m[1] : undefined;
                };
                const decode = (s?: string) =>
                    s?.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
                const lengthStr = getTag("length");
                let lengthSeconds: number | undefined = undefined;
                if (lengthStr) {
                    const parts = lengthStr.split(":").map(x => Number(x));
                    if (parts.length === 2) {
                        lengthSeconds = parts[0] * 60 + parts[1];
                    } else if (parts.length === 3) {
                        lengthSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
                    }
                }
                const item: NicoSnapshotItem = {
                    contentId: query,
                    title: decode(getTag("title")) ?? "",
                    description: decode(getTag("description")),
                    thumbnailUrl: getTag("thumbnail_url"),
                    viewCounter: Number(getTag("view_counter")) || undefined,
                    commentCounter: Number(getTag("comment_num")) || undefined,
                    mylistCounter: Number(getTag("mylist_counter")) || undefined,
                    lengthSeconds,
                    startTime: getTag("first_retrieve"),
                    userId: getTag("user_id"),
                    userNickname: decode(getTag("user_nickname")),
                    channelId: getTag("ch_id") || getTag("channel_id"),
                    channelName: decode(getTag("ch_name") || getTag("channel_name")),
                    lastResBody: decode(getTag("last_res_body")),
                };
                return [item];
            }
        } catch (e) {
            console.error("getthumbinfo fetch error:", e);
        }
    }

    // まず試すエンドポイントとフォールバック（403 対策）
    const endpoints = [
        "https://api.search.nicovideo.jp/api/v2/snapshot/video/contents/search",
        "https://snapshot.search.nicovideo.jp/api/v2/snapshot/video/contents/search",
    ] as const;

    // 共通ヘッダー（403 対策：現実的な UA / 受理タイプ / リファラを付与）
    const headers = {
        "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) NodeFetch/1.0 Chrome/123.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
        "Referer": "https://www.nicovideo.jp/",
        "Accept-Encoding": "gzip, deflate, br",
    };

    // fields は明示しておくと安定
    const fields =
        "contentId,title,description,viewCounter,mylistCounter,likeCounter,commentCounter,lengthSeconds,startTime,lastResBody,thumbnailUrl,userId,userNickname,channelId,channelName,genre,tags";

    // クエリを構築
    const buildURL = (base: string) => {
        const sp = new URL(base);
        const params = sp.searchParams;
        // タイトル・説明・タグを対象に人気順
        params.set("q", query);
        params.set("targets", "title,description,tags");
        params.set("fields", fields);
        params.set("_sort", "-viewCounter");
        params.set("_offset", "0");
        params.set("_limit", String(1));
        // 任意の識別子
        params.set("_context", "myApp");
        return sp.toString();
    };

    // 403 等で失敗したらフォールバックを試す
    for (const ep of endpoints) {
        try {
            const url = buildURL(ep);
            console.error("Snapshot request URL:", url);
            const res = await fetch(url, { headers });
            if (!res.ok) {
                console.error("Snapshot API error:", res.status, res.statusText);
                // 403/5xx の場合は次のエンドポイントへフォールバック
                if (res.status >= 500 || res.status === 403) continue;
                return undefined;
            }
            const json = await res.json();
            if (!json?.data || !Array.isArray(json.data)) return undefined;
            return json.data as NicoSnapshotItem[];
        } catch (e) {
            console.error("Snapshot API fetch exception:", e);
            // ネットワーク例外時も次を試す
            continue;
        }
    }

    return undefined;
}

export function parseNicoVideo(input: string): string | undefined {
    const VIDEO_ID_RE = /^(sm|nm|so)[1-9]\d*$/;

    if (VIDEO_ID_RE.test(input)) {
        return input;
    }

    let u: URL;
    try { u = new URL(input); } catch { return undefined; }

    const host = u.hostname.toLowerCase();
    const isNicoHost = /(^|\.)nicovideo\.jp$/.test(host) || host === "nico.ms";
    if (!isNicoHost) return undefined;

    if (host === "nico.ms") {
        const id = u.pathname.slice(1);
        if (VIDEO_ID_RE.test(id)) {
            return id;
        }
        return undefined;
    }

    const m = u.pathname.match(/^\/watch\/((?:sm|nm|so)[1-9]\d*)$/);
    if (m) {
        const id = m[1];
        return id;
    }

    return undefined;
}
