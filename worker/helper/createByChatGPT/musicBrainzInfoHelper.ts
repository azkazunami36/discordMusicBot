import { Worker } from "worker_threads";
import path from "path";
import url from "url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

export interface MusicBrainzRelease { id: string; title: string; [k: string]: any }
export interface MusicBrainzRecording { id: string; title: string; [k: string]: any }
export interface MusicBrainzArtist { id: string; name: string; ["sort-name"]: string; [k: string]: any }

type Kind = "artist" | "release" | "recording";

type WorkerResp =
  | { ok: true; data: any }
  | { ok: false; error: string };

function workerPath() {
  // helper -> ../../createByChatGPT/musicBrainzInfoWorker.js（ビルド後 .js）
  return path.join(__dirname, "..", "..", "createByChatGPT", "musicBrainzInfoWorker.js");
}

async function callWorker(kind: Kind, mbid: string): Promise<any> {
  const payload = { kind, mbid };
  const wp = workerPath();
  const result: WorkerResp = await new Promise((resolve) => {
    const w = new Worker(wp, { workerData: payload });
    w.on("message", (msg) => resolve(msg as WorkerResp));
    w.on("error", (err) => resolve({ ok: false, error: String(err) }));
    w.on("exit", (code) => { if (code !== 0) resolve({ ok: false, error: `Worker stopped with code ${code}` }); });
  });
  if (!result.ok) throw new Error(`[musicBrainzInfoWorker] failed: ${result.error || "unknown error"}`);
  return result.data;
}

/** 1秒レート制御付きヘルパークラス */
export class MusicBrainzHelper {
  private _lastDoneAt = 0;

  private async _sleepUntilNext() {
    const now = Date.now();
    const elapsed = now - this._lastDoneAt;
    const waitMs = Math.max(0, 1000 - elapsed);
    if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
    this._lastDoneAt = Date.now();
  }

  async artistInfoGet(mbid: string): Promise<MusicBrainzArtist> {
    await this._sleepUntilNext();
    const data = await callWorker("artist", mbid);
    return data as MusicBrainzArtist;
  }

  async releaseInfoGet(mbid: string): Promise<MusicBrainzRelease> {
    await this._sleepUntilNext();
    const data = await callWorker("release", mbid);
    return data as MusicBrainzRelease;
  }

  async recordingInfoGet(mbid: string): Promise<MusicBrainzRecording> {
    await this._sleepUntilNext();
    const data = await callWorker("recording", mbid);
    return data as MusicBrainzRecording;
  }
}

// 使いやすいようにシングルトン＋関数も提供
export const musicBrainz = new MusicBrainzHelper();

export const artistInfoGet = (mbid: string) => musicBrainz.artistInfoGet(mbid);
export const releaseInfoGet = (mbid: string) => musicBrainz.releaseInfoGet(mbid);
export const recordingInfoGet = (mbid: string) => musicBrainz.recordingInfoGet(mbid);
