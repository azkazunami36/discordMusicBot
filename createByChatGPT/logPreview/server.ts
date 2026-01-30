// server.ts — NDJSON(JSONL) viewer (seekable paging via line index + streaming search)
import http from "http";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import url from "url";

// ==== debug helpers ====
const DBG = "[logPreview:server]";
const dbg = (...a: any[]) => console.log(DBG, ...a);
const dgw = (...a: any[]) => console.warn(DBG, ...a);
const dge = (...a: any[]) => console.error(DBG, ...a);

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

// ====== 環境変数（サーバーのみ） ======
const PORT = Number(process.env.PORT || 5500);
// LOG_PATH を賢く解決（環境変数 > 既知の候補を順に探索）
function resolveLogPath(): string {
  const envP = process.env.LOG_PATH;
  if (envP) {
    return path.isAbsolute(envP) ? envP : path.join(__dirname, envP);
  }
  const candidates = [
    // (1) プロジェクト直下の log/
    path.join(__dirname, "../../log/sumlogJSON.jsonl"),
    // (2) ひとつ上の log/
    path.join(__dirname, "../log/sumlogJSON.jsonl"),
    // (3) 同ディレクトリ配下の log/
    path.join(__dirname, "log/sumlogJSON.jsonl"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  // 最後の手段（存在しなくても候補1を返す）
  return candidates[0];
}
const LOG_PATH = resolveLogPath();

// ページサイズ（クライアントへ /config で渡す既定値）
const CFG_PAGE_SIZE = Number(process.env.PAGE_SIZE || 1000);
const CFG_POLL_MS   = Number(process.env.POLL_MS   || 1000);

// インデックスの粒度（何行ごとにオフセットを記録するか）
const INDEX_SPAN    = Number(process.env.INDEX_SPAN || 1000);

// 検索ウィンドウ（最新から固定幅で5万行など）
const SEARCH_WINDOW_SIZE = Number(process.env.SEARCH_WINDOW_SIZE || 50000);

// ====== 低レベルユーティリティ ======
function safeStat(p: string): fs.Stats | null { try { return fs.statSync(p); } catch { return null; } }
function openFdSync(p: string): number { return fs.openSync(p, "r"); }
function closeFdSync(fd: number) { try { fs.closeSync(fd); } catch {} }

function readSliceSync(fd: number, start: number, length: number): Buffer {
  // 🛡 Guard against negative or NaN values
  if (!Number.isFinite(length) || length <= 0) {
    return Buffer.alloc(0);
  }
  if (!Number.isFinite(start) || start < 0) {
    start = 0;
  }

  // Clamp to 2 GiB (max Buffer size safety for Node)
  const MAX_SLICE = 2 * 1024 * 1024 * 1024;
  const safeLen = Math.min(length, MAX_SLICE);

  const buf = Buffer.allocUnsafe(safeLen);
  try {
    fs.readSync(fd, buf, 0, safeLen, start);
  } catch (err: any) {
    // Graceful fallback for out-of-range or partial reads
    if (err.code === "ERR_OUT_OF_RANGE" || err.code === "EINVAL" || err.code === "EFBIG") {
      return Buffer.alloc(0);
    }
    throw err;
  }
  return buf;
}

// 改行検出（CR, LF, CRLF）
function forEachLineChunk(
  buf: Buffer,
  startOffset: number,
  cb: (lineStartOff: number, lineEndOff: number, endsWithNewline: boolean) => void
) {
  let i = 0;
  let lineStart = 0;
  const n = buf.length;

  while (i < n) {
    const c = buf[i];
    if (c === 0x0a) { // LF
      cb(startOffset + lineStart, startOffset + i, true);
      i += 1; lineStart = i;
    } else if (c === 0x0d) { // CR or CRLF
      if (i + 1 < n && buf[i + 1] === 0x0a) {
        cb(startOffset + lineStart, startOffset + i, true);
        i += 2; lineStart = i;
      } else {
        cb(startOffset + lineStart, startOffset + i, true);
        i += 1; lineStart = i;
      }
    } else {
      i += 1;
    }
  }
  if (lineStart < n) {
    // 末尾に改行なし
    cb(startOffset + lineStart, startOffset + n, false);
  }
}

// 指定オフセットから指定行数ぶんだけ前方へ読み進めて、文字列で返す（安全な最小読み）
function readLinesRange(
  fd: number,
  startOff: number,
  startLine: number,
  endLine: number
): { text: string, firstLineNo: number, lastLineNo: number } {
  const CHUNK = 1024 * 256; // 256KB
  let off = startOff;
  const fileSize = fs.fstatSync(fd).size;

  const parts: string[] = [];
  let lineNo = startLine - 1; // 完了した論理行番号
  let firstCaptured = -1;
  let lastCaptured = -1;
  let pending = ""; // チャンクをまたぐ行の断片

  while (off < fileSize && lineNo < endLine) {
    const len = Math.min(CHUNK, fileSize - off);
    const buf = readSliceSync(fd, off, len);

    forEachLineChunk(buf, off, (ls, le, hasNL) => {
      const fragment = buf.slice(ls - off, le - off).toString("utf-8");

      if (hasNL) {
        // 改行に到達＝論理行が確定
        lineNo += 1;
        const full = pending ? (pending + fragment) : fragment;
        if (lineNo >= startLine && lineNo <= endLine) {
          if (firstCaptured < 0) firstCaptured = lineNo;
          parts.push(full);
          lastCaptured = lineNo;
        }
        pending = "";
      } else {
        // 改行に達していない＝断片を貯める
        pending += fragment;
      }
    });

    off += len;
  }

  // endLine に達していなくてもファイル末尾に至った場合、末尾改行なしの最終行を含める
  if (pending && lineNo < endLine) {
    lineNo += 1;
    if (lineNo >= startLine && lineNo <= endLine) {
      if (firstCaptured < 0) firstCaptured = lineNo;
      parts.push(pending);
      lastCaptured = lineNo;
    }
    pending = "";
  }

  return {
    text: parts.join("\n"),
    firstLineNo: firstCaptured >= 0 ? firstCaptured : startLine,
    lastLineNo: lastCaptured >= 0 ? lastCaptured : Math.max(startLine - 1, startLine)
  };
}

// ====== ライン・インデックス ======
/**
 * 行番号 → 近傍のバイトオフセット（先頭の行の先頭）へのマップを N行ごとに保持。
 * - lineCount: 最終行番号（1-based）
 * - checkpoints: [{line, offset}]  例: line=1,1001,2001,…
 * - lastScannedOffset: どこまでスキャン済みか（バイト）
 */
class LineIndex {
  filePath: string;
  checkpoints: { line: number, offset: number }[] = [];
  lineCount = 0;
  lastScannedOffset = 0;
  constructor(p: string) { this.filePath = p; }

  async buildOrUpdate() {
    const st = safeStat(this.filePath);
    if (!st) { this.checkpoints = []; this.lineCount = 0; this.lastScannedOffset = 0; return; }

    // まだ一度もスキャンしていない場合、line=1 のチェックポイントを追加
    if (this.checkpoints.length === 0) {
      this.checkpoints.push({ line: 1, offset: 0 });
    }

    const fd = openFdSync(this.filePath);
    try {
      const fileSize = st.size;
      let off = this.lastScannedOffset;
      if (off > fileSize) off = fileSize;

      const CHUNK = 1024 * 256;
      let lineNo = this.lineCount;

      while (off < fileSize) {
        const len = Math.min(CHUNK, fileSize - off);
        const buf = readSliceSync(fd, off, len);
        let prevLineCount = lineNo;

        forEachLineChunk(buf, off, (_ls, le, hasNL) => {
          // 行終端に達したらカウントを進める
          if (hasNL) lineNo += 1;
          else {
            // ファイル末尾（改行なしの未完行）→とりあえず次回に回す
          }
          // チェックポイント条件：1行目、または INDEX_SPAN ごと
          if (lineNo > 0 && lineNo % INDEX_SPAN === 1 && lineNo !== 1 && hasNL) {
            // 次の行の先頭オフセット = le(行末) + 改行長（ここでは \n と仮定して +1 相当だが、
            // 厳密には CRLF 等でも「次の行の先頭」は forEachLineChunk の次コールで扱うので、
            // チェックポイントは「その行の先頭」に寄せるほうが扱いやすい。従ってここでは前のオフセットを使用しない）
            // → シンプルに「この行の先頭は別途追跡しない」とし、チェックポイントは lineNo の先頭を次回検出時に追加。
          }
        });

        // このチャンクの中でチェックポイント境界を跨いだなら追加
        // シンプル化のため：lineNo が増えた分を使って、境界に達していたら計算して追加
        // ただし正確な先頭オフセットを得るため、再度チャンクを走査して「境界となる行の先頭」を拾う。
        let nextNeed = Math.floor((prevLineCount + INDEX_SPAN) / INDEX_SPAN) * INDEX_SPAN + 1;
        if (nextNeed <= 1) nextNeed = 1 + INDEX_SPAN; // 2回目以降

        if (nextNeed <= lineNo) {
          // チェックポイント対象行の先頭を探す
          let currentLine = prevLineCount;
          forEachLineChunk(buf, off, (ls, _le, hasNL) => {
            if (hasNL) currentLine += 1;
            // 「次の行の先頭」は、いま見ている行が閉じた直後の位置。
            if (hasNL && currentLine + 1 === nextNeed) {
              this.checkpoints.push({ line: nextNeed, offset: _lePlusOne(ls, _le, buf, off) });
              nextNeed += INDEX_SPAN;
            }
          });
        }

        off += len;
      }

      // 最終行数（改行の数に基づく）。末尾が改行で終わらない場合は +1 しない。
      // ここでは簡易に「最後に改行があった数」を行数とみなす（NDJSON前提ではほぼ常に改行あり）。
      // より厳密にするならファイル末尾を1バイト読んで CR/LF 判定して +1 を調整しても可。
      this.lineCount = this._countLinesByScan(fd, fileSize);
      this.lastScannedOffset = fileSize;

      // 初期チェックポイントが重複しないよう整列・ユニーク
      this.checkpoints.sort((a, b) => a.line - b.line);
      const uniq: { line: number, offset: number }[] = [];
      for (const cp of this.checkpoints) {
        if (uniq.length === 0 || uniq[uniq.length - 1].line !== cp.line) uniq.push(cp);
      }
      this.checkpoints = uniq;
    } finally {
      closeFdSync(fd);
    }
  }

  // ファイル全体の行数をカウント（高速チャンク）
  private _countLinesByScan(fd: number, fileSize: number): number {
    const CHUNK = 1024 * 256;
    let off = 0, lines = 0, lastHadNL = false;

    while (off < fileSize) {
      const len = Math.min(CHUNK, fileSize - off);
      const buf = readSliceSync(fd, off, len);
      forEachLineChunk(buf, off, (_ls, _le, hasNL) => {
        if (hasNL) { lines += 1; lastHadNL = true; }
        else { lastHadNL = false; }
      });
      off += len;
    }
    // 末尾が改行で終わらない場合は未完行を1行として数える
    if (!lastHadNL && fileSize > 0) lines += 1;
    return lines;
  }

  // 指定行の先頭オフセットを概算（チェックポイントから前方スキャン）
  // line: 1-based
  getOffsetForLine(fd: number, line: number): number {
    if (line <= 1) return 0;
    if (this.checkpoints.length === 0) return 0;

    // 直近のチェックポイント
    let i = this.checkpoints.findIndex(cp => cp.line > line);
    if (i === -1) i = this.checkpoints.length;
    const cp = this.checkpoints[i - 1] || this.checkpoints[0];

    // cp.line の先頭オフセットから line まで前方走査
    let off = cp.offset;
    const target = line;
    let curLine = cp.line - 1;

    const CHUNK = 1024 * 256;
    const fileSize = fs.fstatSync(fd).size;

    while (off < fileSize && curLine < target - 1) {
      const len = Math.min(CHUNK, fileSize - off);
      const buf = readSliceSync(fd, off, len);
      forEachLineChunk(buf, off, (_ls, le, hasNL) => {
        if (hasNL) {
          curLine += 1;
          if (curLine + 1 === target) {
            // 次の行先頭 = 行末の次バイト
            off = _lePlusOne(_ls, le, buf, off);
          }
        }
      });
      if (curLine + 1 >= target) break;
      off += len;
    }
    return off;
  }
}

function _lePlusOne(_ls: number, le: number, buf: Buffer, base: number): number {
  // le は行末（CR または LF の直前）。次の1〜2バイトが改行本体。
  // ここでは「最低1バイト進める」だけでOK。seek読みでは次チャンクで正しく扱える。
  return le + 1;
}

// ====== インデックス管理インスタンス ======
const indexer = new LineIndex(LOG_PATH);

// サーバー起動時に初回構築
(async () => { await indexer.buildOrUpdate(); })();

// ファイルの更新を緩やかに追従（ポーリング）
setInterval(async () => {
  const st = safeStat(LOG_PATH);
  if (!st) return;
  if (st.size !== indexer.lastScannedOffset) {
    await indexer.buildOrUpdate();
  }
}, 1500);

// ====== 検索ユーティリティ（複合条件 AND/OR 対応） ======
type Condition = {
  q: string;              // 検索語（部分一致・小文字比較）
  field?: string;         // 列名: type | functionName | message | user | guild | textChannel | voiceChannel
  exclude?: boolean;      // 除外条件（trueなら一致しないこと）
};

// 外側配列＝OR、内側配列＝AND
// 例: [[{q:"error",field:"type"},{q:"join",field:"functionName"}], [{q:"fatal",field:"message"}]]
//   → (typeに"error" AND functionNameに"join") OR (messageに"fatal")
type ConditionSets = Condition[][];

function buildFieldMapFromParsed(d: any): Record<string, string> {
  const i = d?.info ?? {};
  const g = i?.guild ?? {};
  const tx = i?.textChannelId ?? {};
  const vx = i?.voiceChannelId ?? {};
  const u  = i?.userId ?? {};
  return {
    type: String(d?.type ?? ""),
    functionName: String(i?.functionName ?? ""),
    message: String(d?.message ?? ""),
    user: String(u?.globalName ?? u?.displayName ?? u?.username ?? ""),
    guild: String(g?.name ?? g?.id ?? ""),
    textChannel: String(tx?.name ?? tx?.id ?? ""),
    voiceChannel: String(vx?.name ?? vx?.id ?? ""),
  };
}

function normalizeVal(v: unknown): string { return String(v ?? "").toLowerCase(); }

function evaluateConditionSets(
  sets: ConditionSets | null | undefined,
  fieldMap: Record<string,string>,
  fallback?: { field: string, q: string, exclude: boolean }
): boolean {
  // 後方互換：sets が無ければ単一条件で評価
  if (!sets || !Array.isArray(sets) || sets.length === 0) {
    if (!fallback) return true; // 条件なし
    const val = normalizeVal(fieldMap[fallback.field] ?? "");
    const hit = fallback.q ? val.includes(fallback.q.toLowerCase()) : true;
    return fallback.exclude ? !hit : hit;
  }
  // 外側 OR、内側 AND
  for (const andGroup of sets) {
    if (!Array.isArray(andGroup)) continue;
    let allOk = true;
    for (const cond of andGroup) {
      const field = (cond?.field ?? "message");
      const q = String(cond?.q ?? "").toLowerCase();
      const exclude = Boolean(cond?.exclude);
      const val = normalizeVal(fieldMap[field] ?? "");
      const hit = q ? val.includes(q) : true;
      const ok = exclude ? !hit : hit;
      if (!ok) { allOk = false; break; }
    }
    if (allOk) return true; // OR 成立
  }
  return false;
}

// Robustly decode conds (accept raw JSON, once- or double-encoded)
function decodeCondsParam(raw: string | null): any[] {
  if (!raw) return [];
  let s = raw;
  for (let i = 0; i < 2; i++) {
    try { JSON.parse(s); break; } catch {
      try {
        const dec = decodeURIComponent(s);
        if (dec === s) break;
        s = dec;
      } catch { break; }
    }
  }
  try {
    const v = JSON.parse(s);
    if (Array.isArray(v)) return v;
    return [];
  } catch (e) {
    dgw("decodeCondsParam: JSON parse failed; returning []", { sample: s.slice(0, 120) });
    return [];
  }
}

// ====== HTTP Server ======
const server = http.createServer(async (req, res) => {
  try {
    const parsed = new URL(req.url!, "http://localhost");
    const pathname = parsed.pathname;
    dbg("REQ", { method: req.method, path: pathname, qs: parsed.searchParams.toString() });

    if (pathname === "/") {
      // 静的 index.html を配信（パスを堅牢化）
      const candidates = [
        path.join(__dirname, "createByChatGPT/logPreview/index.html"),
        path.join(__dirname, "logPreview/index.html"),
        path.join(__dirname, "index.html"),
      ];
      let htmlPath = "";
      for (const p of candidates) {
        if (fs.existsSync(p)) { htmlPath = p; break; }
      }
      if (!htmlPath) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end("<!doctype html><meta charset='utf-8'><title>log preview</title><p>index.html が見つかりませんでした。サーバーと同じディレクトリ、または createByChatGPT/logPreview/ に配置してください。</p>");
        return;
      }
      const html = await fsp.readFile(htmlPath, "utf-8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }

    if (pathname === "/config") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ pageSize: CFG_PAGE_SIZE, pollMs: CFG_POLL_MS, searchWindowSize: SEARCH_WINDOW_SIZE }));
      return;
    }

    if (pathname === "/head") {
      const st = safeStat(LOG_PATH);
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(st ? { size: st.size, mtimeMs: st.mtimeMs } : { size: 0, mtimeMs: 0 }));
      return;
    }

    if (pathname === "/data") {
      const pos = Math.max(0, Number(parsed.searchParams.get("pos") || "0"));
      const st = safeStat(LOG_PATH);
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });

      if (!st) {
        res.end(JSON.stringify({ chunk: "", nextPos: 0, size: 0 }));
        return;
      }

      const size = st.size;

      // 🛡 安全チェック: pos がファイルサイズより大きい場合はリセット
      if (pos >= size) {
        res.end(JSON.stringify({ chunk: "", nextPos: size, size }));
        return;
      }

      const length = Math.max(0, size - pos); // 🛡 length は負にならないよう制限
      const fd = openFdSync(LOG_PATH);
      try {
        const buf = readSliceSync(fd, pos, length);
        res.end(JSON.stringify({ chunk: buf.toString("utf-8"), nextPos: size, size }));
      } finally {
        closeFdSync(fd);
      }
      return;
    }

    // newest-first ページング
    if (pathname === "/page") {
      await indexer.buildOrUpdate(); // 念のため最新化
      dbg("/page begin", { index: parsed.searchParams.get("index"), size: parsed.searchParams.get("size"), totalLines: indexer.lineCount });
      const pageIndex = Math.max(1, Number(parsed.searchParams.get("index") || "1"));
      const pageSize  = Math.max(1, Number(parsed.searchParams.get("size")  || String(CFG_PAGE_SIZE)));
      const total = indexer.lineCount;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));

      // 追加: ファイルが存在しない場合や0行の場合、空の結果を返す
      const stFile = safeStat(LOG_PATH);
      if (!stFile || total === 0) {
        dbg("/page done", { pageIndex, pageSize, totalPages, total });
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({
          lines: "",
          totalLines: total,
          pageIndex,
          pageSize,
          totalPages,
          size: stFile ? stFile.size : 0,
          startIndex: 0
        }));
        return;
      }

      // newest-first: 1ページ目が末尾
      const endLine   = Math.max(0, total - (pageIndex - 1) * pageSize);
      const startLine = Math.max(1, endLine - pageSize + 1);
      const count     = (endLine >= startLine) ? (endLine - startLine + 1) : 0;

      const fd = openFdSync(LOG_PATH);
      try {
        let linesText = "";
        let firstLineNo = startLine;
        if (count > 0) {
          const startOff = indexer.getOffsetForLine(fd, startLine);
          const { text, firstLineNo: f, lastLineNo: _ } = readLinesRange(fd, startOff, startLine, endLine);
          linesText = text;
          firstLineNo = f;
        }

        dbg("/page done", { pageIndex, pageSize, totalPages, total });
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({
          lines: linesText,
          totalLines: total,
          pageIndex,
          pageSize,
          totalPages,
          size: safeStat(LOG_PATH)?.size || 0,
          // index.html は firstLineNo-1 を「base」として使い、# を実行番号で表示
          startIndex: Math.max(0, firstLineNo - 1)
        }));
      } finally { closeFdSync(fd); }
      return;
    }

    // tail は page(index=1) 相当
    if (pathname === "/tail") {
      parsed.searchParams.set("index", "1");
      dbg("/tail redirect -> /page?"+parsed.searchParams.toString());
      req.url = "/page?" + parsed.searchParams.toString();
      server.emit("request", req, res);
      return;
    }

    // 範囲限定検索（検索ウィンドウ単位、newest-first ページング）
    if (pathname === "/search-window") {
      await indexer.buildOrUpdate();
      const field    = (parsed.searchParams.get("field") || "message") as string;
      const q        = (parsed.searchParams.get("q") || "").toString();
      const exclude  = Number(parsed.searchParams.get("exclude") || "0") === 1;
      const windex   = Math.max(0, Number(parsed.searchParams.get("windex") || "0"));  // 0=最新側
      const page     = Math.max(1, Number(parsed.searchParams.get("index")  || "1")); // 1-based
      const size     = Math.max(1, Number(parsed.searchParams.get("size")   || String(CFG_PAGE_SIZE)));

      const totalLines = indexer.lineCount;
      const windowSize = SEARCH_WINDOW_SIZE;
      const windowCount = Math.max(1, Math.ceil(totalLines / windowSize));

      // Logging: start
      console.time("[/search-window]");
      dbg("/search-window begin", { field, q, exclude, windex, page, size, rawConds: parsed.searchParams.get("conds")?.slice(0,120) || "" });

      // 範囲の行レンジ（1-based, inclusive）
      const endLine   = Math.max(0, totalLines - windex * windowSize);
      const startLine = Math.max(1, endLine - windowSize + 1);
      if (endLine < 1 || startLine > endLine) {
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({
          lines: "",
          pageIndex: 1,
          pageSize: size,
          totalPages: 1,
          total: 0,
          startIndex: 0,
          window: { index: windex, startLine: 0, endLine: 0, windowCount, totalLines }
        }));
        return;
      }

      dbg("/search-window window", { startLine, endLine, totalLines, windowSize, windowCount });

      const fd = openFdSync(LOG_PATH);
      try {
        // オフセット範囲を決定
        const startOff = indexer.getOffsetForLine(fd, startLine);
        // endLine+1 の先頭 = 範囲終端（なければファイル末尾）
        let endOff: number;
        if (endLine >= totalLines) {
          const st = safeStat(LOG_PATH);
          endOff = st ? st.size : startOff;
        } else {
          endOff = indexer.getOffsetForLine(fd, endLine + 1);
        }
        dbg("/search-window offsets", { startOff, endOff });

        // 1パス：範囲内のマッチ（行テキスト＋実ファイル行番号）を収集（複合条件対応）
        // conds param parse
        const condSets = decodeCondsParam(parsed.searchParams.get("conds")) as ConditionSets;
        dbg("/search-window conds", { decodedOrGroups: Array.isArray(condSets) ? condSets.length : 0 });
        const fallback = { field, q, exclude };

        const matches: { line: string, lineNo: number }[] = [];
        await streamEachLineInRange(LOG_PATH, startOff, endOff, async (line, lineNoInFile) => {
          try {
            const d = JSON.parse(line);
            const fieldMap = buildFieldMapFromParsed(d);
            const ok = evaluateConditionSets(condSets, fieldMap, fallback);
            if (ok) matches.push({ line, lineNo: lineNoInFile });
          } catch {
            // 解析できない行はスキップ
          }
        }, startLine);
        dbg("/search-window matches", { total: matches.length });

        const totalHits = matches.length;
        const totalPages = Math.max(1, Math.ceil(totalHits / size));
        const safePage = Math.min(page, totalPages);

        // newest-first ページング（matches は古い→新しい順で入っているので末尾基準で切り出し）
        const endIdx   = Math.max(0, totalHits - (safePage - 1) * size); // 非包含端
        const startIdx = Math.max(0, endIdx - size);
        const pageItems = matches.slice(startIdx, endIdx);
        const lines = pageItems.map(m => m.line).join("\n");
        const firstLineNo = pageItems.length > 0 ? pageItems[0].lineNo : 0;
        const numbers = pageItems.map(m => m.lineNo);

        dbg("/search-window response", { pageIndex: safePage, totalPages, pageItems: pageItems.length });
        console.timeEnd("[/search-window]");
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({
          lines,
          pageIndex: safePage,
          pageSize: size,
          totalPages,
          total: totalHits,
          startIndex: Math.max(0, firstLineNo - 1),
          numbers,
          window: { index: windex, startLine, endLine, windowCount, totalLines }
        }));
        return;
      } finally {
        closeFdSync(fd);
      }
    }

    // 全体検索（2パス・ストリーム、newest-first ページング）
    if (pathname === "/search") {
      await indexer.buildOrUpdate();
      const field   = (parsed.searchParams.get("field") || "message") as string;
      const q       = (parsed.searchParams.get("q") || "").toString();
      const exclude = Number(parsed.searchParams.get("exclude") || "0") === 1;
      const page    = Math.max(1, Number(parsed.searchParams.get("index") || "1"));
      const size    = Math.max(1, Number(parsed.searchParams.get("size")  || String(CFG_PAGE_SIZE)));

      console.time("[/search]");
      dbg("/search begin", { field, q, exclude, page, size, rawConds: parsed.searchParams.get("conds")?.slice(0,120) || "" });

      // 1パス目：総ヒット数をカウント（複合条件対応）
      const condSets = decodeCondsParam(parsed.searchParams.get("conds")) as ConditionSets;
      dbg("/search conds", { decodedOrGroups: Array.isArray(condSets) ? condSets.length : 0 });
      const fallback = { field, q, exclude };

      let totalHits = 0;
      await streamEachLine(LOG_PATH, (lineText) => {
        try {
          const d = JSON.parse(lineText);
          const fieldMap = buildFieldMapFromParsed(d);
          if (evaluateConditionSets(condSets, fieldMap, fallback)) totalHits += 1;
        } catch {}
      });

      const totalPages = Math.max(1, Math.ceil(totalHits / size));
      dbg("/search count done", { totalHits, totalPages });
      if (totalHits === 0) {
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({
          lines: "",
          pageIndex: Math.min(page, totalPages),
          pageSize: size,
          totalPages,
          total: 0,
          startIndex: 0
        }));
        console.timeEnd("[/search]");
        return;
      }

      // newest-first ページングの切り出し範囲
      const endIdx   = Math.max(0, totalHits - (page - 1) * size) - 1;    // 0-based
      const startIdx = Math.max(0, endIdx - size + 1);

      // 2パス目：指定レンジのマッチだけ拾う
      const picked: string[] = [];
      let firstPickedLineNo = -1;
      let hitNo = -1; // マッチの通し番号（0-based）
      let lineNo = 0; // 実ファイルの行番号（1-based）

      await streamEachLine(LOG_PATH, (lineText) => {
        lineNo += 1;
        try {
          const d = JSON.parse(lineText);
          const fieldMap = buildFieldMapFromParsed(d);
          const ok = evaluateConditionSets(condSets, fieldMap, fallback);
          if (ok) {
            hitNo += 1;
            if (hitNo >= startIdx && hitNo <= endIdx) {
              if (firstPickedLineNo < 0) firstPickedLineNo = lineNo;
              picked.push(lineText);
            }
          }
        } catch {}
      });

      // newest-first で返すために末尾基準で切ったが、クライアントでは受け取った順をそのまま描画する。
      // ここでは「startIndex = (最初に返す実行番号-1)」を返す。
      dbg("/search response", { pageIndex: Math.min(page, totalPages), items: picked.length });
      console.timeEnd("[/search]");
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({
        lines: picked.join("\n"),
        pageIndex: Math.min(page, totalPages),
        pageSize: size,
        totalPages,
        total: totalHits,
        startIndex: Math.max(0, (firstPickedLineNo > 0 ? firstPickedLineNo - 1 : 0))
      }));
      return;
    }

    // 404
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not Found");
  } catch (e) {
    console.error("[HTTP ERROR]", e);
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Internal Server Error");
  }
});

