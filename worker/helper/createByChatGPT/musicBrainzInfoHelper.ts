import { Worker } from "worker_threads";
import path from "path";
import url from "url";
import fs from "fs";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

export interface MusicBrainzRelease { id: string; title: string; [k: string]: any }
export interface MusicBrainzRecording { id: string; title: string; [k: string]: any }
export interface MusicBrainzArtist { id: string; name: string; ["sort-name"]: string; [k: string]: any }

type Kind = "artist" | "release" | "recording";

type WorkerResp =
  | { ok: true; data: any; netAt?: number }
  | { ok: false; error: string };

function workerPath() {
  // helper -> ../../createByChatGPT/musicBrainzInfoWorker.js（ビルド後 .js）
  const p = path.join(__dirname, "..", "..", "createByChatGPT", "musicBrainzInfoWorker.ts");
  if (!fs.existsSync(p)) {
    throw new Error(`[musicBrainzInfoHelper] worker not found: ${p}`);
  }
  return p;
}

async function callWorker(kind: Kind, mbid: string, lastNetAt?: number): Promise<{ data: any; netAt?: number }> {
  if (!mbid || typeof mbid !== "string") {
    throw new Error(`[musicBrainzInfoHelper] invalid mbid: ${String(mbid)}`);
  }
  if (kind !== "artist" && kind !== "release" && kind !== "recording") {
    throw new Error(`[musicBrainzInfoHelper] invalid kind: ${String(kind)}`);
  }

  const payload = { kind, mbid, lastNetAt } as const;
  const wp = workerPath();

  const result: WorkerResp = await new Promise((resolve) => {
    const w = new Worker(wp, { workerData: payload });
    w.on("message", (msg) => resolve(msg as WorkerResp));
    w.on("error", (err) => resolve({ ok: false, error: String(err) }));
    w.on("exit", (code) => {
      if (code !== 0) resolve({ ok: false, error: `Worker stopped with code ${code}` });
    });
  });

  if (!result || (result as any).ok !== true) {
    const errMsg = (result && (result as any).error) || "unknown error";
    throw new Error(`[musicBrainzInfoWorker] failed: ${errMsg}`);
  }

  const data = (result as any).data;
  if (data === undefined || data === null) {
    throw new Error(`[musicBrainzInfoWorker] empty payload for kind=${kind} mbid=${mbid}`);
  }
  const netAt = (result as any).netAt as number | undefined;
  return { data, netAt };
}

/** 1秒レート制御付きヘルパークラス */
export class MusicBrainzHelper {
  private _lastNetAt = 0; // ネットワークアクセスの最終時刻（Date.now）

  private _updateNetAt(netAt?: number) {
    if (typeof netAt === "number" && Number.isFinite(netAt) && netAt > this._lastNetAt) {
      this._lastNetAt = netAt;
    }
  }

  async artistInfoGet(mbid: string): Promise<MusicBrainzArtist> {
    const { data, netAt } = await callWorker("artist", mbid, this._lastNetAt);
    this._updateNetAt(netAt);
    return data as MusicBrainzArtist;
  }

  async releaseInfoGet(mbid: string): Promise<MusicBrainzRelease> {
    const { data, netAt } = await callWorker("release", mbid, this._lastNetAt);
    this._updateNetAt(netAt);
    return data as MusicBrainzRelease;
  }

  async recordingInfoGet(mbid: string): Promise<MusicBrainzRecording> {
    const { data, netAt } = await callWorker("recording", mbid, this._lastNetAt);
    this._updateNetAt(netAt);
    return data as MusicBrainzRecording;
  }
}

// 使いやすいようにシングルトン＋関数も提供
export const musicBrainz = new MusicBrainzHelper();

export const artistInfoGet = (mbid: string) => musicBrainz.artistInfoGet(mbid);
export const releaseInfoGet = (mbid: string) => musicBrainz.releaseInfoGet(mbid);
export const recordingInfoGet = (mbid: string) => musicBrainz.recordingInfoGet(mbid);
