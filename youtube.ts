import * as youtubei from "youtubei.js";
import { getCookiesPromised } from "chrome-cookies-secure";

/**
 * プレイリストURLから videoId 一覧を取得する（ChromeのCookieを直接読み込み）
 * - URLに list= が無ければ undefined
 * - あれば { playlistId, videoIds } を返す（Mix: RD…は取得失敗の可能性あり）
 */
export async function fetchPlaylistVideoIdsFromUrl(
    url: string
) {
    // ===== ここから内側はプライベート実装 =====

    // 1) .env / OSデフォルトから Chrome プロファイルパスを決める
    const resolveProfilePath = (): string => {
        const envPath = process.env.CHROME_USER_PROFILE_PATH?.trim();
        if (envPath) return envPath;

        const { platform, env } = process;
        if (platform === "darwin") {
            return `${env.HOME}/Library/Application Support/Google/Chrome/Default`;
        } else if (platform === "win32") {
            return `${env.LOCALAPPDATA}\\Google\\Chrome\\User Data\\Default`;
        } else {
            return `${env.HOME}/.config/google-chrome/Default`;
        }
    };

    // 2) URL からプレイリストID(list=)を抽出（URL限定）
    const extractPlaylistId = (input: string): string | undefined => {
        try {
            const u = new URL(input);
            const list = u.searchParams.get("list")?.trim();
            if (!list) return undefined;
            // 文字種ざっくり検証（WL/LLなど短いIDもあるので長さ制限は設けない）
            if (!/^[A-Za-z0-9_-]+$/.test(list)) return undefined;
            return list;
        } catch {
            return undefined;
        }
    };

    // --- 新規: URLからseed video idを抽出するヘルパー ---
    const extractSeedVideoId = (input: string): string | undefined => {
        try {
            const u = new URL(input);
            const v = u.searchParams.get("v")?.trim();
            if (v && /^[A-Za-z0-9_-]{6,}$/.test(v)) return v;
            if (u.hostname === "youtu.be" && u.pathname.length > 1) {
                const id = u.pathname.slice(1);
                if (/^[A-Za-z0-9_-]{6,}$/.test(id)) return id;
            }
            if (u.pathname.startsWith("/shorts/")) {
                const id = u.pathname.split("/")[2];
                if (id && /^[A-Za-z0-9_-]{6,}$/.test(id)) return id;
            }
            if (u.pathname.startsWith("/embed/")) {
                const id = u.pathname.split("/")[2];
                if (id && /^[A-Za-z0-9_-]{6,}$/.test(id)) return id;
            }
            return undefined;
        } catch {
            return undefined;
        }
    };

    // 3) Chrome から youtube.com / music.youtube.com の Cookie を “object” で取得し、ヘッダ化
    const buildCookieHeader = async (): Promise<string> => {
        const profile = resolveProfilePath();

        // === ここがご提示のオーバーロード準拠 ===
        // getCookiesPromised(url, "object", profile?) => Record<string, string>
        const ytObj = await getCookiesPromised("https://www.youtube.com", "object", profile);
        const ytmObj = await getCookiesPromised("https://music.youtube.com", "object", profile);

        const merged: Record<string, string> = { ...ytObj, ...ytmObj };
        const header = Object.entries(merged)
            .filter(([k, v]) => k && typeof v === "string" && v.length > 0)
            .map(([k, v]) => `${k}=${v}`)
            .join("; ");

        if (!header.includes("=")) throw new Error("Chrome cookies not found");
        return header;
    };

    // 4) プレイリストIDを抽出。無ければ undefined
    const playlistId = extractPlaylistId(url);
    if (!playlistId) return undefined;

    // 5) youtubei.js を Cookie 付きで初期化
    const cookieHeader = await buildCookieHeader();
    const yt = await youtubei.Innertube.create({ cookie: cookieHeader });
    // --- 追加: 複数Googleアカウント環境でのアカウント選択（デフォルト0） ---
    const accountIndex = Number(process.env.GOOGLE_ACCOUNT_INDEX ?? "0") || 0;
    if ((yt as any).session?.context) {
        // 言語/地域を固定（任意だが一貫性が上がる）
        (yt as any).session.context = {
            ...(yt as any).session.context,
            client: { ...(yt as any).session.context?.client, hl: "ja", gl: "JP" },
        };
        // アカウント番号を明示（Default=0）
        (yt as any).session.context.headers = {
            ...(yt as any).session.context?.headers,
            "X-Goog-AuthUser": String(accountIndex),
        };
    }


    // --- 新規: RD(Mix)用 nextエンドポイントによる動画ID抽出 ---
    const tryMixViaNext = async (): Promise<string[]> => {
        const seed = extractSeedVideoId(url);
        if (!seed) return [];
        try {
            const resp: any = await (yt as any).actions.execute("next", {
                videoId: seed,
                playlistId,
                params: "wAEB",
            });
            const data = resp?.data ?? resp;

            let contents =
                data?.contents?.twoColumnWatchNextResults?.playlist?.playlistPanelRenderer?.contents
                ?? data?.contents?.singleColumnWatchNextResults?.playlist?.playlistPanelRenderer?.contents
                ?? data?.contents?.twoColumnWatchNextResults?.playlist?.playlist?.contents;

            if (!Array.isArray(contents)) contents = [];

            const idsFromPanel = contents
                .map((c: any) =>
                    c?.playlistPanelVideoRenderer?.videoId
                    ?? c?.playlistPanelVideoRenderer?.navigationEndpoint?.watchEndpoint?.videoId
                    ?? c?.playlistPanelVideoWrapperRenderer?.primaryRenderer?.playlistPanelVideoRenderer?.videoId
                    ?? null
                )
                .filter((x: any): x is string => typeof x === "string");

            const upNextIds =
                data?.contents?.twoColumnWatchNextResults?.secondaryResults?.secondaryResults?.results
                    ?.map((r: any) =>
                        r?.compactVideoRenderer?.videoId
                        ?? r?.videoWithContextRenderer?.videoId
                        ?? null
                    )
                    ?.filter((x: any): x is string => typeof x === "string") ?? [];

            const set = new Set<string>([...idsFromPanel, ...upNextIds]);
            return [...set];
        } catch {
            return [];
        }
    };

    // --- 追加: playlistVideoListRenderer から videoId を抜くユーティリティ ---
    const extractIdsFromPlaylistRenderer = (root: any): string[] => {
        const ids = new Set<string>();
        if (!root) return [];
        const stack = [root];
        while (stack.length) {
            const cur = stack.pop();
            if (!cur || typeof cur !== "object") continue;
            // 直接 videoId を持つレンダラ
            const vid = cur?.videoId
                ?? cur?.playlistVideoRenderer?.videoId
                ?? cur?.playlistPanelVideoRenderer?.videoId
                ?? cur?.compactVideoRenderer?.videoId
                ?? cur?.videoRenderer?.videoId
                ?? cur?.navigationEndpoint?.watchEndpoint?.videoId
                ?? cur?.playlistPanelVideoRenderer?.navigationEndpoint?.watchEndpoint?.videoId
                ?? null;
            if (typeof vid === "string" && vid) ids.add(vid);
            for (const k of Object.keys(cur)) {
                const v = (cur as any)[k];
                if (v && typeof v === "object") stack.push(v);
                if (Array.isArray(v)) for (const it of v) if (it && typeof it === "object") stack.push(it);
            }
        }
        return [...ids];
    };

    // --- 追加: browse 応答から continuation token を取り出す ---
    const extractContinuationTokens = (root: any): string[] => {
        const tokens = new Set<string>();
        if (!root) return [];
        const push = (t?: any) => { if (typeof t === "string" && t) tokens.add(t); };
        const stack = [root];
        while (stack.length) {
            const cur = stack.pop();
            if (!cur || typeof cur !== "object") continue;
            // よくある場所
            push(cur?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token);
            push(cur?.nextContinuationData?.continuation);
            push(cur?.reloadContinuationData?.continuation);
            push(cur?.continuationCommand?.token);
            // ネスト探索
            for (const k of Object.keys(cur)) {
                const v = (cur as any)[k];
                if (k === "continuation" && typeof v === "string") push(v);
                if (v && typeof v === "object") stack.push(v);
                if (Array.isArray(v)) for (const it of v) if (it && typeof it === "object") stack.push(it);
            }
        }
        return [...tokens];
    };

    // --- 追加: browse(VL<playlistId>) を使って全ページを取得 ---
    const fetchAllViaBrowseVL = async (): Promise<string[]> => {
        const ids: string[] = [];
        const seen = new Set<string>();

        const enqueueIds = (root: any) => {
            for (const id of extractIdsFromPlaylistRenderer(root)) if (!seen.has(id)) { seen.add(id); ids.push(id); }
        };

        const processRoot = async (initial: any) => {
            if (!initial) return;
            enqueueIds(initial);
            let tokens = extractContinuationTokens(initial);
            const MAX_STEPS = 1000; // 安全キャップ
            let steps = 0;
            while (tokens.length && steps < MAX_STEPS) {
                steps++;
                const token = tokens.shift()!;
                let cont: any;
                try {
                    cont = await (yt as any).actions.execute("browse", { continuation: token });
                } catch { cont = undefined; }
                if (!cont) continue;
                const cd = cont?.data ?? cont;
                enqueueIds(cd);
                // 新規トークンも継続的に追加
                const more = extractContinuationTokens(cd);
                // 先入れ先出しキューに追加
                for (const t of more) tokens.push(t);
            }
        };

        // 1) VL<id>
        let respVL: any;
        try {
            respVL = await (yt as any).actions.execute("browse", { browseId: `VL${playlistId}` });
        } catch { respVL = undefined; }
        await processRoot(respVL?.data ?? respVL);

        // 足りなければ 2) 生の playlistId も試す
        if (ids.length < 200) {
            let respRaw: any;
            try {
                respRaw = await (yt as any).actions.execute("browse", { browseId: playlistId });
            } catch { respRaw = undefined; }
            await processRoot(respRaw?.data ?? respRaw);
        }

        return ids;
    };

    // 6) プレイリストの videoId[] を取得（通常→Mixフォールバック・全件対応）
    const fetchVideoIds = async (): Promise<string[]> => {
        // RD(Mix) は next で展開
        if (playlistId.startsWith("RD")) {
            return await tryMixViaNext();
        }
        // 通常プレイリストは browse(VL<id>) で全量取得（100件以上対応）
        const viaBrowseAll = await fetchAllViaBrowseVL();
        if (viaBrowseAll.length) return viaBrowseAll;

        // 念のためのフォールバック（旧API互換）
        try {
            const plA: any = await yt.getPlaylist(url);
            if (plA?.videos?.length)
                return plA.videos
                    .map((v: any) => v?.id ?? v?.video_id ?? v?.videoId ?? v?.shortId ?? v?.compactVideo?.id ?? v?.compactVideoRenderer?.videoId ?? null)
                    .filter((x: any): x is string => typeof x === "string");
        } catch { }
        try {
            const plB: any = await yt.getPlaylist(playlistId);
            if (plB?.videos?.length)
                return plB.videos
                    .map((v: any) => v?.id ?? v?.video_id ?? v?.videoId ?? v?.shortId ?? v?.compactVideo?.id ?? v?.compactVideoRenderer?.videoId ?? null)
                    .filter((x: any): x is string => typeof x === "string");
        } catch { }
        return [];
    };

    const videoIds = await fetchVideoIds();

    // 7) 結果を返す（RDは空配列の可能性あり）
    return { playlistId, videoIds };
}
