/**
 * 改良版：YouTubeのplayer_clientを順番に試す
 */

import { isMainThread, parentPort, workerData } from "node:worker_threads";
import { spawn } from "node:child_process";
import { Playlist } from "../../class/envJSON.js";
import { YtDlpInfo } from "../../createByChatGPT/ytDlp.js";
import { Picture } from "../../class/sourcePathManager.js";

interface JobData {
  playlist: Playlist;
}

type WorkerReply =
  | { ok: true; data: YtDlpInfo[]; stderr?: string }
  | { ok: false; error: string; stderr?: string; args?: string[]; tried?: string[] };

if (isMainThread) process.exit(0);

(async () => {
  const port = parentPort!;
  const { playlist } = (workerData as JobData) ?? {};

  try {
    const triedClients: string[] = [];
    const clientPriority = [
      "android_music", // 🎵 音質最優先 (Opus率高)
      "web_music",     // 🎧 安定＋Opus対応
      "web",           // 💻 標準クライアント
      "android",       // 📱 軽量
      "ios",           // 🍎 AAC系安定
      "tv_embedded",   // 📺 一部OGG対応 (旧仕様)
    ];

    let success = false;
    let lastError = "";
    let lastArgs: string[] = [];

    for (const client of clientPriority) {
      triedClients.push(client);
      const args = buildArgs(playlist, client);
      const result = await runYtDlp(args);

      if (result.code === 0 && result.stdout.trim()) {
        const data = parseNdjson(result.stdout);
        if (data.length > 0) {
          port.postMessage({ ok: true, data, stderr: result.stderr });
          success = true;
          break;
        }
      }

      lastError = result.stderr || result.stdout || "(no output)";
      lastArgs = args;
    }

    if (!success) {
      const msg = [
        `yt-dlp failed for all clients.`,
        `Last error: ${truncate(lastError, 2000)}`,
        `Last args: ${lastArgs.join(" ")}`,
      ].join("\n");
      port.postMessage({
        ok: false,
        error: msg,
        stderr: lastError,
        args: lastArgs,
        tried: triedClients,
      });
    }
  } catch (e: any) {
    parentPort?.postMessage({
      ok: false,
      error: e?.message ?? String(e),
    } as WorkerReply);
  }
})();

/** yt-dlpの引数を組み立てる */
function buildArgs(playlist: Playlist | Picture, client: string): string[] {
  const { type, body } = playlist;

  const args: string[] = [
    "-j",
    "-q",
    "--no-warnings",
    "--cookies-from-browser",
    "firefox",
    "--extractor-args",
    `youtube:player_client=${client}`,
    "--format",
    "bestaudio/best"
  ];

  switch (type) {
    case "twitterId":
    case "twitterThumbnail":
      args.push(`https://x.com/i/web/status/${body}`);
      break;

    case "videoId":
      args.push(`https://youtu.be/${body}`);
      break;

    case "nicovideoId":
      args.push("--add-header", "Referer:https://www.nicovideo.jp/", `https://www.nicovideo.jp/watch/${body}`);
      break;

    default:
      args.push(String(body));
      break;
  }

  return args;
}

/** spawnでyt-dlpを実行 */
function runYtDlp(args: string[]): Promise<{ stdout: string; stderr: string; code: number | null; signal: NodeJS.Signals | null }> {
  return new Promise((resolve) => {
    const child = spawn("yt-dlp", args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (c) => (out += c));
    child.stderr.on("data", (c) => (err += c));

    child.on("close", (code, signal) => resolve({ stdout: out, stderr: err, code, signal }));
    child.on("error", (e) =>
      resolve({ stdout: out, stderr: err + `\nspawn error: ${String(e)}`, code: 1, signal: null })
    );
  });
}

function parseNdjson(stdout: string): YtDlpInfo[] {
  return stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as YtDlpInfo;
      } catch {
        return null;
      }
    })
    .filter(Boolean) as YtDlpInfo[];
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…(truncated)" : s;
}
