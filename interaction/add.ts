import { Interaction, SlashCommandBuilder, CacheType, EmbedBuilder } from "discord.js";
import ytdl from "ytdl-core";
import yts from "yt-search";

import { InteractionInputData } from "../interface.js";
import { EnvData, Playlist, VideoMetaCache } from "../envJSON.js";
import { VariableExistCheck } from "../variableExistCheck.js";
import { parseNicoVideo, searchNicoVideo } from "../niconico.js";
import { messageEmbedGet, videoInfoEmbedGet } from "../embed.js";
import { parseTweetId } from "../twitter.js";
import { fetchPlaylistVideoIdsFromUrl } from "../youtube.js";

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
        await interaction.editReply({ embeds: [messageEmbedGet("文字列を分析中...", interaction.client)] });
        let playlistCheckingStatusSendedIs = false;
        const videoMetaCache = new VideoMetaCache();
        for (const word of words) {
            if (word === "") continue;
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
                for (const spotifyUrl of spotifyUrls) {
                    try {
                        const videoId = await videoMetaCache.spotifyToYouTubeId(spotifyUrl);
                        if (videoId) {
                            getContents.push({ type: "videoId", body: videoId });
                        }
                    } catch {
                        // 正常動作時に起こり得るエラーは非表示（最終エラー時のみ外側で通知）
                    }
                }
            }
            const appleMusicUrls = await parseAppleMusicUrl(word);
            if (appleMusicUrls) {
                for (const appleMusicUrl of appleMusicUrls) {
                    try {
                        const videoId = await videoMetaCache.appleMusicToYouTubeId(appleMusicUrl);
                        if (videoId) {
                            getContents.push({ type: "videoId", body: videoId });
                        }
                    } catch {
                        // 正常動作時に起こり得るエラーは非表示（最終エラー時のみ外側で通知）
                    }
                }
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
            await interaction.editReply({ embeds: [messageEmbedGet("検索中...", interaction.client)] });
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
            else if (priority === "youtube") youtubeData ? getContents.push(youtubeData) : niconicoData ? getContents.push(niconicoData) : "";
        }

        if (getContents.length <= 0) return await interaction.editReply({ embeds: [messageEmbedGet("`" + data + "`は有効な内容として認識することができず、追加ができませんでした。再度追加するか、botの作成者に相談してください。", interaction.client)] });
        // 追加
        const truePlaylist: Playlist[] = [];
        let processed = 0;
        let sendTime = 0;
        for (const playlistData of getContents) {
            processed++;
            const nowTime = Date.now();
            if (nowTime - sendTime > 2000) {
                sendTime = nowTime;
                await interaction.editReply({ embeds: [messageEmbedGet("取得した動画の有効性をチェック中...(" + processed + "/" + getContents.length + ")", interaction.client)] });
            }
            if (await videoMetaCache.cacheGet(playlistData)) truePlaylist.push(playlistData);
        }
        playlist.push(...truePlaylist);
        const envData = new EnvData(guildData.guildId);
        envData.playlistSave(playlist);

        await interaction.editReply({ embeds: [messageEmbedGet("取得操作が完了し、結果レポート作成中...", interaction.client)] });
        const embed = await videoInfoEmbedGet(truePlaylist, (truePlaylist.length === 1 ? "" : truePlaylist.length) + "曲が追加されました。", interaction.client);
        await interaction.editReply({ embeds: [embed] });
    }
}

/**
 * SpotifyのURLを解析します。
 * - トラックURLの場合：単一の曲URLを配列で返します。
 * - アルバムURLの場合：アルバムの全トラックURLを配列で返します。
 * - URLがトラックとアルバムを両方含む場合は、トラックのみ返します。
 * - 無効または非対応の場合は undefined を返します。
 */
