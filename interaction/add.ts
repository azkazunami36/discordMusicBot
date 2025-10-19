import { Interaction, SlashCommandBuilder, CacheType, Message } from "discord.js";
import ytdl from "ytdl-core";
import yts from "yt-search";

import { InteractionInputData } from "../interface.js";
import { EnvData, Playlist, videoMetaCacheGet } from "../envJSON.js";
import { VariableExistCheck } from "../variableExistCheck.js";
import { getNicoMylistIds, parseNicoVideo, searchNicoVideo } from "../niconico.js";
import { messageEmbedGet, videoInfoEmbedGet } from "../embed.js";
import { parseTweetId } from "../twitter.js";
import { fetchPlaylistVideoIdsFromUrl } from "../youtube.js";
import { sourcePathManager } from "../sourcePathManager.js";
import { SumLog } from "../sumLog.js";
import { numberToTimeString } from "../numberToTimeString.js";
import { appleChunkHelper } from "../worker/helper/appleChunkHelper.js";
import { spotifyChunkHelper } from "../worker/helper/spotifyChunkHelper.js";

export const command = new SlashCommandBuilder()
    .setName("add")
    .setDescription("曲を追加します。")
    .addStringOption(option => option
        .setName("text")
        .setDescription("音楽を追加することができます。URLまたはVideoIDまたは検索したいタイトルを入力してください。複数曲追加することは現時点ではできません。")
        .setRequired(true)
    )
    .addStringOption(option => option
        .setName("service")
        .setDescription("優先するサービスです。動画URLだけどプレイリストがあったら取得したいときはプレイリストを選択します。検索次に優先したいサービスがあれば、それを選択します。")
        .addChoices(
            { name: "YouTube", value: "youtube" },
            { name: "YouTubeプレイリスト", value: "youtubePlaylist" },
            { name: "ニコニコ動画", value: "niconico" }
        )
    )
export const commandExample = "/add text:[URLまたはVideoIDまたは検索したいタイトル]";

