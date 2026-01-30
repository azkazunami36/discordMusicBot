import { parentPort, workerData } from "worker_threads";

/**
 * 入力: { url: string }
 * 出力: { ok: true, data: string[] | undefined } | { ok: false, error: string }
 */

type Payload = { url: string };

// そのまま add.ts にあった実装を移植（必要最小限の微調整のみ）
async function parseSpotifyUrl(url: string): Promise<string[] | undefined> {
    const SPOTIFY_DEBUG = true; // コンソールに詳細ログを出す

    const getSpotifyEmbedToken = async (contextPageUrl?: string): Promise<string | undefined> => {
        const now = Date.now();
        try {
            const anyCache: any = (globalThis as any)._SPOTIFY_EMBED_TOKEN_CACHE;
            if (anyCache && typeof anyCache.token === 'string' && typeof anyCache.expMs === 'number') {
                if (anyCache.expMs - 60_000 > now) {
                    if (SPOTIFY_DEBUG) console.log('[Spotify][token] use cache; ttl(ms)=', anyCache.expMs - now);
                    return anyCache.token;
                }
            }
        } catch {}

        try {
            const envTok = process.env.SPOTIFY_EMBED_TOKEN || process.env.SPOTIFY_ACCESS_TOKEN || process.env.SPOTIFY_ANON_TOKEN;
            const envExp = Number(process.env.SPOTIFY_EMBED_TOKEN_EXP_MS || process.env.SPOTIFY_ACCESS_TOKEN_EXP_MS || 0);
            if (envTok) {
                const expMs = envExp > now + 60_000 ? envExp : now + 50 * 60 * 1000;
                (globalThis as any)._SPOTIFY_EMBED_TOKEN_CACHE = { token: envTok, expMs };
                if (SPOTIFY_DEBUG) console.log('[Spotify][token] use ENV token; ttl(ms)=', expMs - now);
                return envTok;
            }
        } catch {}

        const headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7',
            'Referer': 'https://open.spotify.com/',
            'Origin': 'https://open.spotify.com'
        } as any;

        const candidates: Array<{ url: string; note: string }> = [
            { url: 'https://open.spotify.com/get_access_token?reason=transport&productType=embed', note: 'get_access_token embed' },
            { url: 'https://open.spotify.com/get_access_token?reason=transport&productType=web_player', note: 'get_access_token web_player' },
            { url: 'https://open.spotify.com/api/token?reason=transport&productType=web_player', note: 'api/token web_player' },
            { url: 'https://open.spotify.com/api/token?reason=init&productType=web-player', note: 'api/token web-player (hyphen)' }
        ];

        for (const c of candidates) {
            let res: Response | undefined;
            try {
                if (SPOTIFY_DEBUG) console.log('[Spotify][token] try', c.note, c.url);
                res = await fetch(c.url, { headers }).catch(() => undefined);
                if (!res) { if (SPOTIFY_DEBUG) console.log('[Spotify][token] no response'); continue; }
                if (!res.ok) {
                    let txt: string | undefined; try { txt = await res.text(); } catch {}
                    if (SPOTIFY_DEBUG) console.log('[Spotify][token] not ok', res.status, (txt || '').slice(0, 200));
                    continue;
                }
                let j: any; try { j = await res.json(); } catch (e) { if (SPOTIFY_DEBUG) console.log('[Spotify][token] json error', String(e)); continue; }
                const token = j?.accessToken as string | undefined;
                const expMs = j?.accessTokenExpirationTimestampMs as number | undefined;
                if (token && typeof token === 'string' && token.length > 10) {
                    const exp = typeof expMs === 'number' && expMs > now ? expMs : now + 55 * 60 * 1000;
                    try { (globalThis as any)._SPOTIFY_EMBED_TOKEN_CACHE = { token, expMs: exp }; } catch {}
                    if (SPOTIFY_DEBUG) console.log('[Spotify][token] ok; expires in (ms)=', exp - now);
                    return token;
                } else {
                    if (SPOTIFY_DEBUG) console.log('[Spotify][token] missing token field on', c.note, j);
                }
            } catch (e) {
                if (SPOTIFY_DEBUG) console.log('[Spotify][token] exception', c.note, String(e));
            }
        }

        if (contextPageUrl) {
            try {
                const u = new URL(contextPageUrl);
                const segs = u.pathname.split('/').filter(Boolean);
                let kind = segs[0]?.toLowerCase() || '';
                let id = segs[1] || '';
                if (kind === 'intl-' && segs[1]) { kind = segs[1].toLowerCase(); id = segs[2] || id; }
                const embedUrl = `https://open.spotify.com/embed/${kind}/${id}${u.search}`;

                if (SPOTIFY_DEBUG) console.log('[Spotify][token] try embed scrape', embedUrl);

                const res = await fetch(embedUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                        'Accept-Language': 'ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7',
                        'Referer': 'https://open.spotify.com/',
                        'Origin': 'https://open.spotify.com'
                    } as any
                }).catch(() => undefined);

                if (res && res.ok) {
                    const html = await res.text();
                    const mTok = html.match(/"accessToken"\s*:\s*"([^\"]{20,})"/);
                    const mExp = html.match(/"accessTokenExpirationTimestampMs"\s*:\s*(\d{10,})/);
                    if (mTok) {
                        const token = mTok[1];
                        const expMs = mExp ? Number(mExp[1]) : now + 45 * 60 * 1000;
                        (globalThis as any)._SPOTIFY_EMBED_TOKEN_CACHE = { token, expMs };
                        if (SPOTIFY_DEBUG) console.log('[Spotify][token] embed scrape ok; ttl(ms)=', expMs - now);
                        return token;
                    } else {
                        if (SPOTIFY_DEBUG) console.log('[Spotify][token] embed scrape: token not found');
                    }
                } else {
                    if (SPOTIFY_DEBUG) console.log('[Spotify][token] embed scrape: fetch not ok', res && res.status);
                }
            } catch (e) {
                if (SPOTIFY_DEBUG) console.log('[Spotify][token] embed scrape exception', String(e));
            }
        }

        if (SPOTIFY_DEBUG) console.log('[Spotify][token] all candidates failed');
        return undefined;
    };

    const getSpotifyClientToken = async (): Promise<string | undefined> => {
        try {
            const appVersion = process.env.SPOTIFY_APP_VERSION || '1.2.76.48.gf9b58d28';
            const clientId = process.env.SPOTIFY_WEB_CLIENT_ID || 'd8a5ed958d274c2e8ee717e6a4b0971d';
            const body = {
                client_data: {
                    client_version: appVersion,
                    client_id: clientId,
                    js_sdk_data: {
                        device_brand: 'unknown',
                        device_model: 'unknown',
                        os: 'macos',
                        os_version: '14.7.1'
                    }
                }
            };

            const r = await fetch('https://clienttoken.spotify.com/v1/clienttoken', {
                method: 'POST',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36',
                    'Accept': 'application/json',
                    'Accept-Language': 'ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7',
                    'Origin': 'https://open.spotify.com',
                    'Referer': 'https://open.spotify.com/',
                    'Content-Type': 'application/json',
                    'app-platform': 'WebPlayer',
                    'spotify-app-version': appVersion
                } as any,
                body: JSON.stringify(body)
            }).catch(() => undefined);

            if (!r) { if (SPOTIFY_DEBUG) console.log('[Spotify][client-token] no response'); return undefined; }
            if (!r.ok) {
                let t: string | undefined; try { t = await r.text(); } catch {}
                if (SPOTIFY_DEBUG) console.log('[Spotify][client-token] not ok', r.status, (t || '').slice(0, 300));
                return undefined;
            }
            const j: any = await r.json().catch(() => undefined);
            const tok: string | undefined = j?.granted_token?.token;
            if (tok && tok.length > 10) { if (SPOTIFY_DEBUG) console.log('[Spotify][client-token] ok (len=', tok.length, ')'); return tok; }
            if (SPOTIFY_DEBUG) console.log('[Spotify][client-token] missing token field', j);
            return undefined;
        } catch (e) {
            if (SPOTIFY_DEBUG) console.log('[Spotify][client-token] exception', String(e));
            return undefined;
        }
    };

    const fetchAllPlaylistTrackIds_Pathfinder = async (pid: string): Promise<string[] | undefined> => {
        const accessToken = await getSpotifyEmbedToken(`https://open.spotify.com/playlist/${pid}`);
        if (!accessToken) { if (SPOTIFY_DEBUG) console.log('[Spotify][pathfinder] access token missing'); return undefined; }
        const clientToken = await getSpotifyClientToken();
        if (!clientToken) { if (SPOTIFY_DEBUG) console.log('[Spotify][pathfinder] client-token missing'); return undefined; }

        const appVersion = process.env.SPOTIFY_APP_VERSION || '1.2.76.48.gf9b58d28';
        const headers = {
            'authorization': `Bearer ${accessToken.trim()}`,
            'client-token': clientToken,
            'content-type': 'application/json;charset=UTF-8',
            'accept': 'application/json',
            'app-platform': 'WebPlayer',
            'spotify-app-version': appVersion,
            'origin': 'https://open.spotify.com',
            'referer': 'https://open.spotify.com/',
            'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36'
        } as any;

        const out: string[] = [];
        const limit = 50;

        const fetchPage = async (offset: number) => {
            const body = {
                variables: { uri: `spotify:playlist:${pid}`, offset, limit, enableWatchFeedEntrypoint: false },
                operationName: 'fetchPlaylist',
                extensions: { persistedQuery: { version: 1, sha256Hash: '837211ef46f604a73cd3d051f12ee63c81aca4ec6eb18e227b0629a7b36adad3' } }
            };
            const r = await fetch('https://api-partner.spotify.com/pathfinder/v2/query', { method: 'POST', headers, body: JSON.stringify(body) }).catch(() => undefined);
            if (!r || !r.ok) {
                let t: string | undefined; try { t = r ? await r.text() : undefined; } catch {}
                if (SPOTIFY_DEBUG) console.log('[Spotify][pathfinder] not ok', r && r.status, (t || '').slice(0, 200));
                return undefined as any;
            }
            return r.json().catch(() => undefined);
        };

        if (SPOTIFY_DEBUG) console.log('[Spotify][pathfinder] start', { pid, limit });
        const first = await fetchPage(0);
        if (!first) return undefined;

        const items = first?.data?.playlistV2?.content?.items ?? [];
        const total = first?.data?.playlistV2?.content?.totalCount ?? undefined;

        const push = (its: any[]) => {
            for (const it of its) {
                const uri: string | undefined = it?.itemV2?.data?.uri; // spotify:track:XXXX
                const m = uri?.match(/spotify:track:([A-Za-z0-9]{22})/);
                if (m) out.push(m[1]);
            }
        };

        push(items);

        let offset = items.length;
        for (let guard = 0; guard < 500 && offset < 5000; guard++, offset += limit) {
            if (total !== undefined && offset >= total) break;
            const page = await fetchPage(offset);
            const its: any[] = page?.data?.playlistV2?.content?.items ?? [];
            if (!its.length) break;
            push(its);
            if (its.length < limit) break;
        }

        const uniq = Array.from(new Set(out));
        if (SPOTIFY_DEBUG) console.log('[Spotify][pathfinder] done', { unique: uniq.length });
        return uniq.length ? uniq : undefined;
    };

    const normalizeShort = async (raw: string): Promise<string> => {
        const SPOTIFY_DEBUG = true;
        const H = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7',
            'Referer': 'https://open.spotify.com/',
            'Origin': 'https://open.spotify.com'
        } as any;

        const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

        const abortAfter = (ms: number) => {
            const ctl = new AbortController();
            const t = setTimeout(() => ctl.abort(), ms);
            return { signal: ctl.signal, cancel: () => clearTimeout(t) };
        };

        const isShortHost = (host: string) => /^(spoti\.fi|spotify\.link)$/i.test(host) || /^(?:[a-z0-9-]+\.)?app\.link$/i.test(host);

        const followManual = async (startUrl: string, maxHops = 5): Promise<string> => {
            let current = startUrl;
            for (let i = 0; i < maxHops; i++) {
                let u: URL;
                try { u = new URL(current); } catch { return current; }
                if (!isShortHost(u.hostname)) return current; // reached final non-short URL
                try {
                    const a = abortAfter(8000);
                    const res = await fetch(current, { redirect: 'manual' as any, headers: H, signal: a.signal }).catch(() => undefined);
                    a.cancel();
                    if (!res) break;
                    if (REDIRECT_STATUSES.has(res.status)) {
                        let loc = res.headers.get('location') || '';
                        if (loc) {
                            // absolute-ize relative Location
                            try { loc = new URL(loc, current).toString(); } catch {}
                            if (SPOTIFY_DEBUG) console.log('[Spotify][short] hop', i + 1, '->', loc);
                            current = loc;
                            continue; // next hop
                        }
                    }
                    // Some CDNs still expose a fully followed URL on Response.url
                    const ru = (res as any).url;
                    if (typeof ru === 'string' && ru && ru !== current) {
                        if (SPOTIFY_DEBUG) console.log('[Spotify][short] hop(url)', i + 1, '->', ru);
                        current = ru;
                        continue;
                    }
                    // If 200 at app.link with meta refresh, try to parse an open.spotify.com URL from body
                    try {
                        if (res.status === 200 && isShortHost(u.hostname)) {
                            const html = await res.text();
                            const m1 = html.match(/https:\/\/open\.spotify\.com\/[^"]+/i);
                            if (m1 && m1[0]) {
                                if (SPOTIFY_DEBUG) console.log('[Spotify][short] meta/html discovered ->', m1[0]);
                                current = m1[0];
                                continue;
                            }
                        }
                    } catch { /* ignore */ }
                    break; // nothing more we can do
                } catch (e) {
                    if (SPOTIFY_DEBUG) console.log('[Spotify][short] hop error', String(e));
                    break;
                }
            }
            return current;
        };

        try {
            const u0 = new URL(raw);
            if (!isShortHost(u0.hostname)) return raw;

            // Try multi-hop manual following first (handles spotify.link -> spotify.app.link -> open.spotify.com)
            let finalUrl = await followManual(raw, 6);

            // If still short, try a normal follow (some Branch/app.link flows require it)
            try {
                const hu = new URL(finalUrl);
                if (isShortHost(hu.hostname)) {
                    const a = abortAfter(8000);
                    const res2 = await fetch(finalUrl, { redirect: 'follow' as any, headers: H, signal: a.signal }).catch(() => undefined);
                    a.cancel();
                    const u = res2 && (res2 as any).url;
                    if (typeof u === 'string' && u) finalUrl = u;
                }
            } catch { /* ignore */ }

            // If we *still* didn't reach open.spotify.com, ask oEmbed to translate the short link
            try {
                const hu = new URL(finalUrl);
                if (isShortHost(hu.hostname)) {
                    const o = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(finalUrl)}`, {
                        headers: {
                            'User-Agent': H['User-Agent'],
                            'Accept': 'application/json',
                            'Accept-Language': H['Accept-Language'],
                            'Origin': 'https://open.spotify.com',
                            'Referer': 'https://open.spotify.com/'
                        } as any
                    }).catch(() => undefined);
                    if (o && o.ok) {
                        const js: any = await o.json().catch(() => undefined);
                        const iframeUrl: string | undefined = js?.iframe_url || js?.html?.match(/src="([^"]+)"/)?.[1];
                        if (iframeUrl) {
                            if (SPOTIFY_DEBUG) console.log('[Spotify][short] oEmbed resolved ->', iframeUrl);
                            finalUrl = iframeUrl;
                        }
                    }
                }
            } catch { /* ignore */ }

            return finalUrl || raw;
        } catch {
            return raw;
        }
    };

    const toTrackUrlsFromEmbed = async (embedUrl: string): Promise<string[] | undefined> => {
        try {
            const res = await fetch(embedUrl).catch(() => undefined);
            if (!res || !res.ok) return undefined;
            const html = await res.text();

            const idsA = Array.from(new Set(
                Array.from(html.matchAll(/\/(?:intl-[a-z]{2}\/)?track\/([A-Za-z0-9]{22})/gi)).map(m => m[1])
            ));
            const idsB = Array.from(new Set(
                Array.from(html.matchAll(/"uri"\s*:\s*"spotify:track:([A-Za-z0-9]{22})"/gi)).map(m => m[1])
            ));
            const ids = Array.from(new Set([...idsA, ...idsB]));
            return ids.length ? ids.map(id => `https://open.spotify.com/track/${id}`) : undefined;
        } catch {
            return undefined;
        }
    };

    const toEmbedFromOEmbed = async (pageUrl: string, fallbackEmbedPath: string): Promise<string> => {
        try {
            const o = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(pageUrl)}`).catch(() => undefined);
            const js = o && o.ok ? await o.json().catch(() => undefined) : undefined;
            const iframeUrl: string | undefined = js?.iframe_url || js?.html?.match(/src="([^"]+)"/)?.[1];
            if (iframeUrl) return iframeUrl;
        } catch { /* ignore */ }
        return fallbackEmbedPath;
    };

    const isId = (s: any): s is string => typeof s === "string" && /^[A-Za-z0-9]{22}$/.test(s);
    const trackUrl = (id: string) => `https://open.spotify.com/track/${id}`;

    const fetchAllPlaylistTrackIds_API = async (pid: string): Promise<string[] | undefined> => {
        const token = await getSpotifyEmbedToken(`https://open.spotify.com/playlist/${pid}`);
        if (!token) { if (SPOTIFY_DEBUG) console.log('[Spotify][playlist] token get failed', { pid }); return undefined; }

        const out: string[] = [];
        const headers = {
            Authorization: `Bearer ${token.trim()}`,
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36',
            'Accept': 'application/json',
            'Accept-Language': 'ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7',
            'Origin': 'https://open.spotify.com',
            'Referer': 'https://open.spotify.com/'
        } as any;

        const base = `https://api.spotify.com/v1/playlists/${pid}/tracks`;
        const limit = 100;

        const makeUrl = (offset: number) => {
            const params = new URLSearchParams({
                market: 'from_token',
                limit: String(limit),
                offset: String(offset),
                fields: 'items(track(id)),limit,offset,next'
            });
            return `${base}?${params.toString()}`;
        };

        if (SPOTIFY_DEBUG) console.log('[Spotify][playlist] start', { pid, limit });

        for (let offset = 0, guard = 0; guard < 200; offset += limit, guard++) {
            const url = makeUrl(offset);
            const t0 = Date.now();
            let r: any;
            try {
                r = await fetch(url, { headers });
            } catch (e) {
                if (SPOTIFY_DEBUG) console.log('[Spotify][playlist] fetch exception', { offset, url, e });
                break;
            }
            if (!r || !r.ok) {
                let text: string | undefined;
                try { text = r ? await r.text() : undefined; } catch {}
                if (SPOTIFY_DEBUG) console.log('[Spotify][playlist] fetch not OK', { offset, status: r && r.status, url, body: text?.slice(0, 300) });
                if (r && (r.status === 400 || r.status === 401)) {
                    if (SPOTIFY_DEBUG) console.log('[Spotify][playlist] fallback to pathfinder due to', r.status);
                    const pf = await fetchAllPlaylistTrackIds_Pathfinder(pid);
                    if (pf && pf.length) return Array.from(new Set(pf));
                }
                break;
            }
            let j: any;
            try { j = await r.json(); } catch (e) { if (SPOTIFY_DEBUG) console.log('[Spotify][playlist] json error', { offset, url, e }); break; }

            const items = Array.isArray(j?.items) ? j.items : [];
            for (const it of items) {
                const id = it?.track?.id;
                if (typeof id === 'string' && /^[A-Za-z0-9]{22}$/.test(id)) out.push(id);
            }

            if (SPOTIFY_DEBUG) console.log('[Spotify][playlist] page', {
                offset,
                status: r.status,
                ms: Date.now() - t0,
                itemsLen: items.length,
                cumulated: out.length,
                nextSample: (j?.next ? String(j.next).slice(0, 120) : undefined)
            });

            if (items.length < limit) break;
        }

        const uniq = Array.from(new Set(out));
        if (SPOTIFY_DEBUG) console.log('[Spotify][playlist] done', { unique: uniq.length });
        return uniq.length ? uniq : undefined;
    };

    const fetchAllAlbumTrackIds_API = async (aid: string): Promise<string[] | undefined> => {
        const token = await getSpotifyEmbedToken(`https://open.spotify.com/album/${aid}`);
        if (!token) return undefined;
        if (SPOTIFY_DEBUG) console.log('[Spotify][album] start', { aid });
        const out: string[] = [];
        const headers = {
            Authorization: `Bearer ${token}`,
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36',
            'Accept': 'application/json',
            'Accept-Language': 'ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7',
            'Origin': 'https://open.spotify.com',
            'Referer': 'https://open.spotify.com/'
        } as any;
        let reqUrl = `https://api.spotify.com/v1/albums/${aid}/tracks?fields=next,items(id)&limit=50`;
        for (let guard = 0; guard < 100; guard++) {
            const r = await fetch(reqUrl, { headers }).catch(() => undefined);
            if (!r || !r.ok) return undefined;
            const j: any = await r.json().catch(() => undefined);
            if (!j) return undefined;
            const items = Array.isArray(j.items) ? j.items : [];
            for (const it of items) {
                const id = it?.id;
                if (isId(id)) out.push(id);
            }
            if (!j.next) break;
            reqUrl = j.next as string;
        }
        const uniq = Array.from(new Set(out));
        return uniq.length ? uniq : undefined;
    };

    try {
        const resolved = await normalizeShort(url);
        if (SPOTIFY_DEBUG) console.log('[Spotify][parse] resolved', resolved);
        let u: URL;
        try { u = new URL(resolved); } catch { return undefined; }
        if (!/\.spotify\.com$/i.test(u.hostname) && !/^(?:spoti\.fi|spotify\.link|(?:[a-z0-9-]+\.)?app\.link)$/i.test(u.hostname)) return undefined;

        const segs = u.pathname.split("/").filter(Boolean);
        let i = 0;
        const head = segs[0]?.toLowerCase() || "";
        if (/^intl-[a-z]{2}$/i.test(head) || head === "embed") i = 1;

        const kind = (segs[i] || "").toLowerCase();
        const id = segs[i + 1] || "";

        let playlistId: string | undefined;
        if (kind === "user" && (segs[i + 2] || "").toLowerCase() === "playlist") {
            playlistId = segs[i + 3] || "";
        }

        const highlight = u.searchParams.get("highlight");
        const highlightId = highlight?.match(/spotify:track:([A-Za-z0-9]{22})/)?.[1];
        if (highlightId) return [`https://open.spotify.com/track/${highlightId}`];

        if (kind === "track" && isId(id)) return [`https://open.spotify.com/track/${id}`];

        if (kind === "album" && isId(id)) {
            const apiIds = await fetchAllAlbumTrackIds_API(id);
            if (apiIds?.length) return apiIds.map(tid => `https://open.spotify.com/track/${tid}`);
            const pageUrl = `https://open.spotify.com/album/${id}`;
            const embedUrl = await toEmbedFromOEmbed(pageUrl, `https://open.spotify.com/embed/album/${id}`);
            const tracks = await toTrackUrlsFromEmbed(embedUrl);
            return tracks ?? undefined;
        }

        if ((kind === "playlist" && isId(id)) || (playlistId && isId(playlistId))) {
            const pid = kind === "playlist" ? id : (playlistId as string);
            const apiIds = await fetchAllPlaylistTrackIds_API(pid);
            if (apiIds?.length) return apiIds.map(tid => `https://open.spotify.com/track/${tid}`);
            const pageUrl = `https://open.spotify.com/playlist/${pid}`;
            const embedUrl = await toEmbedFromOEmbed(pageUrl, `https://open.spotify.com/embed/playlist/${pid}`);
            const tracks = await toTrackUrlsFromEmbed(embedUrl);
            return tracks ?? undefined;
        }

        if (kind === "artist" && isId(id)) {
            const pageUrl = `https://open.spotify.com/artist/${id}`;
            const embedUrl = await toEmbedFromOEmbed(pageUrl, `https://open.spotify.com/embed/artist/${id}`);
            const tracks = await toTrackUrlsFromEmbed(embedUrl);
            return tracks ?? undefined;
        }

        const mTrack = resolved.match(/spotify\.com\/(?:intl-[a-z]{2}\/)?(?:embed\/)?track\/([A-Za-z0-9]{22})/i);
        if (mTrack) return [`https://open.spotify.com/track/${mTrack[1]}`];

        const mAlbum = resolved.match(/spotify\.com\/(?:intl-[a-z]{2}\/)?(?:embed\/)?album\/([A-Za-z0-9]{22})/i);
        if (mAlbum) {
            const apiIds = await fetchAllAlbumTrackIds_API(mAlbum[1]);
            if (apiIds?.length) return apiIds.map(tid => `https://open.spotify.com/track/${tid}`);
            const embedUrl = `https://open.spotify.com/embed/album/${mAlbum[1]}`;
            const tracks = await toTrackUrlsFromEmbed(embedUrl);
            return tracks ?? undefined;
        }

        const mPlaylist = resolved.match(/spotify\.com\/(?:intl-[a-z]{2}\/)?(?:(?:user\/[^/]+\/)?|(?:embed\/)?)playlist\/([A-Za-z0-9]{22})/i);
        if (mPlaylist) {
            const apiIds = await fetchAllPlaylistTrackIds_API(mPlaylist[1]);
            if (apiIds?.length) return apiIds.map(tid => `https://open.spotify.com/track/${tid}`);
            const embedUrl = `https://open.spotify.com/embed/playlist/${mPlaylist[1]}`;
            const tracks = await toTrackUrlsFromEmbed(embedUrl);
            return tracks ?? undefined;
        }

        const mHighlight = resolved.match(/[?&]highlight=spotify:track:([A-Za-z0-9]{22})/i);
        if (mHighlight) return [`https://open.spotify.com/track/${mHighlight[1]}`];

        return undefined;
    } catch {
        return undefined;
    }
}

// --- 起動即実行して結果を返す ---
(async () => {
    try {
        const payload = workerData as Payload;
        const out = await parseSpotifyUrl(payload.url);
        parentPort?.postMessage({ ok: true, data: out });
    } catch (e) {
        parentPort?.postMessage({ ok: false, error: String(e) });
    }
})();
