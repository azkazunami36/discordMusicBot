import { TwitterApi } from "twitter-api-v2";

export interface XPostInfo {
  id: string;
  text?: string;
  created_at?: string;
  author?: {
    id: string;
    name: string;
    username: string;
    profile_image_url?: string;
    verified?: boolean;
  };
  media?: Array<{
    media_key: string;
    type: "photo" | "video" | "animated_gif";
    url?: string;
    preview_image_url?: string;
    duration_ms?: number;
    variants?: Array<{
      bitrate?: number;
      content_type: string;
      url: string;
    }>;
  }>;
  public_metrics?: {
    like_count?: number;
    retweet_count?: number;
    reply_count?: number;
    quote_count?: number;
    bookmark_count?: number;
    view_count?: number; // 一部レベルでのみ返る
  };
  raw: any; // フルレスポンスをそのまま保持（将来の拡張用）
}

/**
 * 文字列から tweet_id を抽出し、x.com に対して fetch を投げて有効性を軽く検証します。
 * 成功したら tweet_id（string）、失敗したら undefined を返します。
 *
 * - 対応ホスト: x.com / twitter.com（www/mobile 含む）
 * - パス: /i/web/status/{id}, /{user}/status{es}/{id}
 * - 生ID（18～20桁程度の数字）だけでもOK
 * - 検証は API 不使用（HTTPステータスで 200/3xx を有効とみなす）
 */
export async function parseTweetId(input: string): Promise<string | undefined> {
  const s = input.trim();

  // 1) 生IDだけのケース
  if (/^\d{8,20}$/.test(s)) {
    const ok = await pingId(s);
    return ok ? s : undefined;
  }

  // 2) URLとして解釈できるか試す
  let u: URL | undefined;
  try {
    u = new URL(s);
  } catch {
    // テキスト内にURLが埋もれている場合の緩め抽出（最初のURLだけ拾う）
    const m = /(https?:\/\/[^\s]+)/.exec(s);
    if (m) {
      try { u = new URL(m[1]); } catch { /* noop */ }
    }
  }
  if (!u) return undefined;

  const host = u.hostname.toLowerCase();
  if (!/(^|\.)x\.com$/.test(host) && !/(^|\.)twitter\.com$/.test(host)) return undefined;

  // パスを分解してID候補を拾う
  const segs = u.pathname.split("/").filter(Boolean);

  // 代表パターン: /i/web/status/{id}
  for (let i = 0; i < segs.length - 1; i++) {
    if ((segs[i] === "status" || segs[i] === "statuses") && /^\d{8,20}$/.test(segs[i + 1])) {
      const id = segs[i + 1];
      const ok = await pingId(id);
      return ok ? id : undefined;
    }
  }

  // 念のため、数値だけのセグメントをスキャン
  const numeric = segs.find((p) => /^\d{8,20}$/.test(p));
  if (numeric) {
    const ok = await pingId(numeric);
    return ok ? numeric : undefined;
  }

  return undefined;

  // 内部: x.com/i/web/status/{id} をたたいて有効性をざっくり確認
  async function pingId(id: string): Promise<boolean> {
    try {
      const res = await fetch(`https://x.com/i/web/status/${id}`, {
        // ログインページ等に飛ぶこともあるので manual にして 3xx も有効扱い
        redirect: "manual",
        // UA を付けないと一部CDNで弾かれるケースがあるため付与
        headers: { "user-agent": "Mozilla/5.0 (compatible; Bot/1.0)" },
      });
      // 200（直接到達）または 3xx（元ツイートへリダイレクト想定）を有効扱い
      if (res.status >= 200 && res.status < 400) return true;
      // 一部エッジケースで200でも汎用エラーページの可能性はあるが、API不使用の範囲ではここまで
      return false;
    } catch {
      return false;
    }
  }
}

