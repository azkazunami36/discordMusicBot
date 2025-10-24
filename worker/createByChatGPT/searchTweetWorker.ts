// ./worker/createByChatGPT/searchTweetWorker.ts
import { parentPort, workerData } from "worker_threads";
import { TwitterApi } from "twitter-api-v2";

const LOG_PREFIX = "[searchTweetWorker]";
// ---- FixTweet (FxTwitter) fallback helpers ----
// Minimal shape of FixTweet response we use
type FxStatus = {
  code: number;
  message?: string;
  tweet?: {
    id: string;
    text: string;
    created_at?: string;
    created_timestamp?: number;
    author?: { id?: string; name: string; screen_name: string; avatar_url?: string };
    media?: {
      photos?: Array<{ url: string }>;
      videos?: Array<{ url: string; thumbnail_url?: string; format?: string }>;
      gifs?:   Array<{ url: string; thumbnail_url?: string; format?: string }>;
    };
    likes?: number; retweets?: number; replies?: number; views?: number|null;
  };
};

async function fetchFixTweetStatus(id: string): Promise<FxStatus | undefined> {
  const url = `https://api.fxtwitter.com/status/${id}`;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'discordMusicBot/1.0 (+fix-fallback)' } });
    if (!r.ok) {
      console.log(`${LOG_PREFIX} fx: http ${r.status}`);
      return undefined;
    }
    const fx = (await r.json()) as FxStatus;
    if (fx?.code !== 200 || !fx?.tweet) {
      console.log(`${LOG_PREFIX} fx: bad payload code=${fx?.code}`);
      return undefined;
    }
    return fx;
  } catch (e: any) {
    console.log(`${LOG_PREFIX} fx: fetch error ${e?.message || e}`);
    return undefined;
  }
}

function fxToXPostInfo(fx: FxStatus): XPostInfo | undefined {
  const t = fx.tweet;
  if (!t) return undefined;
  const photos = t.media?.photos ?? [];
  const videos = t.media?.videos ?? [];
  const gifs   = t.media?.gifs   ?? [];
  const media = [
    ...photos.map(p => ({
      media_key: '',
      type: 'photo' as const,
      url: p.url,
    })),
    ...videos.map(v => ({
      media_key: '',
      type: 'video' as const,
      url: v.url,
      preview_image_url: v.thumbnail_url,
      variants: v.url ? [{ content_type: v.format ?? 'video/mp4', url: v.url }] : undefined,
    })),
    ...gifs.map(g => ({
      media_key: '',
      type: 'animated_gif' as const,
      url: g.url,
      preview_image_url: g.thumbnail_url,
      variants: g.url ? [{ content_type: g.format ?? 'video/mp4', url: g.url }] : undefined,
    })),
  ];
  const created_at = t.created_at ?? (t.created_timestamp ? new Date(t.created_timestamp * 1000).toISOString() : undefined);
  const info: XPostInfo = {
    id: t.id,
    text: t.text,
    created_at,
    author: t.author ? {
      id: t.author.id ?? '',
      name: t.author.name,
      username: t.author.screen_name,
      profile_image_url: t.author.avatar_url,
      verified: undefined,
    } : undefined,
    media: media.length ? media : undefined,
    public_metrics: {
      like_count: t.likes,
      retweet_count: t.retweets,
      reply_count: t.replies,
      view_count: t.views ?? undefined,
    },
    raw: fx,
  };
  return info;
}

function assertVideoIfNeeded(info: XPostInfo | undefined, mustContainVideo: boolean): boolean {
  if (!mustContainVideo) return true;
  if (!info) return false;
  const hasVideo = Array.isArray(info.media) && info.media.some(m => m?.type === 'video');
  return hasVideo;
}
// ---- end FixTweet helpers ----
function redact(v?: string | null) {
  if (!v) return v;
  const s = String(v);
  if (s.length <= 8) return "***";
  return s.slice(0, 4) + "…" + s.slice(-4);
}

interface XPostInfo {
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
    view_count?: number;
  };
  raw: any;
}

/** 入力: { input: string; videoOnly?: boolean }
 *  - input が数値ID or URLでIDが含まれる場合 → singleTweet
 *  - それ以外 → recent search（lang:ja、videoOnlyなら has:videos）
 *  キャッシュなし。エラーはここでは握りつぶさず throw してヘルパーで例外化。
 */
