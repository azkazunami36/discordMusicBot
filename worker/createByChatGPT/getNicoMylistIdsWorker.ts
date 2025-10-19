import { parentPort, workerData } from "worker_threads";

/**
 * 入力: string (ニコニコ公開マイリストURL)
 * 出力: { ok:true, data: string[] | undefined } | { ok:false, error: string }
 * 仕様: niconico.ts の getNicoMylistIds と同等の挙動
 */
async function getNicoMylistIds(url: string): Promise<string[] | undefined> {
  // 入力検証
  let u: URL;
  try { u = new URL(url); } catch { return undefined; }

  const host = u.hostname.toLowerCase();
  // nicovideo.jp のみ許可（nico.ms 等は不可）
  if (!/^(?:[^.]+\.)?nicovideo\.jp$/.test(host)) return undefined;

  // /mylist/<digits> もしくは /my/mylist/<digits> のみ許可（公開マイリストのみ対象）
  const m = u.pathname.match(/^(?:\/mylist\/(\d+)|\/my\/mylist\/(\d+))(?:\/|$)/);
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
    // RSS全体から sm/nm/so のIDを収集（重複排除）
    const idSet = new Set<string>();
    const re = /\b(?:sm|nm|so)[1-9]\d*\b/g;
    let mId: RegExpExecArray | null;
    while ((mId = re.exec(xml))) {
      idSet.add(mId[0]);
    }
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