export async function execute(interaction: Interaction<CacheType>, inputData: InteractionInputData, message: Message) {
    if (interaction.isChatInputCommand()) {
        /** 検索するテキストデータ */
        const data = interaction.options.getString("text");
        const variableExistCheck = new VariableExistCheck(interaction);
        const guildData = await variableExistCheck.guild();
        if (!guildData) return;
        const playlist = await variableExistCheck.playlist();
        if (!playlist) return;
        if (data === null) return await message.edit({ embeds: [messageEmbedGet("追加したい曲が指定されませんでした。入力してから追加を行なってください。", interaction.client)] });
        if (data === "") return await message.edit({ embeds: [messageEmbedGet("内容が空です。入力してから追加をしてください。", interaction.client)] });
        const priority = interaction.options.getString("service");
        /** まずスペースで分割 */
        const words = data.split(/[ 　]+/);
        /** IDやURLとして認識できない単語をここにまとめる */
        let searchWords = "";
        /** 取得できたVideoIDやニコニコ動画のIDをここにまとめます。 */
        const getContents: Playlist[] = [];
        await message.edit({ embeds: [messageEmbedGet("ステップ１/４: 文字列を分析中...(1/" + words.length + ")", interaction.client)] });
        let playlistCheckingStatusSendedIs = false;
        const addedPlaylist: Playlist[] = [];
        const envData = new EnvData(guildData.guildId);
        let wordCheckProcessed = 0;
        let sendTime = Date.now();
        const suminfo = { guildId: interaction.guildId || undefined, userId: interaction.user.id, functionName: "interaction add", textChannelId: interaction.channelId };
        SumLog.log("キューに追加するためにテキストの分析を行います。テキストを分割し、された後のテキスト数は" + words.length + "個です。", suminfo);
        for (const word of words) {
            wordCheckProcessed++;
            if (word === "") continue;
            const nowTime = Date.now();
            if (nowTime - sendTime > 2000) {
                sendTime = nowTime;
                await message.edit({ embeds: [messageEmbedGet("ステップ１/４: 文字列を分析中...(" + wordCheckProcessed + "/" + words.length + ")", interaction.client)] });
            }
            let videoIdData: Playlist | undefined;
            const urlIs = word.startsWith("https://") || word.startsWith("http://");
            const resolvedId = await fetchPlaylistVideoIdsFromUrl(word);
            const niconicoMylist = await getNicoMylistIds(word);
            let nicovideoIdData: Playlist | undefined;
            if (ytdl.validateURL(word)) {
                videoIdData = {
                    type: "videoId",
                    body: ytdl.getURLVideoID(word)
                };
                SumLog.log(word + "はYouTubeのIDとして解析が可能です。", suminfo);
            }
            if (!videoIdData && ytdl.validateURL("https://youtu.be/" + word)) {
                videoIdData = {
                    type: "videoId",
                    body: ytdl.getURLVideoID("https://youtu.be/" + word)
                };
                SumLog.log(word + "はYouTubeのIDとして解析が可能です。", suminfo);
            }
            const nicovideoId = parseNicoVideo(word);
            if (nicovideoId) {
                nicovideoIdData = {
                    type: "nicovideoId",
                    body: nicovideoId
                };
                SumLog.log(word + "はニコニコ動画のIDとして解析が可能です。", suminfo);
            }
            if (videoIdData && !(resolvedId && resolvedId.videoIds.length !== 0 && priority === "youtubePlaylist")) {
                getContents.push(videoIdData);
                SumLog.log(word + "はYouTubeのIDとしてキューに追加されました。", suminfo);
                continue;
            }
            if (nicovideoIdData) {
                getContents.push(nicovideoIdData);
                SumLog.log(word + "はニコニコ動画のIDとしてキューに追加されました。", suminfo);
                continue;
            }
            const parallelProcess = 5;
            const spotifyUrls = await parseSpotifyUrl(word);
            if (spotifyUrls) {
                const startTime = Date.now();
                SumLog.log(word + "はSpotifyのURLです。解析を開始します。リスト(" + spotifyUrls.length + "個)は次です。\n" + spotifyUrls, suminfo);
                let spotifyCheckProcessed = 0;
                const processTimes: number[] = [];
                for (let i = 0; i < spotifyUrls.length; i += parallelProcess) {
                    const nowTime = Date.now();
                    if (nowTime - sendTime > 2000) {
                        sendTime = nowTime;
                        await message.edit({
                            embeds: [messageEmbedGet("ステップ１/４: 文字列を分析中...(" + wordCheckProcessed + "/" + words.length + ") in Spotify URLを元にYouTubeで曲を検索・抽出中...(" + Math.floor(spotifyUrls.length / parallelProcess) + "フェーズ中" + spotifyCheckProcessed + "フェーズ)" +
                                (processTimes.length !== 0 ? "抽出が終わるまで残り約" + numberToTimeString((processTimes.reduce((a, b) => a + b, 0) / processTimes.length / 1000) * (Math.floor(spotifyUrls.length / parallelProcess) - spotifyCheckProcessed)) : "") + " " + (spotifyCheckProcessed * parallelProcess) + "曲がすでに追加済みです。", interaction.client)]
                        });
                    }
                    const slice = spotifyUrls.slice(i, i + parallelProcess);
                    const sorted = await spotifyChunkHelper(slice, i);
                    for (const playlistData of sorted) {
                        sourcePathManager.getAudioPath(playlistData).catch(e => {
                            SumLog.error(playlistData.body + "のダウンロードでエラーが発生しました。", suminfo);
                            console.error("addコマンドで次の動画のダウンロードができませんでした。", playlistData, e);
                        });
                    }
                    const saveplaylist = await variableExistCheck.playlist() || []
                    saveplaylist.push(...sorted);
                    addedPlaylist.push(...sorted);
                    envData.playlistSave(saveplaylist);
                    spotifyCheckProcessed++;
                    if (processTimes.length > 6) processTimes.pop();
                    processTimes.push(Date.now() - nowTime);
                }
                SumLog.log(word + "をSpotifyのURLとして処理するのにかかった時間は" + ((Date.now() - startTime) / 1000) + "秒です。", suminfo);
                continue;
            }
            const appleMusicUrls = await parseAppleMusicUrl(word);
            if (appleMusicUrls) {
                const startTime = Date.now();
                SumLog.log(word + "はApple MusicのURLです。解析を開始します。リスト(" + appleMusicUrls.length + "個)は次です。\n" + appleMusicUrls, suminfo);
                let appleMusicCheckProcessed = 0;
                const processTimes: number[] = [];
                for (let i = 0; i < appleMusicUrls.length; i += parallelProcess) {
                    const nowTime = Date.now();
                    if (nowTime - sendTime > 2000) {
                        sendTime = nowTime;
                        await message.edit({
                            embeds: [messageEmbedGet("ステップ１/４: 文字列を分析中...(" + wordCheckProcessed + "/" + words.length + ") in Apple Music URLを元にYouTubeで曲を検索・抽出中...(" + Math.floor(appleMusicUrls.length / parallelProcess) + "フェーズ中" + appleMusicCheckProcessed + "フェーズ)" +
                                (processTimes.length !== 0 ? "抽出が終わるまで残り約" + numberToTimeString((processTimes.reduce((a, b) => a + b, 0) / processTimes.length / 1000) * (Math.floor(appleMusicUrls.length / parallelProcess) - appleMusicCheckProcessed)) : "") + " " + (appleMusicCheckProcessed * parallelProcess) + "曲がすでに追加済みです。", interaction.client)]
                        });
                    }
                    const slice = appleMusicUrls.slice(i, i + parallelProcess);
                    const sorted = await appleChunkHelper(slice, i);
                    for (const playlistData of sorted) {
                        sourcePathManager.getAudioPath(playlistData).catch(e => {
                            SumLog.error(playlistData.body + "のダウンロードでエラーが発生しました。", suminfo);
                            console.error("addコマンドで次の動画のダウンロードができませんでした。", playlistData, e);
                        });
                    }
                    const saveplaylist = await variableExistCheck.playlist() || [];
                    saveplaylist.push(...sorted);
                    addedPlaylist.push(...sorted);
                    envData.playlistSave(saveplaylist);
                    appleMusicCheckProcessed++;
                    if (processTimes.length > 6) processTimes.pop();
                    processTimes.push(Date.now() - nowTime);
                }
                SumLog.log(word + "をApple MusicのURLとして処理するのにかかった時間は" + ((Date.now() - startTime) / 1000) + "秒です。", suminfo);
                continue;
            }
            if (resolvedId) {
                if (!playlistCheckingStatusSendedIs) {
                    playlistCheckingStatusSendedIs = true;
                }
                SumLog.log(word + "はYouTubeプレイリストです。" + resolvedId.videoIds.length + "個あります。一覧です。" + resolvedId.videoIds.join(", "), suminfo);
                for (const item of resolvedId.videoIds) {
                    const playlistData: {
                        type: "videoId";
                        body: string;
                    } = {
                        type: "videoId",
                        body: item
                    };
                    if (item && ytdl.validateID(item)) getContents.push(playlistData);
                }
                continue;
            }
            if (niconicoMylist) {
                if (!playlistCheckingStatusSendedIs) {
                    playlistCheckingStatusSendedIs = true;
                }
                SumLog.log(word + "はニコニコマイリストです。" + niconicoMylist.length + "個あります。一覧です。" + niconicoMylist.join(", "), suminfo);
                for (const item of niconicoMylist) {
                    const playlistData: {
                        type: "nicovideoId";
                        body: string;
                    } = {
                        type: "nicovideoId",
                        body: item
                    };
                    if (item && parseNicoVideo(item)) getContents.push(playlistData);
                }
            }
            if (urlIs) continue;
            searchWords += searchWords === "" ? word : " " + word;
        }
        if (searchWords) {
            SumLog.log(searchWords + "はURLやIDとして分析できないため検索されます。", suminfo);
            await message.edit({ embeds: [messageEmbedGet("ステップ２/４: 検索中...", interaction.client)] });
            const youtubeResult = await yts(searchWords);
            const youtubeData: {
                type: "videoId",
                body: string
            } | undefined = youtubeResult.videos[0] ? {
                type: "videoId",
                body: youtubeResult.videos[0].videoId
            } : undefined;
            const niconicoResult = await searchNicoVideo(searchWords);
            const niconicoData: {
                type: "nicovideoId",
                body: string
            } | undefined = (niconicoResult && niconicoResult[0]) ? {
                type: "nicovideoId",
                body: niconicoResult[0].contentId
            } : undefined;
            if (priority === "niconico") niconicoData ? getContents.push(niconicoData) : youtubeData ? getContents.push(youtubeData) : "";
            else youtubeData ? getContents.push(youtubeData) : niconicoData ? getContents.push(niconicoData) : "";
        }
        // 追加
        const truePlaylist: Playlist[] = [];
        let trueCheckProcessed = 0;
        const processTimes: number[] = [];
        for (const playlistData of getContents) {
            trueCheckProcessed++;
            const nowTime = Date.now();
            if (nowTime - sendTime > 2000) {
                sendTime = nowTime;
                await message.edit({
                    embeds: [messageEmbedGet("ステップ３/４: 取得した動画の有効性をチェック中...(" + trueCheckProcessed + "/" + getContents.length + ")" +
                        (processTimes.length !== 0 ? "チェックが終わるまで残り約" + numberToTimeString((processTimes.reduce((a, b) => a + b, 0) / processTimes.length / 1000) * (getContents.length - trueCheckProcessed)) : ""), interaction.client)]
                });
            }
            sourcePathManager.getAudioPath(playlistData).catch(e => {
                SumLog.error(playlistData.body + "のダウンロードでエラーが発生しました。", suminfo);
                console.error("addコマンドで次の動画のダウンロードができませんでした。", playlistData, e);
            });
            if (await videoMetaCacheGet(playlistData)) {
                if (processTimes.length > 50) processTimes.pop();
                processTimes.push(Date.now() - nowTime); truePlaylist.push(playlistData);
            }
        }

        addedPlaylist.push(...truePlaylist);
        if (addedPlaylist.length <= 0) {
            SumLog.error(data + "はどのような手段を用いても取得ができませんでした。", suminfo);
            console.error("認識失敗: ", data);
            return await message.edit({ embeds: [messageEmbedGet("`" + data + "`は有効な内容として認識することができず、追加ができませんでした。再度追加するか、botの作成者に相談してください。", interaction.client)] });
        }
        const saveplaylist = await variableExistCheck.playlist() || []
        saveplaylist.push(...truePlaylist);
        envData.playlistSave(saveplaylist);

        SumLog.log(data + "を追加する処理が完了しました。", suminfo);
        await message.edit({ embeds: [messageEmbedGet("ステップ４/４: 取得操作が完了し、結果レポート作成中...", interaction.client)] });
        const embed = await videoInfoEmbedGet(addedPlaylist, (addedPlaylist.length === 1 ? "" : addedPlaylist.length) + "曲が追加されました。", interaction.client);
        await message.edit({ embeds: [embed] });
    }
}

