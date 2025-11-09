import { parentPort, workerData } from "worker_threads";

/**
 * 入力: { url: string }
 * 出力: { ok: true, data: string[] | undefined } | { ok: false, error: string }
 *
 * 仕様:
 * - 解析ロジックはすべて worker 内に実装
 * - キャッシュは使用しない
 * - 無効な文字列が渡されても「[AppleMusic] URL parse failed」は出さない
 */

type Payload = { url: string };

async function parseAppleMusicUrl(url: string): Promise<string[] | undefined> {
  const DEBUG = true; // 必要に応じて false に
  const buildSongUrl = (country: string, trackId: string) =>
    `https://music.apple.com/${country}/song/${trackId}`;

  // HTMLから曲IDをできるだけ多く抽出
  const extractSongIdsFromHtml = (html: string, label: string): string[] => {
    const ids = new Set<string>();
    for (const m of html.matchAll(/\/(?:[a-z]{2}\/)?song\/(?:[^\/]+\/)?(\d{6,})/gi)) ids.add(m[1]);
    for (const m of html.matchAll(/href\s*=\s*['"]\/(?:[a-z]{2}\/)?song\/(?:[^\/]+\/)?(\d{6,})['"]/gi)) ids.add(m[1]);
    for (const m of html.matchAll(/"trackId"\s*:\s*(\d{6,})/gi)) ids.add(m[1]);
    for (const m of html.matchAll(/\{[^{}]*?"type"\s*:\s*"songs"[^{}]*?"id"\s*:\s*"(\d{6,})"[^{}]*?\}/gi)) ids.add(m[1]);
    for (const m of html.matchAll(/"songCatalogId"\s*:\s*"?(\d{6,})"?/gi)) ids.add(m[1]);
    for (const m of html.matchAll(/"catalogId"\s*:\s*"?(\d{6,})"?/gi)) ids.add(m[1]);
    for (const m of html.matchAll(/content\s*=\s*['"]https?:\/\/music\.apple\.com\/(?:[a-z]{2}\/)?song\/(?:[^\/]+\/)?(\d{6,})['"]/gi)) ids.add(m[1]);
    for (const m of html.matchAll(/"url"\s*:\s*"https?:\\\/\\\/music\.apple\.com\\\/(?:[a-z]{2}\\\/)?song\\\/(?:[^\\\/]+\\\/)?(\d{6,})"/gi)) ids.add(m[1]);
    if (DEBUG) console.log(`[AppleMusic][extract:${label}] ids=`, ids.size);
    return Array.from(ids);
  };

  const toEmbedFromOEmbed = async (pageUrl: string, fallbackEmbedUrl: string): Promise<string> => {
    try {
      const o = await fetch(`https://music.apple.com/oembed?url=${encodeURIComponent(pageUrl)}`).catch(() => undefined);
      const js = o && o.ok ? await o.json().catch(() => undefined) : undefined;
      const iframeUrl: string | undefined = js?.iframe_url || js?.html?.match(/src=\"([^\"]+)\"/)?.[1];
      if (iframeUrl) return iframeUrl;
    } catch { /* ignore */ }
    return fallbackEmbedUrl;
  };

  const safeFetchText = async (pageUrl: string, label: string): Promise<string | undefined> => {
    try {
      const res = await fetch(pageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36',
          'Accept-Language': 'ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Referer': 'https://music.apple.com/',
          'Origin': 'https://music.apple.com',
        } as any,
        redirect: 'follow' as any,
      }).catch(() => undefined);
      if (!res || !res.ok) return undefined;
      const text = await res.text();
      if (DEBUG) console.log(`[AppleMusic][fetch:${label}] status=`, res.status, 'len=', text.length);
      return text;
    } catch {
      return undefined;
    }
  };

  try {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      // 無効入力時は黙って undefined（ログ出力しない）
      return undefined;
    }
    if (!/music\.apple\.com$/i.test(u.hostname)) return undefined;

    const segs = u.pathname.split('/').filter(Boolean);
    const country = (segs[0] || 'us').toLowerCase();

    // --- song ---
    const mSong = u.pathname.match(/\/(?:[a-z]{2}\/)?song\/(\d{6,})/i);
    if (mSong) return [buildSongUrl(country, mSong[1])];

    // --- album 内の ?i=trackId ---
    const paramI = u.searchParams.get('i');
    if (paramI && /^\d{6,}$/.test(paramI)) return [buildSongUrl(country, paramI)];

    // --- album: iTunes Lookup で展開 ---
    const mAlbum = u.pathname.match(/\/(?:[a-z]{2}\/)?album\/(?:[^/]+\/)?(\d{6,})/i);
    if (mAlbum) {
      const albumId = mAlbum[1];
      try {
        const lookup = await fetch(`https://itunes.apple.com/lookup?id=${albumId}&entity=song&country=${country}`).catch(() => undefined);
        if (!lookup || !lookup.ok) return undefined;
        const data: any = await lookup.json().catch(() => undefined);
        const tracks: string[] = Array.isArray(data?.results)
          ? data.results.filter((r: any) => r.wrapperType === 'track' && r.trackId).map((r: any) => buildSongUrl(country, String(r.trackId)))
          : [];
        return tracks.length ? tracks : undefined;
      } catch {
        return undefined;
      }
    }

    // --- playlist ---
    if (/\/(?:[a-z]{2}\/)?playlist\//i.test(u.pathname)) {
      const plId = [...segs].reverse().find(s => /^pl\./i.test(s));
      if (!plId) return undefined;

      let ids: string[] = [];
      const pageHtml = await safeFetchText(u.toString(), 'page');
      if (pageHtml) ids = extractSongIdsFromHtml(pageHtml, 'page');

      let embedHtml: string | undefined;
      if (ids.length === 0) {
        const embedPath = `/${country}/playlist/${plId}`;
        const embedUrl = `https://embed.music.apple.com${embedPath}${u.search}`;
        const oembed = await toEmbedFromOEmbed(`https://music.apple.com${embedPath}${u.search}`, embedUrl);
        embedHtml = await safeFetchText(oembed, 'embed');
        if (embedHtml) ids = extractSongIdsFromHtml(embedHtml, 'embed');
      }

      let widgetsHtml: string | undefined;
      if (ids.length === 0) {
        const widgetsUrl = `https://embed.music.apple.com/${country}/playlist/${plId}${u.search}`;
        widgetsHtml = await safeFetchText(widgetsUrl, 'widgets');
        if (widgetsHtml) ids = extractSongIdsFromHtml(widgetsHtml, 'widgets');
      }

      // AMP API（HTMLに developerToken があれば使用）
      if (ids.length === 0) {
        const sources: Array<[string, string | undefined]> = [
          ['page', pageHtml],
          ['embed', typeof embedHtml !== 'undefined' ? embedHtml : undefined],
          ['widgets', typeof widgetsHtml !== 'undefined' ? widgetsHtml : undefined],
        ];

        let devToken: string | undefined;
        for (const [lab, src] of sources) {
          if (!src) continue;
          let m = src.match(/developerToken"?\s*:\s*"([^"]+)"/i) || src.match(/MusicKit\.configure\(\{[^}]*developerToken\s*:\s*"([^"]+)"/i);
          if (!m) m = src.match(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/);
          if (m) { devToken = m[1] || m[0]; if (DEBUG) console.log(`[AppleMusic][devToken:${lab}] found`); break; }
        }
        if (devToken) {
          try {
            const ampUrl = `https://amp-api.music.apple.com/v1/catalog/${country}/playlists/${plId}?include=tracks&limit=100`;
            const res = await fetch(ampUrl, {
              headers: {
                'Authorization': `Bearer ${devToken}`,
                'Origin': 'https://music.apple.com',
                'Referer': `https://music.apple.com/${country}/playlist/${plId}`,
                'Accept': 'application/json',
              } as any
            }).catch(() => undefined);
            if (res && res.ok) {
              const json: any = await res.json().catch(() => undefined);
              const got = new Set<string>();
              const relData = json?.data?.[0]?.relationships?.tracks?.data;
              if (Array.isArray(relData)) {
                for (const it of relData) {
                  const id = String(it?.id || '');
                  if (/^\d{6,}$/.test(id)) got.add(id);
                  const cid = String(it?.attributes?.playParams?.catalogId || '');
                  if (/^\d{6,}$/.test(cid)) got.add(cid);
                }
              }
              const included = json?.included;
              if (Array.isArray(included)) {
                for (const it of included) {
                  if (it?.type === 'songs') {
                    const id = String(it?.id || '');
                    if (/^\d{6,}$/.test(id)) got.add(id);
                    const cid = String(it?.attributes?.playParams?.catalogId || '');
                    if (/^\d{6,}$/.test(cid)) got.add(cid);
                  }
                }
              }
              if (got.size > 0) ids = Array.from(got);
            }
          } catch { /* ignore */ }
        }

        // 環境変数トークンでの直接 AMP API 呼び出し（保険）
        if (ids.length === 0) {
          const envDevToken = process.env.APPLE_MUSIC_DEVELOPER_TOKEN || process.env.APPLE_DEVELOPER_TOKEN || process.env.APPLEMUSIC_DEVELOPER_TOKEN;
          const envUserToken = process.env.APPLE_MUSIC_USER_TOKEN || process.env.MUSIC_USER_TOKEN || process.env.APPLEMUSIC_USER_TOKEN;
          if (envDevToken) {
            try {
              const collected = new Set<string>();
              let nextUrl: string | undefined = `https://amp-api.music.apple.com/v1/catalog/${country}/playlists/${plId}?include=tracks&limit=100`;
              const headers: Record<string, string> = {
                'Authorization': `Bearer ${envDevToken}`,
                'Origin': 'https://music.apple.com',
                'Referer': `https://music.apple.com/${country}/playlist/${plId}`,
                'Accept': 'application/json',
              };
              if (envUserToken) headers['Music-User-Token'] = envUserToken;
              while (nextUrl) {
                const res = await fetch(nextUrl, { headers: headers as any }).catch(() => undefined);
                if (!res || !res.ok) break;
                const json: any = await res.json().catch(() => undefined);
                if (!json) break;
                const rel = json?.data?.[0]?.relationships?.tracks;
                const relData2 = rel?.data;
                if (Array.isArray(relData2)) {
                  for (const it of relData2) {
                    const id = String(it?.id || '');
                    if (/^\d{6,}$/.test(id)) collected.add(id);
                    const cid = String(it?.attributes?.playParams?.catalogId || '');
                    if (/^\d{6,}$/.test(cid)) collected.add(cid);
                  }
                }
                const included2 = json?.included;
                if (Array.isArray(included2)) {
                  for (const it of included2) {
                    if (it?.type === 'songs') {
                      const id = String(it?.id || '');
                      if (/^\d{6,}$/.test(id)) collected.add(id);
                      const cid = String(it?.attributes?.playParams?.catalogId || '');
                      if (/^\d{6,}$/.test(cid)) collected.add(cid);
                    }
                  }
                }
                const nextHref = rel?.next;
                nextUrl = typeof nextHref === 'string' && nextHref.startsWith('https')
                  ? nextHref
                  : (typeof nextHref === 'string' && nextHref.startsWith('/v1/')
                      ? `https://amp-api.music.apple.com${nextHref}`
                      : undefined);
              }
              if (collected.size > 0) ids = Array.from(collected);
            } catch { /* ignore */ }
          }
        }
      }

      return ids.length ? ids.map(id => buildSongUrl(country, id)) : undefined;
    }

    // --- 後方互換: テキストURLからの素朴抽出 ---
    const mParam = url.match(/[?&]i=(\d{6,})/);
    if (mParam) return [`https://music.apple.com/${country}/song/${mParam[1]}`];
    const mSong2 = url.match(/music\.apple\.com\/[a-z]{2}\/song\/(\d{6,})/i);
    if (mSong2) return [`https://music.apple.com/${country}/song/${mSong2[1]}`];

    return undefined;
  } catch {
    // 例外時も黙って undefined を返す
    return undefined;
  }
}

// 起動即実行して結果を返す
(async () => {
  try {
    const payload = workerData as Payload;
    const out = await parseAppleMusicUrl(payload.url);
    parentPort?.postMessage({ ok: true, data: out });
  } catch (e) {
    parentPort?.postMessage({ ok: false, error: String(e) });
  }
})();
