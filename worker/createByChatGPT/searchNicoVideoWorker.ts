import { parentPort, workerData } from "worker_threads";

/**
 * 入力:  string (query)
 * 出力:  { ok: true, data: NicoSnapshotItem[] } | { ok: false, error: string }
 *
 * 仕様:
 * - ニコニコ動画の検索/取得を複数経路でフォールバック（oEmbed → getthumbinfo → RSS → TAG RSS → HTML パース）
 * - サムネイルは可能なら高解像度に昇格（.L / .M）
 * - キャッシュなし・例外は投げず（ワーカー内）
 */

type Payload = string; // raw query string

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

// --- helper: try to upgrade Nico thumbnail quality ---
async function resolveBetterNicoThumb(url?: string): Promise<string | undefined> {
  if (!url || typeof url !== 'string') return url;
  try {
    // Already looks high-res? (has .L or .M at the end or explicit extension)
    if (/(?:\.L|\.M)(?:$|\?)/.test(url)) return url;

    // nicovideo CDN: https://nicovideo.cdn.nimg.jp/thumbnails/<id>/<id>.<rand>
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

const COMMON_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) NodeFetch/1.0 Chrome/123.0.0.0 Safari/537.36",
  "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
  "Referer": "https://www.nicovideo.jp/",
  "Accept-Encoding": "gzip, deflate, br",
} as const;

/** contentId 判定 */
function isContentId(q: string): boolean {
  return /^(sm|so|nm)[1-9]\d*$/.test(q);
}