async function parseSpotifyUrl(url: string): Promise<string[] | undefined> {
    try {
        // 1) URL を正規に分解して判定（/intl-xx/ や /embed/ などを吸収）
        const u = new URL(url);
        if (!/\.spotify\.com$/i.test(u.hostname)) return undefined;

        // 例: /intl-ja/track/{id} /track/{id} /embed/track/{id}
        const segs = u.pathname.split("/").filter(Boolean);
        const head = segs[0] || "";
        let i = 0;
        if (/^intl-[a-z]{2}$/i.test(head) || head.toLowerCase() === "embed") {
            i = 1;
        }

        const kind = (segs[i] || "").toLowerCase();
        const id = segs[i + 1] || "";

        const highlight = u.searchParams.get("highlight"); // e.g. highlight=spotify:track:{id}
        const highlightIdMatch = highlight?.match(/spotify:track:([A-Za-z0-9]{22})/);
        if (highlightIdMatch) {
            return [`https://open.spotify.com/track/${highlightIdMatch[1]}`];
        }

        if (kind === "track" && /^[A-Za-z0-9]{22}$/.test(id)) {
            return [`https://open.spotify.com/track/${id}`];
        }

        if (kind === "album" && /^[A-Za-z0-9]{22}$/.test(id)) {
            const albumId = id;
            // 2) アルバム → oEmbed から iframe_url を取り、embed HTML を解析してトラックIDを抽出（APIトークン不要）
            try {
                const oembedRes = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(`https://open.spotify.com/album/${albumId}`)}`);
                if (!oembedRes.ok) {
                    return [`https://open.spotify.com/album/${albumId}`];
                }
                const oembedJson: any = await oembedRes.json().catch(() => undefined);
                const iframeUrl: string | undefined = oembedJson?.iframe_url || oembedJson?.html?.match(/src="([^"]+)"/)?.[1];

                const embedUrl = iframeUrl || `https://open.spotify.com/embed/album/${albumId}`;
                const embedRes = await fetch(embedUrl).catch(() => undefined);
                if (!embedRes || !embedRes.ok) {
                    return [`https://open.spotify.com/album/${albumId}`];
                }
                const embedHtml = await embedRes.text();

                // embed の HTML 内に /track/{22文字} が多数現れるので、それを一括抽出
                const trackIds = Array.from(new Set(
                    Array.from(embedHtml.matchAll(/\/(?:intl-[a-z]{2}\/)?track\/([A-Za-z0-9]{22})/gi)).map(m => m[1])
                ));

                if (trackIds.length > 0) {
                    return trackIds.map(tid => `https://open.spotify.com/track/${tid}`);
                }

                // さらに保険: JSON 断片中の "uri":"spotify:track:{id}" を拾う
                const uriIds = Array.from(new Set(
                    Array.from(embedHtml.matchAll(/"uri"\s*:\s*"spotify:track:([A-Za-z0-9]{22})"/gi)).map(m => m[1])
                ));
                if (uriIds.length > 0) {
                    return uriIds.map(tid => `https://open.spotify.com/track/${tid}`);
                }

                // 何も取れなければアルバムURLを返す（従来互換）
                return [`https://open.spotify.com/album/${albumId}`];
            } catch {
                return [`https://open.spotify.com/album/${albumId}`];
            }
        }
    } catch {
        // URL として不正なら、旧正規表現での後方互換フォールバック
        // /intl-xx/ を考慮
        const matchTrack = url.match(/spotify\.com\/(?:intl-[a-z]{2}\/)?(?:embed\/)?track\/([A-Za-z0-9]{22})/i);
        const matchAlbum = url.match(/spotify\.com\/(?:intl-[a-z]{2}\/)?(?:embed\/)?album\/([A-Za-z0-9]{22})/i);
        const matchQueryTrackInAlbum = url.match(/[?&]highlight=spotify:track:([A-Za-z0-9]{22})/i);
        if (matchTrack) return [`https://open.spotify.com/track/${matchTrack[1]}`];
        if (matchQueryTrackInAlbum) return [`https://open.spotify.com/track/${matchQueryTrackInAlbum[1]}`];
        if (matchAlbum) return [`https://open.spotify.com/album/${matchAlbum[1]}`];
    }
    return undefined;
}

/**
 * Apple MusicのURLを解析します。
 * - トラックURLの場合：単一の曲URLを配列で返します。
 * - アルバムURLの場合：アルバム内トラックのURL配列を返します。
 * - アルバムとトラックが両方含まれるURLなら、トラックのみ返します。
 * - 無効または非対応の場合は undefined を返します。
 */
async function parseAppleMusicUrl(url: string): Promise<string[] | undefined> {
    try {
        const matchTrackParam = url.match(/[?&]i=(\d+)/);
        const matchAlbum = url.match(/music\.apple\.com\/([a-z]{2})\/album\/.+\/(\d+)/);
        if (matchTrackParam) return [url];
        if (matchAlbum) {
            const countryMatch = url.match(/music\.apple\.com\/([a-z]{2})\//);
            const country = countryMatch ? countryMatch[1] : 'us';
            const albumId = matchAlbum[2];
            const lookup = await fetch(`https://itunes.apple.com/lookup?id=${albumId}&entity=song&country=${country}`);
            if (!lookup.ok) return [`https://music.apple.com/${country}/album/${albumId}`];
            const data = await lookup.json().catch(() => undefined);
            if (!data || !data.results) return [`https://music.apple.com/${country}/album/${albumId}`];
            const tracks = data.results
                .filter((r: any) => r.wrapperType === 'track')
                .map((r: any) => `https://music.apple.com/${country}/song/${r.trackId}`);
            return tracks.length ? tracks : [`https://music.apple.com/${country}/album/${albumId}`];
        }
    } catch { }
    return undefined;
}

