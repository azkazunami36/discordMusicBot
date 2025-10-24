// ./worker/createByChatGPT/parseTweetIdWorker.ts
import { parentPort, workerData } from "worker_threads";

/**
 * 入力文字列が Twitter/X のURLまたは数値IDかを判定し、tweet_id とメディアインデックスを返す。
 * - ネットワークアクセスなし
 * - x.com / twitter.com のみ有効
 * - URL内の /status(es)/{id} を優先して抽出
 * - 生ID（数字のみ）もOK
 * - メディアインデックスは /video/{n} または /photo/{n} から抽出（n は正の整数）
 * - canonical URL はメディアサフィックスを除いた絶対URL（例: https://x.com/i/web/status/{id}）
 */
function parseTweetId(input: string): { id?: string; index?: number } {
  const s = String(input ?? "").trim();
  if (!s) return {};

  // 1) 生IDだけ（数字のみ）のケース → idのみ返す
  if (/^\d{6,}$/.test(s)) return { id: s };

  // 2) URLを緩く抽出
  let u: URL | undefined;
  try {
    u = new URL(s);
  } catch {
    const m = /(https?:\/\/[^\s]+)/.exec(s);
    if (m) {
      try { u = new URL(m[1]); } catch { /* noop */ }
    }
  }
  if (!u) return {};

  const host = u.hostname.toLowerCase();
  const isTwitter =
    /(^|\.)x\.com$/.test(host) ||
    /(^|\.)twitter\.com$/.test(host);
  if (!isTwitter) return {};

  const segs = u.pathname.split("/").filter(Boolean);

  let id: string | undefined;
  let index: number | undefined;

  // /i/web/status/{id}, /{user}/status{es}/{id}
  for (let i = 0; i < segs.length - 1; i++) {
    if ((segs[i] === "status" || segs[i] === "statuses") && /^\d{6,}$/.test(segs[i + 1])) {
      id = segs[i + 1];
      break;
    }
  }

  // 念のため数値セグメントを走査してidがまだない場合
  if (!id) {
    const numeric = segs.find((p) => /^\d{6,}$/.test(p));
    if (numeric) id = numeric;
  }

  // メディアインデックス抽出 /video/{n} または /photo/{n}
  for (let i = 0; i < segs.length - 1; i++) {
    if ((segs[i] === "video" || segs[i] === "photo") && /^\d+$/.test(segs[i + 1])) {
      index = parseInt(segs[i + 1], 10);
      break;
    }
  }

  return { id, index };
}

try {
  // さまざまな呼び出し元の形に対応
  const wd: any = workerData;
  const input: string = (
    typeof wd === "string" ? wd :
    typeof wd?.input === "string" ? wd.input :
    (Array.isArray(wd?.inputs) && typeof wd.inputs[0] === "string") ? wd.inputs[0] :
    typeof wd?.url === "string" ? wd.url :
    typeof wd?.body === "string" ? wd.body :
    typeof wd?.value === "string" ? wd.value :
    ""
  );

  const { id, index } = parseTweetId(input);
  if (id) {
    parentPort?.postMessage({ ok: true, data: { id, index } });
  } else {
    parentPort?.postMessage({ ok: true, data: undefined });
  }
} catch (err: any) {
  parentPort?.postMessage({ ok: false, error: String(err?.message ?? err) });
}
