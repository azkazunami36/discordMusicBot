// server.ts — NDJSON(JSONL) viewer backend
// ・環境変数はすべてサーバー側で管理し、/config でクライアントへ配布
// ・最新が1ページ目（newest-first）
// ・サーバー側で全体検索 + ページング
// ・/data は1ページ目の増分取得用（追記監視）
// 依存: Node.js 18+ (ESM)

import http from "http";
import fs from "fs";
import path from "path";
import url from "url";

// ==== 環境変数（サーバーのみで保持） ====
// 例) PORT=5500 LOG_PATH=./log/sumlogJSON.jsonl PAGE_SIZE=2500 POLL_MS=1000
const PORT = Number(process.env.PORT ?? 5500);
const LOG_PATH = String(process.env.LOG_PATH ?? path.join(process.cwd(), "log/sumlogJSON.jsonl"));
const PAGE_SIZE_DEFAULT = Number(process.env.PAGE_SIZE ?? 2500);
const POLL_MS_DEFAULT = Number(process.env.POLL_MS ?? 1000);

// ==== ルート解決 ====
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const INDEX_HTML_PATH = path.join(__dirname, "index.html");

// ==== ユーティリティ ====
function statSafe(p: string) {
  try { return fs.statSync(p); } catch { return null; }
}
function readTextSafe(p: string) {
  try { return fs.readFileSync(p, "utf-8"); } catch { return ""; }
}
function splitLines(s: string) {
  return s.split(/\r?\n/);
}

// newest-first のページ切り出し（index=1 が最新）
function sliceNewestFirst(lines: string[], index: number, size: number) {
  const totalLines = lines.length;
  const end = Math.max(0, totalLines - (index - 1) * size);
  const start = Math.max(0, end - size);
  return { start, end, slice: lines.slice(start, end) };
}

// 検索用：1行JSONからフィールド文字列を抽出（そのまま / 小文字化は呼び出し側）
function extractField(d: any, field: string): string {
  const i = d.info ?? {};
  const u = i.userId ?? {};
  const g = i.guild ?? {};
  const tx = i.textChannelId ?? {};
  const vx = i.voiceChannelId ?? {};
  switch (field) {
    case "type": return (d.type ?? "").toString();
    case "functionName": return i.functionName ?? "";
    case "message": return d.message ?? "";
    case "user": return (u.globalName || u.displayName || u.username || "") ?? "";
    case "guild": return (g.name || g.id || "") ?? "";
    case "textChannel": return (tx.name || tx.id || "") ?? "";
    case "voiceChannel": return (vx.name || vx.id || "") ?? "";
    default: return "";
  }
}

// ==== HTTP サーバー ====
const server = http.createServer(async (req, res) => {
  const parsed = new URL(req.url || "/", "http://localhost");
  const pathname = parsed.pathname;

  // index.html
  if (pathname === "/") {
    const html = readTextSafe(INDEX_HTML_PATH);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
    return;
  }

  // クライアントへ渡す設定（サーバー環境値）
  if (pathname === "/config") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(JSON.stringify({
      pageSize: PAGE_SIZE_DEFAULT,
      pollMs: POLL_MS_DEFAULT,
    }));
    return;
  }

  // ファイルヘッダ（サイズ/mtime）
  if (pathname === "/head") {
    const st = statSafe(LOG_PATH);
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(JSON.stringify(st ? { size: st.size, mtimeMs: st.mtimeMs } : { size: 0, mtimeMs: 0 }));
    return;
  }

  // 追記差分取得（1ページ目・通常モードで使用）
  if (pathname === "/data") {
    const pos = Math.max(0, Number(parsed.searchParams.get("pos") ?? "0"));
    const st = statSafe(LOG_PATH);
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    if (!st) { res.end(JSON.stringify({ chunk: "", nextPos: 0, size: 0 })); return; }

    try {
      const fd = fs.openSync(LOG_PATH, "r");
      try {
        const { size } = fs.fstatSync(fd);
        if (pos >= size) { res.end(JSON.stringify({ chunk: "", nextPos: size, size })); return; }
        const length = size - pos;
        const buf = Buffer.alloc(length);
        fs.readSync(fd, buf, 0, length, pos);
        res.end(JSON.stringify({ chunk: buf.toString("utf-8"), nextPos: size, size }));
      } finally { fs.closeSync(fd); }
    } catch {
      res.end(JSON.stringify({ chunk: "", nextPos: pos, size: st.size }));
    }
    return;
  }

  // newest-first paging: index=1 が最新
  if (pathname === "/page") {
    const index = Math.max(1, Number(parsed.searchParams.get("index") ?? "1"));
    const sizeParam = Math.max(1, Number(parsed.searchParams.get("size") ?? String(PAGE_SIZE_DEFAULT)));
    const st = statSafe(LOG_PATH);
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    if (!st) {
      res.end(JSON.stringify({ lines: "", totalLines: 0, pageIndex: index, pageSize: sizeParam, totalPages: 1, size: 0 }));
      return;
    }
    const text = readTextSafe(LOG_PATH);
    const lines = splitLines(text).filter(l => l.trim().length > 0);
    const totalLines = lines.length;
    const totalPages = Math.max(1, Math.ceil(totalLines / sizeParam));
    const pageIndex = Math.min(index, totalPages);
    const { slice } = sliceNewestFirst(lines, pageIndex, sizeParam);
    res.end(JSON.stringify({ lines: slice.join("\n"), totalLines, pageIndex, pageSize: sizeParam, totalPages, size: st.size }));
    return;
  }

  // 検索（全体） + newest-first ページング
  if (pathname === "/search") {
    const field = (parsed.searchParams.get("field") || "message");
    const q = (parsed.searchParams.get("q") || "").toLowerCase();
    const exclude = (parsed.searchParams.get("exclude") || "0") === "1";
    const index = Math.max(1, Number(parsed.searchParams.get("index") || "1"));
    const sizeParam = Math.max(1, Number(parsed.searchParams.get("size") || String(PAGE_SIZE_DEFAULT)));

    const st = statSafe(LOG_PATH);
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    if (!st || !q) {
      res.end(JSON.stringify({ lines: "", total: 0, pageIndex: 1, totalPages: 1, size: st ? st.size : 0 }));
      return;
    }

    const text = readTextSafe(LOG_PATH);
    const lines = splitLines(text).filter(l => l.trim().length > 0);

    // newest-first で走査してヒット収集
    const matched: string[] = [];
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      try {
        const d = JSON.parse(line);
        const val = (extractField(d, field) || "").toString().toLowerCase();
        const hit = val.indexOf(q) !== -1;
        if ((!exclude && hit) || (exclude && !hit)) matched.push(line);
      } catch { /* ignore parse error */ }
    }

    const total = matched.length;
    const totalPages = Math.max(1, Math.ceil(total / sizeParam));
    const pageIndex = Math.min(index, totalPages);
    const start = (pageIndex - 1) * sizeParam;
    const end = Math.min(start + sizeParam, total);
    const slice = matched.slice(start, end);

    res.end(JSON.stringify({ lines: slice.join("\n"), total, pageIndex, totalPages, size: st.size }));
    return;
  }

  // 404
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not Found");
});

server.listen(PORT, () => {
  console.log(`✅ ローカルサーバー起動: http://localhost:${PORT}`);
  console.log(`   LOG_PATH=${LOG_PATH}  PAGE_SIZE=${PAGE_SIZE_DEFAULT}  POLL_MS=${POLL_MS_DEFAULT}`);
});
