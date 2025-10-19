import { Interaction, SlashCommandBuilder, CacheType, Message } from "discord.js";
import ytdl from "ytdl-core";
import yts from "yt-search";

import { InteractionInputData } from "../funcs/interface.js";
import { EnvData, Playlist, videoMetaCacheGet } from "../class/envJSON.js";
import { VariableExistCheck } from "../class/variableExistCheck.js";
import { messageEmbedGet, videoInfoEmbedGet } from "../funcs/embed.js";
import { sourcePathManager } from "../class/sourcePathManager.js";
import { SumLog } from "../class/sumLog.js";
import { numberToTimeString } from "../createByChatGPT/numberToTimeString.js";
import { appleChunkHelper } from "../worker/helper/createByChatGPT/appleChunkHelper.js";
import { spotifyChunkHelper } from "../worker/helper/createByChatGPT/spotifyChunkHelper.js";
import { parseSpotifyUrl } from "../worker/helper/createByChatGPT/parseSpotifyUrlHelper.js";
import { parseAppleMusicUrl } from "../worker/helper/createByChatGPT/parseAppleMusicUrlHelper.js";
import { searchNicoVideo } from "../worker/helper/createByChatGPT/searchNicoVideoHelper.js";
import { getNicoMylistIds } from "../worker/helper/createByChatGPT/getNicoMylistIdsHelper.js";
import { parseNicoVideo } from "../createByChatGPT/niconico.js";
import { fetchPlaylistVideoIdsFromUrl } from "../worker/helper/createByChatGPT/youtubePlaylistToVideoIdsHelper.js";

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