/** XML helper */
function xmlGet(xml: string, tag: string): string | undefined {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\/${tag}>`));
  return m ? m[1] : undefined;
}
function decodeXml(s?: string) {
  return s?.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

/**
 * 検索メイン：複数フォールバック
 */
async function searchNicoVideo(query: string): Promise<NicoSnapshotItem[] | undefined> {
  const q = (query ?? "").trim();
  if (!q) return undefined;

  // --- 1) contentId なら oEmbed → getthumbinfo ---
  if (isContentId(q)) {
    // 1-a) oEmbed
    try {
      const oembedUrl = `https://www.nicovideo.jp/oembed?url=${encodeURIComponent(`https://www.nicovideo.jp/watch/${q}`)}&format=json`;
      const oRes = await fetch(oembedUrl, {
        headers: {
          ...COMMON_HEADERS,
          "Accept": "application/json, text/plain, */*",
        } as any,
      });
      if (oRes.ok) {
        const ojson = (await oRes.json().catch(() => undefined)) as any;
        if (ojson && typeof ojson === "object") {
          const item: NicoSnapshotItem = {
            contentId: q,
            title: typeof ojson.title === "string" ? ojson.title : "",
            description: typeof ojson.description === "string" ? ojson.description : undefined,
            thumbnailUrl: await resolveBetterNicoThumb(
              typeof ojson.thumbnail_url === "string" ? ojson.thumbnail_url : undefined
            ),
            userNickname: typeof ojson.author_name === "string" ? ojson.author_name : undefined,
            channelName: typeof ojson.provider_name === "string" ? ojson.provider_name : undefined,
          };
          return [item];
        }
      }
    } catch {}

    // 1-b) getthumbinfo (XML)
    try {
      const xmlUrl = `https://ext.nicovideo.jp/api/getthumbinfo/${q}`;
      const xmlRes = await fetch(xmlUrl, {
        headers: {
          ...COMMON_HEADERS,
          "Accept": "application/xml, text/xml, */*",
        } as any,
      });
      if (xmlRes.ok) {
        const xml = await xmlRes.text();
        const lengthStr = xmlGet(xml, "length");
        let lengthSeconds: number | undefined;
        if (lengthStr) {
          const p = lengthStr.split(":").map(Number);
          if (p.length === 2) lengthSeconds = p[0] * 60 + p[1];
          else if (p.length === 3) lengthSeconds = p[0] * 3600 + p[1] * 60 + p[2];
        }
        const item: NicoSnapshotItem = {
          contentId: q,
          title: decodeXml(xmlGet(xml, "title")) ?? "",
          description: decodeXml(xmlGet(xml, "description")),
          thumbnailUrl: await resolveBetterNicoThumb(xmlGet(xml, "thumbnail_url")),
          viewCounter: Number(xmlGet(xml, "view_counter")) || undefined,
          commentCounter: Number(xmlGet(xml, "comment_num")) || undefined,
          mylistCounter: Number(xmlGet(xml, "mylist_counter")) || undefined,
          lengthSeconds,
          startTime: xmlGet(xml, "first_retrieve"),
          userId: xmlGet(xml, "user_id"),
          userNickname: decodeXml(xmlGet(xml, "user_nickname")),
          channelId: xmlGet(xml, "ch_id") || xmlGet(xml, "channel_id"),
          channelName: decodeXml(xmlGet(xml, "ch_name") || xmlGet(xml, "channel_name")),
          lastResBody: decodeXml(xmlGet(xml, "last_res_body")),
        };
        return [item];
      }
    } catch {}
  }

  // --- 2) キーワード検索: RSS 優先（安定）---
  try {
    const rssUrl = `https://www.nicovideo.jp/search/${encodeURIComponent(q)}?rss=2.0`;
    const rssRes = await fetch(rssUrl, {
      headers: {
        ...COMMON_HEADERS,
        "Accept": "application/rss+xml, application/xml, text/xml, */*",
      } as any,
    });
    if (rssRes.ok) {
      const xml = await rssRes.text();
      const items: NicoSnapshotItem[] = [];
      const it = xml.matchAll(/<item>([\s\S]*?)<\/item>/g);
      let count = 0;
      for (const m of it) {
        const block = m[1];
        const get = (tag: string) => block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\/${tag}>`))?.[1];
        const title = decodeXml(get("title")) ?? "";
        const link = get("link") || "";
        const desc = decodeXml(get("description"));
        const thumb = await resolveBetterNicoThumb(block.match(/<nicovideo:thumbnail_url>(.*?)<\/nicovideo:thumbnail_url>/)?.[1]);
        const lenStr = block.match(/<nicovideo:length>(.*?)<\/nicovideo:length>/)?.[1];
        const viewsStr = block.match(/<nicovideo:viewCounter>(.*?)<\/nicovideo:viewCounter>/)?.[1];
        const comStr = block.match(/<nicovideo:commentCounter>(.*?)<\/nicovideo:commentCounter>/)?.[1];
        const myStr = block.match(/<nicovideo:mylistCounter>(.*?)<\/nicovideo:mylistCounter>/)?.[1];
        const start = block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1];
        const idMatch = link.match(/watch\/((?:sm|nm|so)[1-9]\d*)/);
        if (!idMatch) continue;
        const contentId = idMatch[1];
        let lengthSeconds: number | undefined;
        if (lenStr) {
          const p = lenStr.split(":").map(Number);
          if (p.length === 2) lengthSeconds = p[0] * 60 + p[1];
          else if (p.length === 3) lengthSeconds = p[0] * 3600 + p[1] * 60 + p[2];
        }
        items.push({
          contentId,
          title,
          description: desc,
          thumbnailUrl: thumb,
          viewCounter: viewsStr ? Number(viewsStr) : undefined,
          commentCounter: comStr ? Number(comStr) : undefined,
          mylistCounter: myStr ? Number(myStr) : undefined,
          lengthSeconds,
          startTime: start,
        });
        if (++count >= 5) break;
      }
      if (items.length > 0) return items;
    }
  } catch {}

  // --- 3) TAG RSS ---
  try {
    const tagRssUrl = `https://www.nicovideo.jp/tag/${encodeURIComponent(q)}?rss=2.0&sort=h&order=d`;
    const tagRes = await fetch(tagRssUrl, {
      headers: {
        ...COMMON_HEADERS,
        "Accept": "application/rss+xml, application/xml, text/xml, */*",
      } as any,
    });
    if (tagRes.ok) {
      const xml = await tagRes.text();
      const items: NicoSnapshotItem[] = [];
      const it = xml.matchAll(/<item>([\s\S]*?)<\/item>/g);
      let count = 0;
      for (const m of it) {
        const block = m[1];
        const get = (tag: string) => block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\/${tag}>`))?.[1];
        const title = decodeXml(get("title")) ?? "";
        const link = get("link") || "";
        const desc = decodeXml(get("description"));
        const thumb = await resolveBetterNicoThumb(block.match(/<nicovideo:thumbnail_url>(.*?)<\/nicovideo:thumbnail_url>/)?.[1]);
        const lenStr = block.match(/<nicovideo:length>(.*?)<\/nicovideo:length>/)?.[1];
        const viewsStr = block.match(/<nicovideo:viewCounter>(.*?)<\/nicovideo:viewCounter>/)?.[1];
        const comStr = block.match(/<nicovideo:commentCounter>(.*?)<\/nicovideo:commentCounter>/)?.[1];
        const myStr = block.match(/<nicovideo:mylistCounter>(.*?)<\/nicovideo:mylistCounter>/)?.[1];
        const start = block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1];
        const idMatch = link.match(/watch\/((?:sm|nm|so)[1-9]\d*)/);
        if (!idMatch) continue;
        const contentId = idMatch[1];
        let lengthSeconds: number | undefined;
        if (lenStr) {
          const p = lenStr.split(":").map(Number);
          if (p.length === 2) lengthSeconds = p[0] * 60 + p[1];
          else if (p.length === 3) lengthSeconds = p[0] * 3600 + p[1] * 60 + p[2];
        }
        items.push({
          contentId,
          title,
          description: desc,
          thumbnailUrl: thumb,
          viewCounter: viewsStr ? Number(viewsStr) : undefined,
          commentCounter: comStr ? Number(comStr) : undefined,
          mylistCounter: myStr ? Number(myStr) : undefined,
          lengthSeconds,
          startTime: start,
        });
        if (++count >= 5) break;
      }
      if (items.length > 0) return items;
    }
  } catch {}

  // --- 4) HTML パース（ID 抽出 → oEmbed / getthumbinfo）---
  try {
    const htmlUrl = `https://www.nicovideo.jp/search/${encodeURIComponent(q)}?page=1`;
    const htmlRes = await fetch(htmlUrl, {
      headers: {
        ...COMMON_HEADERS,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      } as any,
    });
    if (htmlRes.ok) {
      const html = await htmlRes.text();
      const idSet = new Set<string>();
      const reHref = /href=["']\/?watch\/(?:\?reload=\d+&)?((?:sm|nm|so)[1-9]\d*)["']/g;
      let m1: RegExpExecArray | null;
      while ((m1 = reHref.exec(html)) && idSet.size < 12) idSet.add(m1[1]);

      const reJson1 = /"contentId":"((?:sm|nm|so)[1-9]\d*)"/g;
      let m2: RegExpExecArray | null;
      while ((m2 = reJson1.exec(html)) && idSet.size < 12) idSet.add(m2[1]);

      const reJson2 = /"watchId":"((?:sm|nm|so)[1-9]\d*)"/g;
      let m3: RegExpExecArray | null;
      while ((m3 = reJson2.exec(html)) && idSet.size < 12) idSet.add(m3[1]);

      const reData = /data-(?:content-id|gtm-content-id)=["']((?:sm|nm|so)[1-9]\d*)["']/g;
      let m4: RegExpExecArray | null;
      while ((m4 = reData.exec(html)) && idSet.size < 12) idSet.add(m4[1]);

      const results: NicoSnapshotItem[] = [];
      for (const id of idSet) {
        // oEmbed
        try {
          const oembedUrl = `https://www.nicovideo.jp/oembed?url=${encodeURIComponent(`https://www.nicovideo.jp/watch/${id}`)}&format=json`;
          const oRes = await fetch(oembedUrl, {
            headers: {
              ...COMMON_HEADERS,
              "Accept": "application/json, text/plain, */*",
            } as any,
          });
          if (oRes.ok) {
            const ojson = (await oRes.json().catch(() => undefined)) as any;
            results.push({
              contentId: id,
              title: typeof ojson?.title === "string" ? ojson.title : "",
              description: typeof ojson?.description === "string" ? ojson.description : undefined,
              thumbnailUrl: await resolveBetterNicoThumb(
                typeof ojson?.thumbnail_url === "string" ? ojson.thumbnail_url : undefined
              ),
              userNickname: typeof ojson?.author_name === "string" ? ojson.author_name : undefined,
              channelName: typeof ojson?.provider_name === "string" ? ojson.provider_name : undefined,
            });
            continue;
          }
        } catch {}

        // getthumbinfo fallback
        try {
          const xmlUrl = `https://ext.nicovideo.jp/api/getthumbinfo/${id}`;
          const xmlRes = await fetch(xmlUrl, {
            headers: {
              ...COMMON_HEADERS,
              "Accept": "application/xml, text/xml, */*",
            } as any,
          });
          if (xmlRes.ok) {
            const xml = await xmlRes.text();
            const lengthStr = xmlGet(xml, "length");
            let lengthSeconds: number | undefined;
            if (lengthStr) {
              const p = lengthStr.split(":").map(Number);
              if (p.length === 2) lengthSeconds = p[0] * 60 + p[1];
              else if (p.length === 3) lengthSeconds = p[0] * 3600 + p[1] * 60 + p[2];
            }
            results.push({
              contentId: id,
              title: decodeXml(xmlGet(xml, "title")) ?? "",
              description: decodeXml(xmlGet(xml, "description")),
              thumbnailUrl: await resolveBetterNicoThumb(xmlGet(xml, "thumbnail_url")),
              viewCounter: Number(xmlGet(xml, "view_counter")) || undefined,
              commentCounter: Number(xmlGet(xml, "comment_num")) || undefined,
              mylistCounter: Number(xmlGet(xml, "mylist_counter")) || undefined,
              lengthSeconds,
              startTime: xmlGet(xml, "first_retrieve"),
              userId: xmlGet(xml, "user_id"),
              userNickname: decodeXml(xmlGet(xml, "user_nickname")),
              channelId: xmlGet(xml, "ch_id") || xmlGet(xml, "channel_id"),
              channelName: decodeXml(xmlGet(xml, "ch_name") || xmlGet(xml, "channel_name")),
              lastResBody: decodeXml(xmlGet(xml, "last_res_body")),
            });
          }
        } catch {}
      }
      if (results.length > 0) return results;
    }
  } catch {}

  return undefined;
}

(async () => {
  try {
    const payload = (typeof workerData === "string" ? workerData : "") as Payload;
    const data = await searchNicoVideo(payload);
    parentPort?.postMessage({ ok: true, data: Array.isArray(data) ? data : [] });
  } catch (e) {
    parentPort?.postMessage({ ok: false, error: String(e) });
  }
})();
