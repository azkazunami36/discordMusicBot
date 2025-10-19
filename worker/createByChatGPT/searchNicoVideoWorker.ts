import { parentPort, workerData } from "worker_threads";

/**
 * 入力:  string (query)
 * 出力:  { ok: true, data: any[] } | { ok: false, error: string }
 *
 * 備考:
 * - ニコニコ動画 Snapshot API を使用
 *   https://api.search.nicovideo.jp/api/v2/video/contents/search
 * - 返却は items 配列のみ（呼び出し側で必要に応じて型付けしてください）
 * - キャッシュなし
 */

type Payload = string; // raw query string
interface NicoSnapshotItem {
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
type ApiResp = {
  meta: { status: number; totalCount: number; id?: string; errorCode?: string; errorMessage?: string };
  data?: any[];
};

const SNAPSHOT_API = "https://api.search.nicovideo.jp/api/v2/video/contents/search";

const DEFAULT_FIELDS = [
  "contentId",
  "title",
  "description",
  "viewCounter",
  "mylistCounter",
  "lengthSeconds",
  "thumbnailUrl",
  "startTime",
  "commentCounter",
  "channelId",
  "userId",
  "tags",
  "categoryTags",
  "lastCommentTime"
];

async function searchNicoVideo(payload: Payload): Promise<any[]> {
  const q = (payload ?? "").trim();
  if (!q) {
    return [];
  }

  // internal defaults (helper no longer passes options)
  const offset = 0;
  const limit = 50; // clamp inside API if needed
  const sort = "-viewCounter";
  const targets = "title,tags,description";
  const fields = DEFAULT_FIELDS;

  // API仕様準拠のクエリ形成
  const params = new URLSearchParams();
  params.set("q", q);
  params.set("targets", targets);
  params.set("fields", fields.join(","));
  params.set("_sort", sort);
  params.set("_offset", String(offset));
  params.set("_limit", String(limit));
  params.set("_context", "discordMusicBot");

  // 失敗時は空レスポンスで返す（worker 側では例外を投げず、ok: true で空配列を返す方針も可）
  try {
    const res = await fetch(`${SNAPSHOT_API}?${params.toString()}`, {
      method: "GET",
      headers: {
        "User-Agent": "discordMusicBot/1.0 (+https://github.com/)", // 形だけの UA
        "Accept": "application/json"
      } as any
    }).catch(() => undefined);

    if (!res || !res.ok) {
      return [];
    }

    const json = (await res.json().catch(() => undefined)) as ApiResp | undefined;
    const status = json?.meta?.status ?? 0;
    if (status !== 200) {
      return [];
    }

    const items = Array.isArray(json?.data) ? json!.data : [];
    return items;
  } catch {
    return [];
  }
}

(async () => {
  try {
    const payload = (typeof workerData === "string" ? workerData : "") as Payload;
    const data = await searchNicoVideo(payload);
    parentPort?.postMessage({ ok: true, data });
  } catch (e) {
    parentPort?.postMessage({ ok: false, error: String(e) });
  }
})();