async function searchTweet(input: string, videoOnly = false): Promise<XPostInfo | undefined> {
  console.log(`${LOG_PREFIX} start: input=${input} videoOnly=${videoOnly}`);
  console.log(`${LOG_PREFIX} env: X_API_KEY=${redact(process.env.X_API_KEY)} X_API_KEY_SECRET=${redact(process.env.X_API_KEY_SECRET)} X_TOKEN=${redact(process.env.X_TOKEN)} X_TOKEN_SECRET=${redact(process.env.X_TOKEN_SECRET)}`);

  const client = new TwitterApi({
    appKey: process.env.X_API_KEY!,
    appSecret: process.env.X_API_KEY_SECRET!,
    accessToken: process.env.X_TOKEN!,
    accessSecret: process.env.X_TOKEN_SECRET!,
  });
  console.log(`${LOG_PREFIX} client: created twitter-api-v2 instance (keys present=${!!process.env.X_API_KEY && !!process.env.X_API_KEY_SECRET} tokens present=${!!process.env.X_TOKEN && !!process.env.X_TOKEN_SECRET})`);

  console.log(`${LOG_PREFIX} config: preparing v2 fields`);
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
  console.log(`${LOG_PREFIX} helper: buildInfo ready`);

  console.log(`${LOG_PREFIX} parse: try extract numeric id from input`);
  // 入力からIDを“ローカル”に抽出（ネットワークなし）
  const id = (() => {
    const s = String(input ?? "").trim();
    if (/^\d{6,}$/.test(s)) return s;
    try {
      const u = new URL(s);
      const host = u.hostname.toLowerCase();
      const isTwitter = /(^|\.)x\.com$/.test(host) || /(^|\.)twitter\.com$/.test(host);
      if (!isTwitter) return undefined;
      const segs = u.pathname.split("/").filter(Boolean);
      for (let i = 0; i < segs.length - 1; i++) {
        if ((segs[i] === "status" || segs[i] === "statuses") && /^\d{6,}$/.test(segs[i + 1])) return segs[i + 1];
      }
      const numeric = segs.find((p) => /^\d{6,}$/.test(p));
      return numeric;
    } catch {
      return undefined;
    }
  })();
  console.log(`${LOG_PREFIX} parse: extracted id=${id ?? "(none)"}`);

  if (id) {
    console.log(`${LOG_PREFIX} call: v2.singleTweet id=${id}`);
    try {
      const res = await client.v2.singleTweet(id, fields as any);
      // twitter-api-v2 returns data/includes; log quick summary
      console.log(`${LOG_PREFIX} resp: singleTweet ok data=${!!res?.data} includes(media=${res?.includes?.media?.length ?? 0}, users=${res?.includes?.users?.length ?? 0})`);
      const info = buildInfo(res.data, res.includes);
      const mediaCount = info.media?.length ?? 0;
      console.log(`${LOG_PREFIX} info: built XPostInfo id=${info.id} media=${mediaCount}`);
      if (videoOnly) {
        const hasVideo = (info.media ?? []).some(m => m.type === "video");
        console.log(`${LOG_PREFIX} filter: videoOnly=${videoOnly} hasVideo=${hasVideo}`);
        if (!hasVideo) return undefined;
      }
      return info;
    } catch (e: any) {
      const status = e?.code || e?.status || e?.data?.title || 'unknown';
      const brief = (() => {
        try {
          const j = e?.data ? JSON.stringify(e.data) : (e?.message || String(e));
          return (j || '').slice(0, 800);
        } catch { return String(e?.message || e); }
      })();
      const rl = e?.rateLimit ? ` limit=${e.rateLimit.limit} remaining=${e.rateLimit.remaining} reset=${e.rateLimit.reset}` : '';
      console.log(`${LOG_PREFIX} error: singleTweet threw status=${status}${rl} body(<=800)=${brief}`);
      if (e?.headers) {
        try { console.log(`${LOG_PREFIX} error: headers=`, e.headers); } catch {}
      }
      // --- FixTweet fallback when v2.singleTweet fails (e.g., 429) ---
      const fx = await fetchFixTweetStatus(id);
      if (fx) {
        const info = fxToXPostInfo(fx);
        if (assertVideoIfNeeded(info, !!videoOnly)) {
          console.log(`${LOG_PREFIX} fx: fallback success id=${id} media=${info?.media?.length ?? 0}`);
          return info;
        } else {
          console.log(`${LOG_PREFIX} fx: fallback rejected (mustContainVideo but none)`);
        }
      } else {
        console.log(`${LOG_PREFIX} fx: fallback unavailable`);
      }
      // --- end FixTweet fallback ---
      // Rethrow with structured properties so caller can distinguish rate limit vs recognize failure
      const err = new Error(e?.message || 'singleTweet failed');
      (err as any).status = e?.code || e?.status;
      (err as any).headers = e?.headers;
      (err as any).rateLimit = e?.rateLimit;
      (err as any).tweetId = id;
      throw err;
    }
  }

  console.log(`${LOG_PREFIX} call: v2.search build query (videoOnly=${videoOnly})`);
  const query = videoOnly ? `${input} has:videos lang:ja` : `${input} lang:ja`;
  console.log(`${LOG_PREFIX} query: ${query}`);

  let search: any;
  try {
    search = await client.v2.search(query, { ...fields, max_results: 10 } as any);
    console.log(`${LOG_PREFIX} resp: search initial ok type=${Array.isArray((search as any).data) ? 'page' : 'paginator'}`);
  } catch (e: any) {
    const status = e?.code || e?.status || e?.data?.title || 'unknown';
    const brief = (() => {
      try {
        const j = e?.data ? JSON.stringify(e.data) : (e?.message || String(e));
        return (j || '').slice(0, 800);
      } catch { return String(e?.message || e); }
    })();
    const rl = e?.rateLimit ? ` limit=${e.rateLimit.limit} remaining=${e.rateLimit.remaining} reset=${e.rateLimit.reset}` : '';
    console.log(`${LOG_PREFIX} error: search threw status=${status}${rl} body(<=800)=${brief}`);
    if (e?.headers) { try { console.log(`${LOG_PREFIX} error: headers=`, e.headers); } catch {} }
    throw e;
  }

  let data: any;
  try {
    data = Array.isArray((search as any).data) ? (search as any) : (await (search as any).fetchNext());
    console.log(`${LOG_PREFIX} resp: search page resolved tweets=${(data?.data ?? []).length} media=${data?.includes?.media?.length ?? 0} users=${data?.includes?.users?.length ?? 0}`);
  } catch (e: any) {
    const status = e?.code || e?.status || e?.data?.title || 'unknown';
    const brief = (() => {
      try {
        const j = e?.data ? JSON.stringify(e.data) : (e?.message || String(e));
        return (j || '').slice(0, 800);
      } catch { return String(e?.message || e); }
    })();
    const rl = e?.rateLimit ? ` limit=${e.rateLimit.limit} remaining=${e.rateLimit.remaining} reset=${e.rateLimit.reset}` : '';
    console.log(`${LOG_PREFIX} error: fetchNext threw status=${status}${rl} body(<=800)=${brief}`);
    if (e?.headers) { try { console.log(`${LOG_PREFIX} error: headers=`, e.headers); } catch {} }
    throw e;
  }

  const tweets = (data.data ?? []) as any[];
  const includes = data.includes ?? (search as any).includes ?? {};
  console.log(`${LOG_PREFIX} select: tweets=${tweets.length}`);

  console.log(`${LOG_PREFIX} select: iterate tweets and match videoOnly=${videoOnly}`);
  let picked: any | undefined;
  for (const t of tweets) {
    const mediaKeys: string[] = t.attachments?.media_keys ?? [];
    const media = (includes.media ?? []).filter((m: any) => mediaKeys.includes(m.media_key));
    const hasVideo = media.some((m: any) => m.type === "video");
    console.log(`${LOG_PREFIX} select: candidate id=${t?.id} media=${media.length} hasVideo=${hasVideo}`);
    if (!videoOnly || hasVideo) { picked = t; break; }
  }
  console.log(`${LOG_PREFIX} select: picked=${picked ? picked.id : '(none)'}`);
  if (!picked) return undefined;
  const built = buildInfo(picked, includes);
  console.log(`${LOG_PREFIX} info: built from search id=${built.id} media=${built.media?.length ?? 0}`);
  return built;
}

(async () => {
  try {
    console.log(`${LOG_PREFIX} boot: workerData=`, workerData);
    const { input, videoOnly } = workerData as { input: string; videoOnly?: boolean };
    const data = await searchTweet(input, !!videoOnly);
    console.log(`${LOG_PREFIX} done: ok data=${data ? 'present' : 'undefined'}`);
    parentPort?.postMessage({ ok: true, data });
  } catch (err: any) {
    const status = err?.status ?? err?.code ?? undefined;
    const rateLimit = err?.rateLimit ?? undefined;
    const reset = rateLimit?.reset ?? err?.headers?.['x-rate-limit-reset'] ?? undefined;
    const tweetId = err?.tweetId ?? undefined;
    console.error(`${LOG_PREFIX} fatal:`, err?.message ?? err);
    parentPort?.postMessage({
      ok: false,
      error: String(err?.message ?? err),
      status,
      rateLimit,
      reset,
      tweetId,
    });
  }
})();
