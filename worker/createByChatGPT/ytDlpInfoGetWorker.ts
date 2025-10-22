/**
 * Worker Thread 側コード。
 * 親（Helper）から渡された Playlist を受け取り、
 * yt-dlp を実行して行区切り JSON をパースし、YtDlpInfo[] を返します。
 *
 * 実行コマンド: yt-dlp -j -q --no-warnings --cookies-from-browser chrome <URL> [extraArgs...]
 */

import { isMainThread, parentPort, workerData } from "node:worker_threads";
import { spawn } from "node:child_process";
import { Playlist } from "../../class/envJSON.js";
import { YtDlpInfo } from "../../createByChatGPT/ytDlp.js";
import { Picture } from "../../class/sourcePathManager.js";

/** WorkerData で受け取るデータの型 */
interface JobData {
  playlist: Playlist;
}

/** 親スレッドへ返すメッセージの型 */
type WorkerReply =
  | { ok: true; data: YtDlpInfo[]; stderr?: string }
  | { ok: false; error: string; stderr?: string };

/** メインスレッドから直接実行されることは想定しない */
if (isMainThread) {
  // もし直に呼ばれたら何もせず終了（安全策）
  process.exit(0);
}

/** Worker の本体処理 */
(async () => {
  const port = parentPort!;
  const { playlist } = (workerData as JobData) ?? {};

  try {
    const args = buildArgs(playlist);
    const { stdout, stderr, code, signal } = await runYtDlp(args);

    if (code !== 0) {
      const msg = [
        `yt-dlp exited with code=${code}${signal ? ` signal=${signal}` : ""}`,
        stderr ? truncate(stderr, 2000) : ""
      ].filter(Boolean).join("\n");
      const fail: WorkerReply = { ok: false, error: msg, stderr };
      port.postMessage(fail);
      return;
    }

    const data = parseNdjson(stdout);
    const ok: WorkerReply = { ok: true, data, stderr };
    port.postMessage(ok);
  } catch (e: any) {
    const fail: WorkerReply = {
      ok: false,
      error: e?.message ?? String(e)
    };
    port.postMessage(fail);
  }
})().catch((e) => {
  // 最後の砦
  parentPort?.postMessage({ ok: false, error: String(e) } as WorkerReply);
});

/** Playlist から yt-dlp の引数を作る */
function buildArgs(playlist: Playlist | Picture): string[] {
  const { type, body } = playlist;

  // 既定オプション
  const args: string[] = [
    "-j",
    "-q",
    "--no-warnings",
    "--cookies-from-browser",
    "chrome", // 必要なら "safari" へ
  ];

  // サイトごとの追加
  switch (type) {
    case "twitterId":
    case "twitterThumbnail": {
      // X（Twitter）
      const url = `https://x.com/i/web/status/${body}`;
      args.push(url);
      break;
    }

    case "videoId": {
      // YouTube
      const url = `https://youtu.be/${body}`;
      args.push(
        "--extractor-args",
        "youtube:player_client=tv_embedded",
        url
      );
      break;
    }

    case "nicovideoId": {
      // ニコニコ動画
      const url = `https://www.nicovideo.jp/watch/${body}`;
      args.push(
        "--add-header",
        "Referer:https://www.nicovideo.jp/",
        url
      );
      break;
    }

    default: {
      // 既知以外は body をそのまま URL とみなす（必要なら絞ってください）
      args.push(String(body));
      break;
    }
  }

  return args;
}

/** yt-dlp を spawn して stdout/stderr を取得（大きな出力でも安全） */
function runYtDlp(args: string[]): Promise<{ stdout: string; stderr: string; code: number | null; signal: NodeJS.Signals | null; }> {
  return new Promise((resolve) => {
    const child = spawn("yt-dlp", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let out = "";
    let err = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (chunk) => { out += chunk; });
    child.stderr.on("data", (chunk) => { err += chunk; });

    child.on("close", (code, signal) => {
      resolve({ stdout: out, stderr: err, code, signal });
    });

    child.on("error", (e) => {
      resolve({
        stdout: out,
        stderr: err + `\nspawn error: ${String(e)}`,
        code: 1,
        signal: null
      });
    });
  });
}

/** 行区切り JSON（NDJSON）を配列にパース */
function parseNdjson(stdout: string): YtDlpInfo[] {
  const lines = stdout.split(/\r?\n/).filter(Boolean);
  const out: YtDlpInfo[] = [];
  for (const line of lines) {
    try {
      out.push(JSON.parse(line) as YtDlpInfo);
    } catch {
      // 1行壊れてても他は活かす
    }
  }
  return out;
}

/** ログを適度に丸める */
function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…(truncated)" : s;
}
