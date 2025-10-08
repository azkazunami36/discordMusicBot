
// Created by ChatGPT.

// --- helper: try to upgrade Nico thumbnail quality ---
async function resolveBetterNicoThumb(url?: string): Promise<string | undefined> {
    if (!url || typeof url !== 'string') return url;
    try {
        // Already looks like high-res? (has .L or .M at the end or explicit extension)
        if (/\.(?:L|M)(?:$|\?)/.test(url)) return url;

        // nicovideo CDN: https://nicovideo.cdn.nimg.jp/thumbnails/<id>/<id>.<rand>
        // Rule: append .L first (960x540 or 1280x720 when available), fallback .M (320x180)
        if (/^https?:\/\/nicovideo\.cdn\.nimg\.jp\/thumbnails\//.test(url)) {
            const tryL = url + '.L';
            try {
                const head = await fetch(tryL, { method: 'HEAD' });
                if (head.ok) return tryL;
            } catch {}
            const tryM = url + '.M';
            try {
                const head2 = await fetch(tryM, { method: 'HEAD' });
                if (head2.ok) return tryM;
            } catch {}
            return url; // fallback original
        }

        // legacy smile: http(s)://tn-*.smilevideo.jp/smile?i=<num>
        if (/^https?:\/\/tn-[^/]+\.smilevideo\.jp\/smile\?i=\d+/.test(url)) {
            const tryL = url + '.L';
            try {
                const head = await fetch(tryL, { method: 'HEAD' });
                if (head.ok) return tryL;
            } catch {}
            return url;
        }

        // Other hosts: return as-is
        return url;
    } catch {
        return url;
    }
}

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
                    thumbnailUrl: await resolveBetterNicoThumb(typeof ojson.thumbnail_url === "string" ? ojson.thumbnail_url : undefined),
                    // 取得できないカウンター類は未定義のまま
                    // 取得できる場合に備えて予備の拾い上げ
                    userNickname: typeof ojson.author_name === "string" ? ojson.author_name : undefined,
                    channelName: typeof ojson.provider_name === "string" ? ojson.provider_name : undefined,
                    // その他未知フィールドは捨てる（型安全のため）
                };
                return [item];
            } else {
            }
            // oEmbed が失敗した場合のみ、従来のスナップショット API へフォールバック
        } catch (e) {
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
                    thumbnailUrl: await resolveBetterNicoThumb(getTag("thumbnail_url")),
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
        }
    }

    // --- キーワード検索はまず RSS を優先（Snapshot は 403/400 が多く不安定のため） ---
    try {
        const rssUrl = `https://www.nicovideo.jp/search/${encodeURIComponent(query)}?rss=2.0`;
        const rssRes = await fetch(rssUrl, {
            headers: {
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) NodeFetch/1.0 Chrome/123.0.0.0 Safari/537.36",
                "Accept": "application/rss+xml, application/xml, text/xml, */*",
                "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
                "Referer": "https://www.nicovideo.jp/",
                "Accept-Encoding": "gzip, deflate, br",
            },
        });
        if (rssRes.ok) {
            const xml = await rssRes.text();
            const items: NicoSnapshotItem[] = [];
            const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/g);
            let count = 0;
            for (const m of itemMatches) {
                const block = m[1];
                const get = (tag: string) => {
                    const mm = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\/${tag}>`));
                    return mm ? mm[1] : undefined;
                };
                const decode = (s?: string) =>
                    s?.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
                const title = decode(get("title")) ?? "";
                const link = get("link") || "";
                const desc = decode(get("description"));
                const thumb = await resolveBetterNicoThumb(block.match(/<nicovideo:thumbnail_url>(.*?)<\/nicovideo:thumbnail_url>/)?.[1]);
                const lenStr = (block.match(/<nicovideo:length>(.*?)<\/nicovideo:length>/)?.[1]);
                const viewsStr = (block.match(/<nicovideo:viewCounter>(.*?)<\/nicovideo:viewCounter>/)?.[1]);
                const comStr = (block.match(/<nicovideo:commentCounter>(.*?)<\/nicovideo:commentCounter>/)?.[1]);
                const myStr = (block.match(/<nicovideo:mylistCounter>(.*?)<\/nicovideo:mylistCounter>/)?.[1]);
                const start = (block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1]);
                const idMatch = link.match(/watch\/((?:sm|nm|so)[1-9]\d*)/);
                if (!idMatch) continue;
                const contentId = idMatch[1];
                let lengthSeconds: number | undefined;
                if (lenStr) {
                    const p = lenStr.split(":").map(Number);
                    if (p.length === 2) lengthSeconds = p[0] * 60 + p[1];
                    else if (p.length === 3) lengthSeconds = p[0] * 3600 + p[1] * 60 + p[2];
                }
                const item: NicoSnapshotItem = {
                    contentId,
                    title,
                    description: desc,
                    thumbnailUrl: thumb,
                    viewCounter: viewsStr ? Number(viewsStr) : undefined,
                    commentCounter: comStr ? Number(comStr) : undefined,
                    mylistCounter: myStr ? Number(myStr) : undefined,
                    lengthSeconds,
                    startTime: start,
                };
                items.push(item);
                if (++count >= 5) break;
            }
            if (items.length > 0) {
                return items;
            } else {
            }
        } else {
        }
    } catch (e) {
    }

    // --- TAG RSS: 「タグ検索」でRSSを試す（通常検索RSSが0件の環境向け） ---
    try {
        const tagRssUrl = `https://www.nicovideo.jp/tag/${encodeURIComponent(query)}?rss=2.0&sort=h&order=d`;
        const tagRes = await fetch(tagRssUrl, {
            headers: {
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) NodeFetch/1.0 Chrome/123.0.0.0 Safari/537.36",
                "Accept": "application/rss+xml, application/xml, text/xml, */*",
                "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
                "Referer": "https://www.nicovideo.jp/",
                "Accept-Encoding": "gzip, deflate, br",
            },
        });
        if (tagRes.ok) {
            const xml = await tagRes.text();
            const items: NicoSnapshotItem[] = [];
            const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/g);
            let count = 0;
            for (const m of itemMatches) {
                const block = m[1];
                const get = (tag: string) => {
                    const mm = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\/${tag}>`));
                    return mm ? mm[1] : undefined;
                };
                const decode = (s?: string) =>
                    s?.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
                const title = decode(get("title")) ?? "";
                const link = get("link") || "";
                const desc = decode(get("description"));
                const thumb = await resolveBetterNicoThumb(block.match(/<nicovideo:thumbnail_url>(.*?)<\/nicovideo:thumbnail_url>/)?.[1]);
                const lenStr = (block.match(/<nicovideo:length>(.*?)<\/nicovideo:length>/)?.[1]);
                const viewsStr = (block.match(/<nicovideo:viewCounter>(.*?)<\/nicovideo:viewCounter>/)?.[1]);
                const comStr = (block.match(/<nicovideo:commentCounter>(.*?)<\/nicovideo:commentCounter>/)?.[1]);
                const myStr = (block.match(/<nicovideo:mylistCounter>(.*?)<\/nicovideo:mylistCounter>/)?.[1]);
                const start = (block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1]);
                const idMatch = link.match(/watch\/((?:sm|nm|so)[1-9]\d*)/);
                if (!idMatch) continue;
                const contentId = idMatch[1];
                let lengthSeconds: number | undefined;
                if (lenStr) {
                    const p = lenStr.split(":").map(Number);
                    if (p.length === 2) lengthSeconds = p[0] * 60 + p[1];
                    else if (p.length === 3) lengthSeconds = p[0] * 3600 + p[1] * 60 + p[2];
                }
                const item: NicoSnapshotItem = {
                    contentId,
                    title,
                    description: desc,
                    thumbnailUrl: thumb,
                    viewCounter: viewsStr ? Number(viewsStr) : undefined,
                    commentCounter: comStr ? Number(comStr) : undefined,
                    mylistCounter: myStr ? Number(myStr) : undefined,
                    lengthSeconds,
                    startTime: start,
                };
                items.push(item);
                if (++count >= 5) break;
            }
            if (items.length > 0) {
                return items;
            } else {
            }
        } else {
        }
    } catch (e) {
    }

    /*
    // まず試すエンドポイントとフォールバック（403 対策）
    const endpoints = [
        "https://api.search.nicovideo.jp/api/v2/snapshot/video/contents/search",
        "https://snapshot.search.nicovideo.jp/api/v2/snapshot/video/contents/search",
    ] as const;

    // 共通ヘッダー（403 対策：現実的な UA / 受理タイプ / リファラを付与）
    const headers = {
        "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) NodeFetch/1.0 Chrome/123.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, *\/*
",
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
    */

    // --- Fallback: RSS検索（HTMLブロックの回避策）---
    try {
        const rssUrl = `https://www.nicovideo.jp/search/${encodeURIComponent(query)}?rss=2.0`;
        const rssRes = await fetch(rssUrl, {
            headers: {
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) NodeFetch/1.0 Chrome/123.0.0.0 Safari/537.36",
                "Accept": "application/rss+xml, application/xml, text/xml, */*",
                "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
                "Referer": "https://www.nicovideo.jp/",
                "Accept-Encoding": "gzip, deflate, br",
            },
        });
        if (!rssRes.ok) {
        } else {
            const xml = await rssRes.text();
            // RSS項目抽出
            const items: NicoSnapshotItem[] = [];
            // 単純な item 抽出（先頭数件）
            const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/g);
            let count = 0;
            for (const m of itemMatches) {
                const block = m[1];
                const get = (tag: string) => {
                    const mm = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
                    return mm ? mm[1] : undefined;
                };
                const decode = (s?: string) =>
                    s?.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
                const title = decode(get("title")) ?? "";
                const link = get("link") || "";
                const desc = decode(get("description"));
                const thumb = (block.match(/<nicovideo:thumbnail_url>(.*?)<\/nicovideo:thumbnail_url>/)?.[1]);
                const lenStr = (block.match(/<nicovideo:length>(.*?)<\/nicovideo:length>/)?.[1]);
                const viewsStr = (block.match(/<nicovideo:viewCounter>(.*?)<\/nicovideo:viewCounter>/)?.[1]);
                const comStr = (block.match(/<nicovideo:commentCounter>(.*?)<\/nicovideo:commentCounter>/)?.[1]);
                const myStr = (block.match(/<nicovideo:mylistCounter>(.*?)<\/nicovideo:mylistCounter>/)?.[1]);
                const start = (block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1]);
                const idMatch = link.match(/watch\/((?:sm|nm|so)[1-9]\d*)/);
                if (!idMatch) continue;
                const contentId = idMatch[1];
                let lengthSeconds: number | undefined;
                if (lenStr) {
                    const p = lenStr.split(":").map(Number);
                    if (p.length === 2) lengthSeconds = p[0] * 60 + p[1];
                    else if (p.length === 3) lengthSeconds = p[0] * 3600 + p[1] * 60 + p[2];
                }
                const item: NicoSnapshotItem = {
                    contentId,
                    title,
                    description: desc,
                    thumbnailUrl: thumb,
                    viewCounter: viewsStr ? Number(viewsStr) : undefined,
                    commentCounter: comStr ? Number(comStr) : undefined,
                    mylistCounter: myStr ? Number(myStr) : undefined,
                    lengthSeconds,
                    startTime: start,
                };
                items.push(item);
                if (++count >= 5) break; // 最大5件
            }
            if (items.length > 0) {
                return items;
            } else {
            }
        }
    } catch (e) {
    }

    // --- Fallback(2): HTML検索ページを直接パースして watch ID を抽出 ---
    try {
        const htmlUrl = `https://www.nicovideo.jp/search/${encodeURIComponent(query)}?page=1`;
        const htmlRes = await fetch(htmlUrl, {
            headers: {
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) NodeFetch/1.0 Chrome/123.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
                "Referer": "https://www.nicovideo.jp/",
                "Accept-Encoding": "gzip, deflate, br",
            },
        });
        if (htmlRes.ok) {
            const html = await htmlRes.text();
            // 1) aタグの href から抽出
            const idSet = new Set<string>();
            const reHref = /href=["']\/?watch\/(?:\?reload=\d+&)?((?:sm|nm|so)[1-9]\d*)["']/g;
            let m1: RegExpExecArray | null;
            while ((m1 = reHref.exec(html)) && idSet.size < 12) idSet.add(m1[1]);

            // 2) JSON埋め込み（contentId/watchId）から抽出
            const reJson1 = /"contentId":"((?:sm|nm|so)[1-9]\d*)"/g;
            let m2: RegExpExecArray | null;
            while ((m2 = reJson1.exec(html)) && idSet.size < 12) idSet.add(m2[1]);

            const reJson2 = /"watchId":"((?:sm|nm|so)[1-9]\d*)"/g;
            let m3: RegExpExecArray | null;
            while ((m3 = reJson2.exec(html)) && idSet.size < 12) idSet.add(m3[1]);

            // 3) data-attribute（例: data-content-id）から抽出
            const reData = /data-(?:content-id|gtm-content-id)=["']((?:sm|nm|so)[1-9]\d*)["']/g;
            let m4: RegExpExecArray | null;
            while ((m4 = reData.exec(html)) && idSet.size < 12) idSet.add(m4[1]);


            // 見つかった ID からメタ取得（oEmbed→getthumbinfo の順）
            const results: NicoSnapshotItem[] = [];
            for (const id of idSet) {
                // 1) oEmbed
                try {
                    const oembedUrl = `https://www.nicovideo.jp/oembed?url=${encodeURIComponent(`https://www.nicovideo.jp/watch/${id}`)}&format=json`;
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
                        results.push({
                            contentId: id,
                            title: typeof ojson.title === "string" ? ojson.title : "",
                            description: typeof ojson.description === "string" ? ojson.description : undefined,
                            thumbnailUrl: await resolveBetterNicoThumb(typeof ojson.thumbnail_url === "string" ? ojson.thumbnail_url : undefined),
                            userNickname: typeof ojson.author_name === "string" ? ojson.author_name : undefined,
                            channelName: typeof ojson.provider_name === "string" ? ojson.provider_name : undefined,
                        });
                        continue;
                    } else {
                    }
                } catch (e) {
                }

                // 2) getthumbinfo
                try {
                    const xmlUrl = `https://ext.nicovideo.jp/api/getthumbinfo/${id}`;
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
                    if (xmlRes.ok) {
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
                        results.push({
                            contentId: id,
                            title: decode(getTag("title")) ?? "",
                            description: decode(getTag("description")),
                            thumbnailUrl: await resolveBetterNicoThumb(getTag("thumbnail_url")),
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
                        });
                    } else {
                    }
                } catch (e) {
                }
            }

            if (results.length > 0) {
                return results;
            } else {
            }
        } else {
        }
    } catch (e) {
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
