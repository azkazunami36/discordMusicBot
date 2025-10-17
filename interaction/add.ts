import { Interaction, SlashCommandBuilder, CacheType } from "discord.js";
import ytdl from "ytdl-core";
import yts from "yt-search";

import { InteractionInputData } from "../interface.js";
import { EnvData, Playlist, VideoMetaCache } from "../envJSON.js";
import { VariableExistCheck } from "../variableExistCheck.js";
import { parseNicoVideo, searchNicoVideo } from "../niconico.js";
import { messageEmbedGet, videoInfoEmbedGet } from "../embed.js";
import { parseTweetId } from "../twitter.js";
import { fetchPlaylistVideoIdsFromUrl } from "../youtube.js";
import { sourcePathManager } from "../sourcePathManager.js";

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
        for (const word of words) {
            wordCheckProcessed++;
            if (word === "") continue;
            const nowTime = Date.now();
            if (nowTime - sendTime > 2000) {
                sendTime = nowTime;
                await interaction.editReply({ embeds: [messageEmbedGet("ステップ１/４: 文字列を分析中...(" + wordCheckProcessed + "/" + words.length + ")", interaction.client)] });
            }
            let videoIdData: Playlist | undefined;
            const resolvedId = await fetchPlaylistVideoIdsFromUrl(word);
            let nicovideoIdData: Playlist | undefined;
            if (ytdl.validateURL(word)) videoIdData = {
                type: "videoId",
                body: ytdl.getURLVideoID(word)
            };
            if (!videoIdData && ytdl.validateURL("https://youtu.be/" + word)) videoIdData = {
                type: "videoId",
                body: ytdl.getURLVideoID("https://youtu.be/" + word)
            };
            const nicovideoId = parseNicoVideo(word);
            if (nicovideoId) nicovideoIdData = {
                type: "nicovideoId",
                body: nicovideoId
            };
            if (videoIdData && !(resolvedId && resolvedId.videoIds.length !== 0 && priority === "youtubePlaylist")) {
                getContents.push(videoIdData);
                continue;
            }
            if (nicovideoIdData) {
                getContents.push(nicovideoIdData);
                continue;
            }
            const spotifyUrls = await parseSpotifyUrl(word);
            if (spotifyUrls) {
                let spotifyCheckProcessed = 0;
                const result: { type: "videoId", body: string }[] = [];
                for (const spotifyUrl of spotifyUrls) {
                    spotifyCheckProcessed++;
                    const nowTime = Date.now();
                    if (nowTime - sendTime > 2000) {
                        sendTime = nowTime;
                        await interaction.editReply({ embeds: [messageEmbedGet("ステップ１/４: 文字列を分析中...(" + wordCheckProcessed + "/" + words.length + ") in Spotify URLを元にYouTubeで曲を検索・抽出中...(" + spotifyCheckProcessed + "/" + spotifyUrls.length + ")", interaction.client)] });
                    }
                    try {
                        const videoId = await videoMetaCache.spotifyToYouTubeId(spotifyUrl);
                        if (videoId) {
                            result.push({ type: "videoId", body: videoId });
                        } else console.log("次のSpotify URLは解析に失敗しました。: ", spotifyUrl);
                    } catch (e) {
                        console.log("次のSpotify URLは解析中にエラーとなりました。: ", spotifyUrl, e);
                    }
                }
                if (result.length > 0) {
                    getContents.push(...result);
                } else console.log("次のSpotify URLは解析に失敗しました。: ", spotifyUrls);
                continue;
            }
            const appleMusicUrls = await parseAppleMusicUrl(word);
            if (appleMusicUrls) {
                let appleMusicCheckProcessed = 0;
                const result: { type: "videoId", body: string }[] = [];
                for (const appleMusicUrl of appleMusicUrls) {
                    appleMusicCheckProcessed++;
                    const nowTime = Date.now();
                    if (nowTime - sendTime > 2000) {
                        sendTime = nowTime;
                        await interaction.editReply({ embeds: [messageEmbedGet("ステップ１/４: 文字列を分析中...(" + wordCheckProcessed + "/" + words.length + ") in Apple Music URLを元にYouTubeで曲を検索・抽出中...(" + appleMusicCheckProcessed + "/" + appleMusicUrls.length + ")", interaction.client)] });
                    }
                    try {
                        const videoId = await videoMetaCache.appleMusicToYouTubeId(appleMusicUrl);
                        if (videoId) {
                            result.push({ type: "videoId", body: videoId });
                        } else console.log("次のApple Music URLは解析に失敗しました。: ", appleMusicUrl);
                    } catch (e) {
                        console.log("次のApple Music URLは解析中にエラーとなりました。: ", appleMusicUrl, e);
                    }
                }
                if (result.length > 0) {
                    getContents.push(...result);
                } else console.log("次のApple Music URLは解析に失敗しました。: ", appleMusicUrls);
                continue;
            }
            if (resolvedId) {
                if (!playlistCheckingStatusSendedIs) {
                    playlistCheckingStatusSendedIs = true;
                }
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
            searchWords += searchWords === "" ? word : " " + word;
        }
        if (searchWords) {
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
            console.error("認識失敗: ", data);
            return await interaction.editReply({ embeds: [messageEmbedGet("`" + data + "`は有効な内容として認識することができず、追加ができませんでした。再度追加するか、botの作成者に相談してください。", interaction.client)] });
        }
        // 追加
        const truePlaylist: Playlist[] = [];
        let trueCheckProcessed = 0;
        for (const playlistData of getContents) {
            trueCheckProcessed++;
            const nowTime = Date.now();
            if (nowTime - sendTime > 2000) {
                sendTime = nowTime;
                await interaction.editReply({ embeds: [messageEmbedGet("ステップ３/４: 取得した動画の有効性をチェック中...(" + trueCheckProcessed + "/" + getContents.length + ")", interaction.client)] });
            }
            sourcePathManager.getAudioPath(playlistData).catch(e => console.error("addコマンドで次の動画のダウンロードができませんでした。", playlistData, e))
            if (await videoMetaCache.cacheGet(playlistData)) {
                truePlaylist.push(playlistData);
            }
        }
        playlist.push(...truePlaylist);
        const envData = new EnvData(guildData.guildId);
        envData.playlistSave(playlist);

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
    const buildSongUrl = (country: string, trackId: string) => `https://music.apple.com/${country}/song/${trackId}`;

    try {
        const u = new URL(url);
        if (!/music\.apple\.com$/i.test(u.hostname)) return undefined;

        const country = (u.pathname.split("/").filter(Boolean)[0] || "us").toLowerCase();

        // --- song 判定: 明示の /song/{id} ---
        const mSong = u.pathname.match(/\/song\/(\d+)/i);
        if (mSong) return [buildSongUrl(country, mSong[1])];

        // --- album 内のクエリ ?i=trackId （アルバム+曲の両方が含まれる）---
        const paramI = u.searchParams.get("i");
        if (paramI && /^\d+$/.test(paramI)) {
            return [buildSongUrl(country, paramI)];
        }

        // --- album: iTunes Lookup で展開 ---
        const mAlbum = u.pathname.match(/\/album\/(?:[^/]+\/)?(\d+)/i);
        if (mAlbum) {
            const albumId = mAlbum[1];
            try {
                const lookup = await fetch(`https://itunes.apple.com/lookup?id=${albumId}&entity=song&country=${country}`).catch(() => undefined);
                if (!lookup || !lookup.ok) return undefined;
                const data: any = await lookup.json().catch(() => undefined);
                const tracks: string[] = Array.isArray(data?.results)
                    ? data.results
                        .filter((r: any) => r.wrapperType === "track" && r.trackId)
                        .map((r: any) => buildSongUrl(country, String(r.trackId)))
                    : [];
                return tracks.length ? tracks : undefined;
            } catch {
                return undefined;
            }
        }

        // --- playlist(公開): ページHTMLから /song/{id} を抽出 ---
        // 形式例: /playlist/プレイリスト名/pl.u-xxxx or /playlist/{name}/pl.{hash}
        const isPlaylist = /\/playlist\//i.test(u.pathname);
        if (isPlaylist) {
            try {
                // 通常ページを取得
                const res = await fetch(url).catch(() => undefined);
                if (!res || !res.ok) return undefined;
                const html = await res.text();

                // HTML 内に出現する曲リンクを収集（国はURL先頭のものを使用）
                const ids = Array.from(new Set(
                    Array.from(html.matchAll(/\/song\/(\d+)/gi)).map(m => m[1])
                ));
                if (ids.length) {
                    return ids.map(id => buildSongUrl(country, id));
                }

                // 代替: itunes.apple.com の trackId が JSON で含まれている場合にも対応
                const ids2 = Array.from(new Set(
                    Array.from(html.matchAll(/"trackId"\s*:\s*(\d+)/gi)).map(m => m[1])
                ));
                if (ids2.length) {
                    return ids2.map(id => buildSongUrl(country, id));
                }

                return undefined;
            } catch {
                return undefined;
            }
        }

        return undefined;
    } catch {
        // 旧来の後方互換（単純な正規表現）
        const mParam = url.match(/[?&]i=(\d+)/);
        if (mParam) return [`https://music.apple.com/us/song/${mParam[1]}`];

        const mSong2 = url.match(/music\.apple\.com\/[a-z]{2}\/song\/(\d+)/i);
        if (mSong2) return [mSong2[0]];

        const mAlbum2 = url.match(/music\.apple\.com\/([a-z]{2})\/album\/(?:[^/]+\/)?(\d+)/i);
        if (mAlbum2) {
            // 失敗時はアルバムURLのまま返さず undefined
            return undefined;
        }
        return undefined;
    }
}