// ストリームで 1 行ずつコールバック（低メモリ）
async function streamEachLine(file: string, onLine: (line: string) => void | Promise<void>) {
  dbg("streamEachLine start");
  const st = safeStat(file);
  if (!st) { dbg("streamEachLine done"); return; }
  const stream = fs.createReadStream(file, { encoding: "utf-8", highWaterMark: 1024 * 256 });
  let buf = "";
  for await (const chunk of stream) {
    buf += chunk as string;
    let idx: number;
    while ((idx = buf.search(/\r?\n/)) !== -1) {
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + (buf[idx] === "\r" && buf[idx + 1] === "\n" ? 2 : 1));
      await onLine(line);
    }
  }
  if (buf) { await onLine(buf); } // 末尾に改行なしの場合
  dbg("streamEachLine done");
}

// 指定バイト範囲をストリームして1行ずつ処理（CR/LF/CRLF対応）
async function streamEachLineInRange(
  file: string,
  startOff: number,
  endOff: number,
  onLine: (line: string, lineNoInFile: number) => void | Promise<void>,
  startLineNo: number
) {
  dbg("streamEachLineInRange start", { startOff, endOff, startLineNo });
  const st = safeStat(file);
  if (!st) { dbg("streamEachLineInRange done", { lastLineNo: startLineNo - 1 }); return; }
  const to = Math.min(endOff, st.size);
  const stream = fs.createReadStream(file, { encoding: "utf-8", start: startOff, end: to - 1, highWaterMark: 1024 * 256 });
  let buf = "";
  let lineNo = startLineNo - 1;
  for await (const chunk of stream) {
    buf += chunk as string;
    let m: RegExpMatchArray | null;
    while ((m = buf.match(/\r?\n/)) !== null) {
      const idx = m.index!;
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + (m[0] === "\r\n" ? 2 : 1));
      lineNo += 1;
      await onLine(line, lineNo);
    }
  }
  if (buf.length > 0) {
    lineNo += 1;
    await onLine(buf, lineNo);
  }
  dbg("streamEachLineInRange done", { lastLineNo: lineNo });
}

server.listen(PORT, () => {
  console.log(`✅ Server running: http://localhost:${PORT}`);
  console.log(`   File: ${LOG_PATH}`);
  console.log(`   PAGE_SIZE=${CFG_PAGE_SIZE}, POLL_MS=${CFG_POLL_MS}, INDEX_SPAN=${INDEX_SPAN}`);
});