/**
 * 任意の文字列からツイートを1件取得（URL/IDなら直接、その他は検索）。
 * videoOnly=true の場合、動画(動画のみ、animated_gifは含まない)を含まないものは undefined を返す。
 * 検索では日本語優先（lang:ja）で絞り込みます。
 * API コール数は最大1回（URL/ID直指定時）または2回以内（厳密チェック時は1回）。
 */
export async function searchTweet(input: string, videoOnly = false): Promise<XPostInfo | undefined> {
  const client = new TwitterApi({
    appKey: process.env.X_API_KEY!,
    appSecret: process.env.X_API_KEY_SECRET!,
    accessToken: process.env.X_TOKEN!,
    accessSecret: process.env.X_TOKEN_SECRET!,
  });

  const fields = {
    expansions: [
      "author_id",
      "attachments.media_keys",
      "referenced_tweets.id",
      "referenced_tweets.id.author_id",
    ] as const,
    "tweet.fields": [
      "created_at",
      "public_metrics",
      "possibly_sensitive",
      "lang",
      "in_reply_to_user_id",
      "conversation_id",
      "attachments",
      "referenced_tweets",
      "entities",
    ] as const,
    "user.fields": [
      "name",
      "username",
      "profile_image_url",
      "verified",
      "protected",
      "id",
    ] as const,
    "media.fields": [
      "media_key",
      "type",
      "url",
      "preview_image_url",
      "variants",
      "duration_ms",
      "width",
      "height",
      "public_metrics",
      "alt_text",
    ] as const,
  } as const;

  // helper: build XPostInfo from a tweet + includes
  function buildInfo(t: any, inc: any): XPostInfo {
    const author = inc?.users?.find((u: any) => u.id === t.author_id);
    const mediaKeys: string[] = t.attachments?.media_keys ?? [];
    const media = (inc?.media ?? []).filter((m: any) => mediaKeys.includes(m.media_key));
    return {
      id: t.id,
      text: t.text,
      created_at: t.created_at,
      author: author && {
        id: author.id,
        name: author.name,
        username: author.username,
        profile_image_url: author.profile_image_url,
        verified: (author as any).verified ?? undefined,
      },
      media: media.map((m: any) => ({
        media_key: m.media_key,
        type: m.type,
        url: m.url,
        preview_image_url: m.preview_image_url,
        duration_ms: m.duration_ms,
        variants: m.variants,
      })),
      public_metrics: t.public_metrics,
      raw: { data: t, includes: inc },
    };
  }

  const id = await parseTweetId(input);

  // Case 1: ID 直指定 → 1 API call
  if (id) {
    const res = await client.v2.singleTweet(id, fields as any);
    const info = buildInfo(res.data, res.includes);
    if (videoOnly) {
      const hasVideo = (info.media ?? []).some(m => m.type === "video");
      if (!hasVideo) return undefined;
    }
    return info;
  }

  // Case 2: 検索（recent）→ 1 API call
  const query = videoOnly ? `${input} has:videos lang:ja` : `${input} lang:ja`;
  const search = await client.v2.search(query, {
    ...fields,
    max_results: 10,
  } as any);

  // 返却は API の単発レスポンス or 最初のページ
  const data = Array.isArray((search as any).data)
    ? (search as any)
    : (await (search as any).fetchNext());

  // tweets と includes を正規化
  const tweets = (data.data ?? []) as any[];
  const includes = data.includes ?? (search as any).includes ?? {};

  // videoOnly の場合は動画付きのみ採用
  let picked: any | undefined;
  for (const t of tweets) {
    const mediaKeys: string[] = t.attachments?.media_keys ?? [];
    const media = (includes.media ?? []).filter((m: any) => mediaKeys.includes(m.media_key));
    const hasVideo = media.some((m: any) => m.type === "video");
    if (!videoOnly || hasVideo) { picked = t; break; }
  }

  if (!picked) return undefined;

  return buildInfo(picked, includes);
}