// ここからしたChatGPT.

/**
 * SpotifyのURLを「曲URLの配列」に正規化します。
 * (1) 自動で匿名トークンを取得し、(2) Spotify Web APIでページングして全曲を収集し、(3) 失敗時に既存のembed抽出へフォールバック
 */
async function parseSpotifyUrl(url: string): Promise<string[] | undefined> {
    const SPOTIFY_DEBUG = true; // コンソールに詳細ログを出す
    // --- helpers: 埋め込み用アクセストークン取得（キャッシュ付き） --------------------------
    const getSpotifyEmbedToken = async (contextPageUrl?: string): Promise<string | undefined> => {
        const now = Date.now();
        // キャッシュ
        try {
            const anyCache: any = (globalThis as any)._SPOTIFY_EMBED_TOKEN_CACHE;
            if (anyCache && typeof anyCache.token === 'string' && typeof anyCache.expMs === 'number') {
                if (anyCache.expMs - 60_000 > now) {
                    if (SPOTIFY_DEBUG) console.log('[Spotify][token] use cache; ttl(ms)=', anyCache.expMs - now);
                    return anyCache.token;
                }
            }
        } catch { }

        // ENV フォールバック
        try {
            const envTok = process.env.SPOTIFY_EMBED_TOKEN || process.env.SPOTIFY_ACCESS_TOKEN || process.env.SPOTIFY_ANON_TOKEN;
            const envExp = Number(process.env.SPOTIFY_EMBED_TOKEN_EXP_MS || process.env.SPOTIFY_ACCESS_TOKEN_EXP_MS || 0);
            if (envTok) {
                const expMs = envExp > now + 60_000 ? envExp : now + 50 * 60 * 1000;
                (globalThis as any)._SPOTIFY_EMBED_TOKEN_CACHE = { token: envTok, expMs };
                if (SPOTIFY_DEBUG) console.log('[Spotify][token] use ENV token; ttl(ms)=', expMs - now);
                return envTok;
            }
        } catch { }

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
                    let txt: string | undefined; try { txt = await res.text(); } catch { }
                    if (SPOTIFY_DEBUG) console.log('[Spotify][token] not ok', res.status, (txt || '').slice(0, 200));
                    continue;
                }
                let j: any; try { j = await res.json(); } catch (e) { if (SPOTIFY_DEBUG) console.log('[Spotify][token] json error', String(e)); continue; }
                const token = j?.accessToken as string | undefined;
                const expMs = j?.accessTokenExpirationTimestampMs as number | undefined;
                if (token && typeof token === 'string' && token.length > 10) {
                    const exp = typeof expMs === 'number' && expMs > now ? expMs : now + 55 * 60 * 1000;
                    try { (globalThis as any)._SPOTIFY_EMBED_TOKEN_CACHE = { token, expMs: exp }; } catch { }
                    if (SPOTIFY_DEBUG) console.log('[Spotify][token] ok; expires in (ms)=', exp - now);
                    return token;
                } else {
                    if (SPOTIFY_DEBUG) console.log('[Spotify][token] missing token field on', c.note, j);
                }
            } catch (e) {
                if (SPOTIFY_DEBUG) console.log('[Spotify][token] exception', c.note, String(e));
            }
        }

        // 埋め込みHTMLからの抽出フォールバック
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
    // --- helpers: client-token取得（Pathfinder用） ------------------------------
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
                let t: string | undefined; try { t = await r.text(); } catch { }
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
    // --- helpers: Pathfinder(GraphQL)でプレイリスト全件を取得 --------------------
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
        const limit = 50; // 25/50が安定（100は弾かれる場合あり）

        const fetchPage = async (offset: number) => {
            const body = {
                variables: { uri: `spotify:playlist:${pid}`, offset, limit, enableWatchFeedEntrypoint: false },
                operationName: 'fetchPlaylist',
                extensions: { persistedQuery: { version: 1, sha256Hash: '837211ef46f604a73cd3d051f12ee63c81aca4ec6eb18e227b0629a7b36adad3' } }
            };
            const r = await fetch('https://api-partner.spotify.com/pathfinder/v2/query', { method: 'POST', headers, body: JSON.stringify(body) }).catch(() => undefined);
            if (!r || !r.ok) {
                let t: string | undefined; try { t = r ? await r.text() : undefined; } catch { }
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
        // total が無い/信用できない場合でも、空ページが返ったら終了
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
    // --- helpers: 短縮URL正規化 ---------------------------------------------
    const normalizeShort = async (raw: string): Promise<string> => {
        try {
            const u0 = new URL(raw);
            if (!/^(?:spoti\.fi|spotify\.link)$/i.test(u0.hostname)) return raw;
            const res = await fetch(raw, { redirect: "follow" as any }).catch(() => undefined);
            return (res && typeof res.url === "string" && res.url) ? res.url : raw;
        } catch {
            return raw;
        }
    };

    // --- helpers: embedページからtrackをbest-effort抽出 ----------------------
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
        const limit = 100; // API上限

        const makeUrl = (offset: number) => {
            const params = new URLSearchParams({
                market: 'from_token',
                limit: String(limit),
                offset: String(offset),
                // 返却量を絞りつつ必要情報は残す
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
                try { text = r ? await r.text() : undefined; } catch { }
                if (SPOTIFY_DEBUG) console.log('[Spotify][playlist] fetch not OK', { offset, status: r && r.status, url, body: text?.slice(0, 300) });
                // Web APIで 400/401 のときは Pathfinder にフォールバック
                if (r && (r.status === 400 || r.status === 401)) {
                    if (SPOTIFY_DEBUG) console.log('[Spotify][playlist] fallback to pathfinder due to', r.status);
                    const pf = await fetchAllPlaylistTrackIds_Pathfinder(pid);
                    if (pf && pf.length) return Array.from(new Set(pf));
                }
                break; // 途中で失敗→取れた分だけ返す
            }
            let j: any;
            try {
                j = await r.json();
            } catch (e) {
                if (SPOTIFY_DEBUG) console.log('[Spotify][playlist] json error', { offset, url, e });
                break;
            }

            const items = Array.isArray(j?.items) ? j.items : [];
            let added = 0;
            for (const it of items) {
                const id = it?.track?.id; // episode/local/null は除外
                if (typeof id === 'string' && /^[A-Za-z0-9]{22}$/.test(id)) { out.push(id); added++; }
            }

            if (SPOTIFY_DEBUG) console.log('[Spotify][playlist] page', {
                offset,
                status: r.status,
                ms: Date.now() - t0,
                itemsLen: items.length,
                added,
                cumulated: out.length,
                nextSample: (j?.next ? String(j.next).slice(0, 120) : undefined)
            });

            // 最終ページ判定：items が limit 未満
            if (items.length < limit) {
                if (SPOTIFY_DEBUG) console.log('[Spotify][playlist] reached last page');
                break;
            }
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
        let url = `https://api.spotify.com/v1/albums/${aid}/tracks?fields=next,items(id)&limit=50`;
        for (let guard = 0; guard < 100; guard++) {
            const r = await fetch(url, { headers }).catch(() => undefined);
            if (!r || !r.ok) return undefined;
            const j: any = await r.json().catch(() => undefined);
            if (!j) return undefined;
            const items = Array.isArray(j.items) ? j.items : [];
            for (const it of items) {
                const id = it?.id;
                if (isId(id)) out.push(id);
            }
            if (!j.next) break;
            url = j.next as string;
        }
        const uniq = Array.from(new Set(out));
        return uniq.length ? uniq : undefined;
    };

    // --- main --------------------------------------------------------------
    try {
        const resolved = await normalizeShort(url);
        if (SPOTIFY_DEBUG) console.log('[Spotify][parse] resolved', resolved);
        let u: URL;
        try { u = new URL(resolved); } catch { return undefined; }
        if (!/\.spotify\.com$/i.test(u.hostname) && !/^(?:spoti\.fi|spotify\.link)$/i.test(u.hostname)) return undefined;

        const segs = u.pathname.split("/").filter(Boolean);
        let i = 0;
        const head = segs[0]?.toLowerCase() || "";
        if (/^intl-[a-z]{2}$/i.test(head) || head === "embed") i = 1;

        const kind = (segs[i] || "").toLowerCase();
        const id = segs[i + 1] || "";

        // user経由のplaylistパス: /user/{uid}/playlist/{id}
        let playlistId: string | undefined;
        if (kind === "user" && (segs[i + 2] || "").toLowerCase() === "playlist") {
            playlistId = segs[i + 3] || "";
        }

        // ?highlight=spotify:track:XXXX（アルバム/プレイリスト内ハイライト）
        const highlight = u.searchParams.get("highlight");
        const highlightId = highlight?.match(/spotify:track:([A-Za-z0-9]{22})/)?.[1];
        if (highlightId) return [trackUrl(highlightId)];

        // --- track ---
        if (kind === "track" && isId(id)) return [trackUrl(id)];

        // --- album ---: まずAPIで全曲 → 失敗時embed
        if (kind === "album" && isId(id)) {
            const apiIds = await fetchAllAlbumTrackIds_API(id);
            if (apiIds?.length) {
                if (SPOTIFY_DEBUG) console.log('[Spotify][parse] album apiIds', apiIds.length);
                return apiIds.map(trackUrl);
            }
            const pageUrl = `https://open.spotify.com/album/${id}`;
            const embedUrl = await toEmbedFromOEmbed(pageUrl, `https://open.spotify.com/embed/album/${id}`);
            const tracks = await toTrackUrlsFromEmbed(embedUrl);
            return tracks ?? undefined;
        }

        // --- playlist ---: まずAPIで全曲 → 失敗時embed
        if ((kind === "playlist" && isId(id)) || (playlistId && isId(playlistId))) {
            const pid = kind === "playlist" ? id : (playlistId as string);
            const apiIds = await fetchAllPlaylistTrackIds_API(pid);
            if (apiIds?.length) {
                if (SPOTIFY_DEBUG) console.log('[Spotify][parse] playlist apiIds', apiIds.length);
                return apiIds.map(trackUrl);
            }
            if (SPOTIFY_DEBUG) console.log('[Spotify][parse] playlist fallback to embed', pid);
            const pageUrl = `https://open.spotify.com/playlist/${pid}`;
            const embedUrl = await toEmbedFromOEmbed(pageUrl, `https://open.spotify.com/embed/playlist/${pid}`);
            const tracks = await toTrackUrlsFromEmbed(embedUrl);
            return tracks ?? undefined;
        }

        // --- artist（人気曲）: ここではembedフォールバックのみ（必要ならAPIでtop-tracksへ拡張可）
        if (kind === "artist" && isId(id)) {
            const pageUrl = `https://open.spotify.com/artist/${id}`;
            const embedUrl = await toEmbedFromOEmbed(pageUrl, `https://open.spotify.com/embed/artist/${id}`);
            const tracks = await toTrackUrlsFromEmbed(embedUrl);
            return tracks ?? undefined;
        }

        // --- 後方互換: 正規表現で拾う（track/album/playlist） -----------------
        const mTrack = resolved.match(/spotify\.com\/(?:intl-[a-z]{2}\/)?(?:embed\/)?track\/([A-Za-z0-9]{22})/i);
        if (mTrack) return [trackUrl(mTrack[1])];

        const mAlbum = resolved.match(/spotify\.com\/(?:intl-[a-z]{2}\/)?(?:embed\/)?album\/([A-Za-z0-9]{22})/i);
        if (mAlbum) {
            const apiIds = await fetchAllAlbumTrackIds_API(mAlbum[1]);
            if (apiIds?.length) {
                if (SPOTIFY_DEBUG) console.log('[Spotify][parse] album apiIds', apiIds.length);
                return apiIds.map(trackUrl);
            }
            const embedUrl = `https://open.spotify.com/embed/album/${mAlbum[1]}`;
            const tracks = await toTrackUrlsFromEmbed(embedUrl);
            return tracks ?? undefined;
        }

        const mPlaylist = resolved.match(/spotify\.com\/(?:intl-[a-z]{2}\/)?(?:(?:user\/[^/]+\/)?|(?:embed\/)?)playlist\/([A-Za-z0-9]{22})/i);
        if (mPlaylist) {
            const apiIds = await fetchAllPlaylistTrackIds_API(mPlaylist[1]);
            if (apiIds?.length) {
                if (SPOTIFY_DEBUG) console.log('[Spotify][parse] playlist apiIds', apiIds.length);
                return apiIds.map(trackUrl);
            }
            if (SPOTIFY_DEBUG) console.log('[Spotify][parse] playlist fallback to embed', mPlaylist[1]);
            const embedUrl = `https://open.spotify.com/embed/playlist/${mPlaylist[1]}`;
            const tracks = await toTrackUrlsFromEmbed(embedUrl);
            return tracks ?? undefined;
        }

        // アルバムURL上の ?highlight=spotify:track:xxxxx
        const mHighlight = resolved.match(/[?&]highlight=spotify:track:([A-Za-z0-9]{22})/i);
        if (mHighlight) return [trackUrl(mHighlight[1])];

        return undefined;
    } catch {
        return undefined;
    }
}

/**
 * Apple MusicのURLを「曲URLの配列」に正規化します。
 * - song: その曲だけ（/song/{id} or album...?i={id}）
 * - album: iTunes Lookup で収録曲を列挙
 * - playlist(公開): ページHTMLから /song/{id} を抽出（best-effort）
 * - 無効/非対応は undefined
 */
async function parseAppleMusicUrl(url: string): Promise<string[] | undefined> {
    const DEBUG = true; // 後で false にして消せます
    const buildSongUrl = (country: string, trackId: string) => `https://music.apple.com/${country}/song/${trackId}`;

    // HTMLから曲IDをできるだけ多く抽出するユーティリティ
    const extractSongIdsFromHtml = (html: string, label: string): string[] => {
        const ids = new Set<string>();

        // 1) 明示リンク: /song/{id} と /song/{title}/{id} の両対応（/jp/ の有無も考慮）
        for (const m of html.matchAll(/\/(?:[a-z]{2}\/)?song\/(?:[^\/]+\/)?(\d{6,})/gi)) ids.add(m[1]);

        // 2) href属性に入っているパターン（ダブル/シングルクオート両対応）
        for (const m of html.matchAll(/href\s*=\s*['"]\/(?:[a-z]{2}\/)?song\/(?:[^\/]+\/)?(\d{6,})['"]/gi)) ids.add(m[1]);

        // 3) JSON中の trackId
        for (const m of html.matchAll(/"trackId"\s*:\s*(\d{6,})/gi)) ids.add(m[1]);

        // 4) Apple Music API風: {"type":"songs","id":"12345"}
        for (const m of html.matchAll(/\{[^{}]*?"type"\s*:\s*"songs"[^{}]*?"id"\s*:\s*"(\d{6,})"[^{}]*?\}/gi)) ids.add(m[1]);

        // 5) その他の別名
        for (const m of html.matchAll(/"songCatalogId"\s*:\s*"?(\d{6,})"?/gi)) ids.add(m[1]);
        for (const m of html.matchAll(/"catalogId"\s*:\s*"?(\d{6,})"?/gi)) ids.add(m[1]);

        // 6) metaタグ（OpenGraph/Twitter/音楽用メタ）: content="https://music.apple.com/jp/song/{title}/{id}" 等
        for (const m of html.matchAll(/content\s*=\s*['"]https?:\/\/music\.apple\.com\/(?:[a-z]{2}\/)?song\/(?:[^\/]+\/)?(\d{6,})['"]/gi)) ids.add(m[1]);

        // 7) JSON中のURL: "url":"https://music.apple.com/jp/song/{title}/{id}"
        for (const m of html.matchAll(/"url"\s*:\s*"https?:\\\/\\\/music\.apple\.com\\\/(?:[a-z]{2}\\\/)?song\\\/(?:[^\\\/]+\\\/)?(\d{6,})"/gi)) ids.add(m[1]);

        if (DEBUG) console.log(`[AppleMusic][extractSongIdsFromHtml:${label}] found`, ids.size);
        return Array.from(ids);
    };

    // oEmbed→埋め込みURLを取得（失敗したらフォールバック）
    const toEmbedFromOEmbed = async (pageUrl: string, fallbackEmbedUrl: string): Promise<string> => {
        try {
            const o = await fetch(`https://music.apple.com/oembed?url=${encodeURIComponent(pageUrl)}`).catch(() => undefined);
            const js = o && o.ok ? await o.json().catch(() => undefined) : undefined;
            const iframeUrl: string | undefined = js?.iframe_url || js?.html?.match(/src=\"([^\"]+)\"/)?.[1];
            if (iframeUrl) return iframeUrl;
        } catch { /* ignore */ }
        return fallbackEmbedUrl;
    };

    // ページ → HTML取得
    const safeFetchText = async (pageUrl: string, label: string): Promise<string | undefined> => {
        try {
            const res = await fetch(pageUrl, {
                // Apple側はヘッダにより返却内容が変わる場合があるため、ブラウザ相当のヘッダを付与
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36',
                    'Accept-Language': 'ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    // 直接叩くと空になることがあるため、参照元/オリジンも付与（無害）
                    'Referer': 'https://music.apple.com/',
                    'Origin': 'https://music.apple.com',
                } as any,
                redirect: 'follow' as any,
            }).catch((e) => { if (DEBUG) console.warn(`[AppleMusic][fetch:${label}] error`, e); return undefined; });
            if (!res) return undefined;
            if (DEBUG) console.log(`[AppleMusic][fetch:${label}] status`, res.status, pageUrl);
            if (!res.ok) return undefined;
            const text = await res.text();
            if (DEBUG) console.log(`[AppleMusic][fetch:${label}] length`, text.length);
            return text;
        } catch (e) {
            if (DEBUG) console.warn(`[AppleMusic][fetch:${label}] exception`, e);
            return undefined;
        }
    };

    try {
        let u: URL;
        try { u = new URL(url); } catch { if (DEBUG) console.warn('[AppleMusic] URL parse failed'); return undefined; }
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

        // --- playlist: /playlist/{name?}/{plId} ---
        if (/\/(?:[a-z]{2}\/)?playlist\//i.test(u.pathname)) {
            // パス末尾から pl.* を抽出（embed は {name} を含まないパスが安定）
            const plId = [...segs].reverse().find(s => /^pl\./i.test(s));
            if (!plId) { if (DEBUG) console.warn('[AppleMusic][playlist] playlist id not found in path', segs); return undefined; }

            // 1) 通常ページ（そのまま）
            let ids: string[] = [];
            const pageHtml = await safeFetchText(u.toString(), 'page');
            if (pageHtml) ids = extractSongIdsFromHtml(pageHtml, 'page');

            // 2) 埋め込み（パスを name なしに正規化）
            let embedHtml: string | undefined;
            if (ids.length === 0) {
                const embedPath = `/${country}/playlist/${plId}`; // name を除去
                const embedUrl = `https://embed.music.apple.com${embedPath}${u.search}`;
                const oembed = await toEmbedFromOEmbed(`https://music.apple.com${embedPath}${u.search}`, embedUrl);
                embedHtml = await safeFetchText(oembed, 'embed');
                if (embedHtml) ids = extractSongIdsFromHtml(embedHtml, 'embed');
            }

            // 3) さらに widgets 直（保険）
            let widgetsHtml: string | undefined;
            if (ids.length === 0) {
                const widgetsUrl = `https://embed.music.apple.com/${country}/playlist/${plId}${u.search}`;
                widgetsHtml = await safeFetchText(widgetsUrl, 'widgets');
                if (widgetsHtml) ids = extractSongIdsFromHtml(widgetsHtml, 'widgets');
            }

            // 4) MusicKit developerToken をHTMLから抽出し、AMP APIでプレイリストを解決（最後の手段）
            if (ids.length === 0) {
                // いずれかのHTMLソースから developerToken を抜き出す
                const sources: Array<[string, string | undefined]> = [
                    ['page', pageHtml],
                    ['embed', typeof embedHtml !== 'undefined' ? embedHtml : undefined],
                    ['widgets', typeof widgetsHtml !== 'undefined' ? widgetsHtml : undefined],
                ];

                let devToken: string | undefined;
                for (const [lab, src] of sources) {
                    if (!src) continue;
                    // MusicKit.configure({ developerToken: "..." })
                    let m = src.match(/developerToken"?\s*:\s*"([^"]+)"/i) || src.match(/MusicKit\.configure\(\{[^}]*developerToken\s*:\s*"([^"]+)"/i);
                    if (!m) {
                        // window.musicKit || __INITIAL_STATE__ などにJWTがそのまま含まれる場合
                        m = src.match(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/);
                    }
                    if (m) { devToken = m[1] || m[0]; if (DEBUG) console.log(`[AppleMusic][devToken:${lab}] tokenFound=${!!devToken}`); break; }
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
                        }).catch((e) => { if (DEBUG) console.warn('[AppleMusic][amp-api] fetch error', e); return undefined; });

                        if (res && res.ok) {
                            const json: any = await res.json().catch((e) => { if (DEBUG) console.warn('[AppleMusic][amp-api] json error', e); return undefined; });
                            const got = new Set<string>();

                            // 1) relationships.tracks.data[*].id
                            const relData = json?.data?.[0]?.relationships?.tracks?.data;
                            if (Array.isArray(relData)) {
                                for (const it of relData) {
                                    const id = String(it?.id || '');
                                    if (/^\d{6,}$/.test(id)) got.add(id);
                                    // playParams.catalogId
                                    const cid = String(it?.attributes?.playParams?.catalogId || '');
                                    if (/^\d{6,}$/.test(cid)) got.add(cid);
                                }
                            }
                            // 2) included[*] に songs がある場合
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

                            if (got.size > 0) {
                                ids = Array.from(got);
                                if (DEBUG) console.log('[AppleMusic][amp-api] collected ids', ids.length);
                            } else {
                                if (DEBUG) console.warn('[AppleMusic][amp-api] no track ids in response');
                            }
                        } else {
                            if (DEBUG) console.warn('[AppleMusic][amp-api] status', res?.status);
                        }
                    } catch (e) {
                        if (DEBUG) console.warn('[AppleMusic][amp-api] exception', e);
                    }
                } else {
                    if (DEBUG) console.warn('[AppleMusic][devToken] not found in any html source');
                }

                // 4-2) 環境変数のトークンで AMP API を直接叩く（HTMLから取れない場合の最後の手段）
                if (ids.length === 0) {
                    const envDevToken = process.env.APPLE_MUSIC_DEVELOPER_TOKEN || process.env.APPLE_DEVELOPER_TOKEN || process.env.APPLEMUSIC_DEVELOPER_TOKEN;
                    const envUserToken = process.env.APPLE_MUSIC_USER_TOKEN || process.env.MUSIC_USER_TOKEN || process.env.APPLEMUSIC_USER_TOKEN;
                    if (DEBUG) console.log('[AppleMusic][envToken] dev=', !!envDevToken, 'user=', !!envUserToken);

                    if (envDevToken) {
                        try {
                            // ページング対応: relationships.tracks.next を辿る
                            const collected = new Set<string>();
                            let firstUrl = `https://amp-api.music.apple.com/v1/catalog/${country}/playlists/${plId}?include=tracks&limit=100`;
                            let urlNext: string | undefined = firstUrl;
                            const commonHeaders: Record<string, string> = {
                                'Authorization': `Bearer ${envDevToken}`,
                                'Origin': 'https://music.apple.com',
                                'Referer': `https://music.apple.com/${country}/playlist/${plId}`,
                                'Accept': 'application/json',
                            };
                            if (envUserToken) commonHeaders['Music-User-Token'] = envUserToken;

                            while (urlNext) {
                                const res = await fetch(urlNext, { headers: commonHeaders as any }).catch((e) => { if (DEBUG) console.warn('[AppleMusic][env-amp-api] fetch error', e); return undefined; });
                                if (!res || !res.ok) { if (DEBUG) console.warn('[AppleMusic][env-amp-api] status', res?.status); break; }
                                const json: any = await res.json().catch((e) => { if (DEBUG) console.warn('[AppleMusic][env-amp-api] json error', e); return undefined; });
                                if (!json) break;

                                // collect ids
                                const rel = json?.data?.[0]?.relationships?.tracks;
                                const relData = rel?.data;
                                if (Array.isArray(relData)) {
                                    for (const it of relData) {
                                        const id = String(it?.id || '');
                                        if (/^\d{6,}$/.test(id)) collected.add(id);
                                        const cid = String(it?.attributes?.playParams?.catalogId || '');
                                        if (/^\d{6,}$/.test(cid)) collected.add(cid);
                                    }
                                }
                                const included = json?.included;
                                if (Array.isArray(included)) {
                                    for (const it of included) {
                                        if (it?.type === 'songs') {
                                            const id = String(it?.id || '');
                                            if (/^\d{6,}$/.test(id)) collected.add(id);
                                            const cid = String(it?.attributes?.playParams?.catalogId || '');
                                            if (/^\d{6,}$/.test(cid)) collected.add(cid);
                                        }
                                    }
                                }

                                // next URL
                                const nextHref = rel?.next;
                                urlNext = typeof nextHref === 'string' && nextHref.startsWith('https')
                                    ? nextHref
                                    : (typeof nextHref === 'string' && nextHref.startsWith('/v1/')
                                        ? `https://amp-api.music.apple.com${nextHref}`
                                        : undefined);
                                if (DEBUG) console.log('[AppleMusic][env-amp-api] page collected', collected.size, 'next?', !!urlNext);
                            }

                            if (collected.size > 0) {
                                ids = Array.from(collected);
                                if (DEBUG) console.log('[AppleMusic][env-amp-api] collected ids', ids.length);
                            }
                        } catch (e) {
                            if (DEBUG) console.warn('[AppleMusic][env-amp-api] exception', e);
                        }
                    } else {
                        if (DEBUG) console.warn('[AppleMusic][envToken] developer token not set');
                    }
                }
            }

            if (DEBUG) console.log('[AppleMusic][playlist] collected ids', ids.length);
            return ids.length ? ids.map(id => buildSongUrl(country, id)) : undefined;
        }

        // --- 後方互換: テキストURLからの素朴抽出 ---
        const mParam = url.match(/[?&]i=(\d{6,})/);
        if (mParam) return [`https://music.apple.com/${country}/song/${mParam[1]}`];
        const mSong2 = url.match(/music\.apple\.com\/[a-z]{2}\/song\/(\d{6,})/i);
        if (mSong2) return [`https://music.apple.com/${country}/song/${mSong2[1]}`];

        return undefined;
    } catch (e) {
        console.error('[AppleMusic] parse error', e); // 本当に致命的な場合のみ
        return undefined;
    }
}
