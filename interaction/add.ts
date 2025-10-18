import { Interaction, SlashCommandBuilder, CacheType } from "discord.js";
import ytdl from "ytdl-core";
import yts from "yt-search";

import { InteractionInputData } from "../interface.js";
import { EnvData, Playlist, VideoMetaCache } from "../envJSON.js";
import { VariableExistCheck } from "../variableExistCheck.js";
import { getNicoMylistIds, parseNicoVideo, searchNicoVideo } from "../niconico.js";
import { messageEmbedGet, videoInfoEmbedGet } from "../embed.js";
import { parseTweetId } from "../twitter.js";
import { fetchPlaylistVideoIdsFromUrl } from "../youtube.js";
import { sourcePathManager } from "../sourcePathManager.js";
import { SumLog } from "../sumLog.js";
import { numberToTimeString } from "../numberToTimeString.js";

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

export async function execute(interaction: Interaction<CacheType>, inputData: InteractionInputData) {
    if (interaction.isChatInputCommand()) {
        /** 検索するテキストデータ */
        const data = interaction.options.getString("text");
        const variableExistCheck = new VariableExistCheck(interaction);
        const guildData = await variableExistCheck.guild();
        if (!guildData) return;
        const playlist = await variableExistCheck.playlist();
        if (!playlist) return;
        if (data === null) return await interaction.editReply({ embeds: [messageEmbedGet("追加したい曲が指定されませんでした。入力してから追加を行なってください。", interaction.client)] });
        if (data === "") return await interaction.editReply({ embeds: [messageEmbedGet("内容が空です。入力してから追加をしてください。", interaction.client)] });
        const priority = interaction.options.getString("service");
        /** まずスペースで分割 */
        const words = data.split(/[ 　]+/);
        /** IDやURLとして認識できない単語をここにまとめる */
        let searchWords = "";
        /** 取得できたVideoIDやニコニコ動画のIDをここにまとめます。 */
        const getContents: Playlist[] = [];
        await interaction.editReply({ embeds: [messageEmbedGet("ステップ１/４: 文字列を分析中...(1/" + words.length + ")", interaction.client)] });
        let playlistCheckingStatusSendedIs = false;
        const videoMetaCache = new VideoMetaCache();
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
                await interaction.editReply({ embeds: [messageEmbedGet("ステップ１/４: 文字列を分析中...(" + wordCheckProcessed + "/" + words.length + ")", interaction.client)] });
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
            const spotifyUrls = await parseSpotifyUrl(word);
            if (spotifyUrls) {
                const startTime = Date.now();
                SumLog.log(word + "はSpotifyのURLです。解析を開始します。リストは次です。\n" + spotifyUrls, suminfo);
                let spotifyCheckProcessed = 0;
                const result: { type: "videoId", body: string }[] = [];
                const processTimes: number[] = [];
                for (const spotifyUrl of spotifyUrls) {
                    spotifyCheckProcessed++;
                    const nowTime = Date.now();
                    if (nowTime - sendTime > 2000) {
                        sendTime = nowTime;
                        await interaction.editReply({
                            embeds: [messageEmbedGet("ステップ１/４: 文字列を分析中...(" + wordCheckProcessed + "/" + words.length + ") in Spotify URLを元にYouTubeで曲を検索・抽出中...(" + spotifyCheckProcessed + "/" + spotifyUrls.length + ")" +
                                (processTimes.length !== 0 ? "抽出が終わるまで残り約" + numberToTimeString((processTimes.reduce((a, b) => a + b, 0) / processTimes.length / 1000) * (spotifyUrls.length - spotifyCheckProcessed)) : ""), interaction.client)]
                        });
                    }
                    try {
                        const videoId = await videoMetaCache.spotifyToYouTubeId(spotifyUrl);
                        if (videoId) {
                            result.push({ type: "videoId", body: videoId });
                            SumLog.log(spotifyUrl + "は" + videoId + "に変換されました。", suminfo);
                        } else {
                            console.log("次のSpotify URLは解析に失敗しました。: ", spotifyUrl);
                            SumLog.error(spotifyUrl + "はSpotifyのURLとして解析ができませんでした。", suminfo);
                        }
                    } catch (e) {
                        console.log("次のSpotify URLは解析中にエラーとなりました。: ", spotifyUrl, e);
                        SumLog.error(spotifyUrl + "をSpotifyのURLとして解析する途中にエラーが発生しました。", suminfo);
                    }
                    if (processTimes.length > 6) processTimes.pop();
                    processTimes.push(Date.now() - nowTime);
                }
                if (result.length > 0) {
                    getContents.push(...result);
                } else {
                    console.log("次のSpotify URLは解析に失敗しました。: ", spotifyUrls);
                    SumLog.error(word + "はSpotifyのURLとして解析できませんでした。", suminfo);
                }
                SumLog.log(word + "をSpotifyのURLとして処理するのにかかった時間は" + ((Date.now() - startTime) / 1000) + "秒です。", suminfo);
                continue;
            }
            const appleMusicUrls = await parseAppleMusicUrl(word);
            if (appleMusicUrls) {
                const startTime = Date.now();
                SumLog.log(word + "はApple MusicのURLです。解析を開始します。リストは次です。\n" + appleMusicUrls, suminfo);
                let appleMusicCheckProcessed = 0;
                const result: { type: "videoId", body: string }[] = [];
                const processTimes: number[] = [];
                for (const appleMusicUrl of appleMusicUrls) {
                    appleMusicCheckProcessed++;
                    const nowTime = Date.now();
                    if (nowTime - sendTime > 2000) {
                        sendTime = nowTime;
                        await interaction.editReply({
                            embeds: [messageEmbedGet("ステップ１/４: 文字列を分析中...(" + wordCheckProcessed + "/" + words.length + ") in Apple Music URLを元にYouTubeで曲を検索・抽出中...(" + appleMusicCheckProcessed + "/" + appleMusicUrls.length + ")" +
                                (processTimes.length !== 0 ? "抽出が終わるまで残り約" + numberToTimeString((processTimes.reduce((a, b) => a + b, 0) / processTimes.length / 1000) * (appleMusicUrls.length - appleMusicCheckProcessed)) : ""), interaction.client)]
                        });
                    }
                    try {
                        const videoId = await videoMetaCache.appleMusicToYouTubeId(appleMusicUrl);
                        if (videoId) {
                            result.push({ type: "videoId", body: videoId });
                            SumLog.log(appleMusicUrl + "は" + videoId + "に変換されました。", suminfo);
                        } else {
                            console.log("次のApple Music URLは解析に失敗しました。: ", appleMusicUrl);
                            SumLog.error(appleMusicUrl + "はApple MusicのURLとして解析ができませんでした。", suminfo);
                        }
                    } catch (e) {
                        console.log("次のApple Music URLは解析中にエラーとなりました。: ", appleMusicUrl, e);
                        SumLog.error(appleMusicUrl + "をApple MusicのURLとして解析する途中にエラーが発生しました。", suminfo);
                    }
                    if (processTimes.length > 6) processTimes.pop();
                    processTimes.push(Date.now() - nowTime);
                }
                if (result.length > 0) {
                    getContents.push(...result);
                } else {
                    console.log("次のApple Music URLは解析に失敗しました。: ", appleMusicUrls);
                    SumLog.error(word + "はApple MusicのURLとして解析できませんでした。", suminfo);
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
            await interaction.editReply({ embeds: [messageEmbedGet("ステップ２/４: 検索中...", interaction.client)] });
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

        if (getContents.length <= 0) {
            SumLog.error(data + "はどのような手段を用いても取得ができませんでした。", suminfo);
            console.error("認識失敗: ", data);
            return await interaction.editReply({ embeds: [messageEmbedGet("`" + data + "`は有効な内容として認識することができず、追加ができませんでした。再度追加するか、botの作成者に相談してください。", interaction.client)] });
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
                await interaction.editReply({
                    embeds: [messageEmbedGet("ステップ３/４: 取得した動画の有効性をチェック中...(" + trueCheckProcessed + "/" + getContents.length + ")" +
                        (processTimes.length !== 0 ? "チェックが終わるまで残り約" + numberToTimeString((processTimes.reduce((a, b) => a + b, 0) / processTimes.length / 1000) * (getContents.length - trueCheckProcessed)) : ""), interaction.client)]
                });
            }
            sourcePathManager.getAudioPath(playlistData).catch(e => {
                SumLog.error(playlistData.body + "のダウンロードでエラーが発生しました。", suminfo);
                console.error("addコマンドで次の動画のダウンロードができませんでした。", playlistData, e);
            });
            if (await videoMetaCache.cacheGet(playlistData)) {
                if (processTimes.length > 50) processTimes.pop();
                processTimes.push(Date.now() - nowTime); truePlaylist.push(playlistData);
            }
        }
        playlist.push(...truePlaylist);
        const envData = new EnvData(guildData.guildId);
        envData.playlistSave(playlist);

        SumLog.log(data + "を追加する処理が完了しました。", suminfo);
        await interaction.editReply({ embeds: [messageEmbedGet("ステップ４/４: 取得操作が完了し、結果レポート作成中...", interaction.client)] });
        const embed = await videoInfoEmbedGet(truePlaylist, (truePlaylist.length === 1 ? "" : truePlaylist.length) + "曲が追加されました。", interaction.client);
        await interaction.editReply({ embeds: [embed] });
    }
}

// ここからしたChatGPT.

/**
 * SpotifyのURLを「曲URLの配列」に正規化します。
 * - track: その曲だけ
 * - album: 収録曲すべて（embedページから抽出）
 * - playlist: 収録曲すべて（embedページから抽出）
 * - artist: 人気の曲（embedページから抽出）
 * - user/playlist, /embed/, /intl-xx/ などのバリアント、短縮URL(spotify.link / spoti.fi)も解決
 * - 解析に失敗した場合は undefined を返します（アルバム/プレイリストで曲列挙に失敗した場合は元URLを返さず undefined）
 */
async function parseSpotifyUrl(url: string): Promise<string[] | undefined> {
    const normalizeShort = async (raw: string): Promise<string> => {
        try {
            const u0 = new URL(raw);
            if (!/^(?:spoti\.fi|spotify\.link)$/i.test(u0.hostname)) return raw;
            // リダイレクトを追って最終URLを取得
            const res = await fetch(raw, { redirect: "follow" as any });
            // fetch が追跡後の最終URLを持つ
            const finalUrl = (res && typeof res.url === "string" && res.url) ? res.url : raw;
            return finalUrl;
        } catch {
            return raw;
        }
    };

    const toTrackUrlsFromEmbed = async (embedUrl: string): Promise<string[] | undefined> => {
        try {
            const res = await fetch(embedUrl).catch(() => undefined);
            if (!res || !res.ok) return undefined;
            const html = await res.text();

            // /track/{22} を抽出（intl-ja 等も許容）
            const idsA = Array.from(new Set(
                Array.from(html.matchAll(/\/(?:intl-[a-z]{2}\/)?track\/([A-Za-z0-9]{22})/gi)).map(m => m[1])
            ));
            // JSON 内の "uri":"spotify:track:xxxxx"
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

    try {
        const resolved = await normalizeShort(url);
        let u: URL;
        try { u = new URL(resolved); } catch { return undefined; }
        if (!/\.spotify\.com$/i.test(u.hostname) && !/^(?:spoti\.fi|spotify\.link)$/i.test(u.hostname)) return undefined;

        // /intl-xx/ や /embed/ をスキップして種別判定
        const segs = u.pathname.split("/").filter(Boolean);
        let i = 0;
        const head = segs[0]?.toLowerCase() || "";
        if (/^intl-[a-z]{2}$/i.test(head) || head === "embed") i = 1;

        const kind = (segs[i] || "").toLowerCase();
        const id = segs[i + 1] || "";

        // playlist URL が user 経由のこともある: /user/{uid}/playlist/{id}
        // その場合は head が "user"、次が "playlist"
        let playlistId: string | undefined;
        if (kind === "user" && (segs[i + 1] || "").length > 0 && (segs[i + 2] || "").toLowerCase() === "playlist") {
            playlistId = segs[i + 3] || "";
        }

        // ハイライト（アルバム/プレイリスト内で特定曲を指す）
        const highlight = u.searchParams.get("highlight"); // e.g. spotify:track:{id}
        const highlightId = highlight?.match(/spotify:track:([A-Za-z0-9]{22})/)?.[1];

        // --- track ---
        if (kind === "track" && /^[A-Za-z0-9]{22}$/.test(id)) {
            return [`https://open.spotify.com/track/${id}`];
        }

        // --- album ---
        if (kind === "album" && /^[A-Za-z0-9]{22}$/.test(id)) {
            if (highlightId) return [`https://open.spotify.com/track/${highlightId}`];
            const pageUrl = `https://open.spotify.com/album/${id}`;
            const embedUrl = await toEmbedFromOEmbed(pageUrl, `https://open.spotify.com/embed/album/${id}`);
            const tracks = await toTrackUrlsFromEmbed(embedUrl);
            return tracks ?? undefined;
        }

        // --- playlist (直/ユーザー経由/intl/embed) ---
        if ((kind === "playlist" && /^[A-Za-z0-9]{22}$/.test(id)) || (playlistId && /^[A-Za-z0-9]{22}$/.test(playlistId))) {
            const pid = kind === "playlist" ? id : (playlistId as string);
            if (highlightId) return [`https://open.spotify.com/track/${highlightId}`];
            const pageUrl = `https://open.spotify.com/playlist/${pid}`;
            const embedUrl = await toEmbedFromOEmbed(pageUrl, `https://open.spotify.com/embed/playlist/${pid}`);
            const tracks = await toTrackUrlsFromEmbed(embedUrl);
            return tracks ?? undefined;
        }

        // --- artist（人気の曲を列挙：embed/artist/{id} から抽出） ---
        if (kind === "artist" && /^[A-Za-z0-9]{22}$/.test(id)) {
            const pageUrl = `https://open.spotify.com/artist/${id}`;
            const embedUrl = await toEmbedFromOEmbed(pageUrl, `https://open.spotify.com/embed/artist/${id}`);
            const tracks = await toTrackUrlsFromEmbed(embedUrl);
            return tracks ?? undefined;
        }

        // 後方互換: 正規表現で拾えるもの（track/album/playlist/artist）
        const mTrack = resolved.match(/spotify\.com\/(?:intl-[a-z]{2}\/)?(?:embed\/)?track\/([A-Za-z0-9]{22})/i);
        if (mTrack) return [`https://open.spotify.com/track/${mTrack[1]}`];

        const mAlbum = resolved.match(/spotify\.com\/(?:intl-[a-z]{2}\/)?(?:embed\/)?album\/([A-Za-z0-9]{22})/i);
        if (mAlbum) {
            const embedUrl = `https://open.spotify.com/embed/album/${mAlbum[1]}`;
            const tracks = await toTrackUrlsFromEmbed(embedUrl);
            return tracks ?? undefined;
        }

        const mPlaylist = resolved.match(/spotify\.com\/(?:intl-[a-z]{2}\/)?(?:(?:user\/[^/]+\/)?|(?:embed\/)?)playlist\/([A-Za-z0-9]{22})/i);
        if (mPlaylist) {
            const embedUrl = `https://open.spotify.com/embed/playlist/${mPlaylist[1]}`;
            const tracks = await toTrackUrlsFromEmbed(embedUrl);
            return tracks ?? undefined;
        }

        const mArtist = resolved.match(/spotify\.com\/(?:intl-[a-z]{2}\/)?(?:embed\/)?artist\/([A-Za-z0-9]{22})/i);
        if (mArtist) {
            const embedUrl = `https://open.spotify.com/embed/artist/${mArtist[1]}`;
            const tracks = await toTrackUrlsFromEmbed(embedUrl);
            return tracks ?? undefined;
        }

        // アルバムURL上の ?highlight=spotify:track:xxxxx
        const mHighlight = resolved.match(/[?&]highlight=spotify:track:([A-Za-z0-9]{22})/i);
        if (mHighlight) return [`https://open.spotify.com/track/${mHighlight[1]}`];

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

