import { parentPort, workerData } from "worker_threads";

/**
 * 入力: string (ニコニコ公開マイリストURL)
 * 出力: { ok:true, data: string[] | undefined } | { ok:false, error: string }
 * 仕様: niconico.ts の getNicoMylistIds と同等の挙動
 * 許可パス: /mylist/<digits>, /my/mylist/<digits>, /user/<digits>/mylist/<digits>
 * （公開マイリストのみ対象。query は無視されます）
 */
async function getNicoMylistIds(url: string): Promise<string[] | undefined> {
  // 入力検証
  let u: URL;
  try { u = new URL(url); } catch { return undefined; }

  const host = u.hostname.toLowerCase();
  // nicovideo.jp のみ許可（nico.ms 等は不可）
  if (!/^(?:[^.]+\.)?nicovideo\.jp$/.test(host)) return undefined;

  // /mylist/<digits>, /my/mylist/<digits>, /user/<digits>/mylist/<digits> のみ許可（公開マイリストのみ対象）
  const m = u.pathname.match(/^(?:\/(?:user\/\d+\/)?mylist\/(\d+)|\/my\/mylist\/(\d+))(?:\/|$)/);
  if (!m) return undefined;

  const mylistId = m[1] ?? m[2];
  const rssUrl = `https://www.nicovideo.jp/mylist/${mylistId}?rss=2.0`;

  try {
    const res = await fetch(rssUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) NodeFetch/1.0 Chrome/123.0.0.0 Safari/537.36",
        "Accept": "application/rss+xml, application/xml, text/xml, */*",
        "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
        "Referer": "https://www.nicovideo.jp/",
        "Accept-Encoding": "gzip, deflate, br",
      } as any,
    });
    if (!res.ok) return undefined; // 非公開や404など

    const xml = await res.text();
    // RSSアイテム単位で ID を抽出（重複排除）
    // 過剰取得の原因: 説明文などに含まれる別動画のIDまで拾っていたため。
    // 対策: <item> ごとに <link>/<guid> を優先的に解析し、
    //       それが無ければその <item> 範囲に限定して1件だけ拾う。
    const idSet = new Set<string>();

    // item 抜き出し
    const itemBlocks = xml.split(/<item>/g).slice(1).map(block => block.split(/<\/item>/)[0]);
    const watchUrlRe = /https?:\/\/(?:www\.)?nicovideo\.jp\/watch\/((?:sm|nm|so)[1-9]\d*)/;
    const idRe = /\b(?:sm|nm|so)[1-9]\d*\b/g; // 保険用（item内限定）

    console.log(`[NicoMylist][parse] items=${itemBlocks.length}`);

    for (const [idx, item] of itemBlocks.entries()) {
      let id: string | undefined;

      // 1) <link> 優先
      const linkMatch = item.match(/<link>([^<]+)<\/link>/);
      if (linkMatch) {
        const m = linkMatch[1].match(watchUrlRe);
        if (m) id = m[1];
      }

      // 2) <guid> 次点
      if (!id) {
        const guidMatch = item.match(/<guid>[^<]*<\/guid>/);
        if (guidMatch) {
          const m = guidMatch[0].match(watchUrlRe);
          if (m) id = m[1];
        }
      }

      // 3) item 内のテキストから最後の手段として1件だけ拾う
      if (!id) {
        const within = item.match(idRe);
        if (within && within.length > 0) id = within[0];
      }

      if (id) {
        idSet.add(id);
      } else {
        // 何も拾えなかった item はスキップ（コンソールのみ記録）
        console.log(`[NicoMylist][parse] item#${idx} id not found`);
      }
    }

    console.log(`[NicoMylist][result] unique=${idSet.size}`);
    return Array.from(idSet);
  } catch {
    return undefined;
  }
}

(async () => {
  try {
    const input = typeof workerData === "string" ? workerData : "";
    const data = await getNicoMylistIds(input);
    parentPort?.postMessage({ ok: true, data });
  } catch (e) {
    parentPort?.postMessage({ ok: false, error: String(e) });
  }
})();
