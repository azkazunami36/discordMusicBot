import { Interaction, SlashCommandBuilder, CacheType, Message, Guild, GuildMember, APIInteractionGuildMember, MessageType } from "discord.js";
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
import { urlToQueue } from "../funcs/urlToQueue.js";
import { progressBar } from "../createByChatGPT/progressBar.js";

export const command = new SlashCommandBuilder()
    .setName("add")
    .setDescription("曲を追加します。")
    .addStringOption(option => option
        .setName("text")
        .setDescription("音楽を追加することができます。URLまたは検索したいタイトルを入力してください。")
        .setRequired(true)
    )
    .addStringOption(option => option
        .setName("service")
        .setDescription("優先するサービスです。動画URLだけどプレイリストがあったら取得したいときはプレイリストを選択します。検索次に優先したいサービスがあれば、それを選択します。")
        .addChoices(
            { name: "YouTube", value: "youtube" },
            { name: "YouTubeプレイリスト", value: "youtubePlaylist" },
            { name: "ニコニコ動画", value: "niconico" },
            { name: "X", value: "twitter" }
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
        if (data === null) return await message.edit({ embeds: [messageEmbedGet("追加したい曲が指定されませんでした。入力してから追加を行なってください。", interaction.client)] });
        const priority = interaction.options.getString("service");
        await urlToQueue(data, guildData, priority, message, async (percent, status, playlist, option) => {
            switch (status) {
                case "analyzing": {
                    await message.edit({ embeds: [messageEmbedGet("文字列を分析しています..." + option.analyzed + "個解析済みです。\n" + (Math.floor(percent * 10) / 10) + "%`" + progressBar(percent, 35) + "`", interaction.client)] });
                    break;
                }
                case "searching": {
                    await message.edit({ embeds: [messageEmbedGet("検索しています...\n" + (Math.floor(percent * 10) / 10) + "%`" + progressBar(percent, 35) + "`", interaction.client)] });
                    break;
                }
                case "checkAndDownloading": {
                    await message.edit({ embeds: [messageEmbedGet("取得したデータ" + option.analyzed + "個を解析・ダウンロードしています..." + (playlist || []).length + "曲はキューに追加済みで、再生が可能です。" + "\n" + (Math.floor(percent * 10) / 10) + "%`" + progressBar(percent, 35) + "`", interaction.client)] });
                    break;
                }
                case "done": {
                    await message.edit(await videoInfoEmbedGet(playlist || [], "曲を追加しました。", interaction.client));
                    break;
                }
                case "failed": {
                    await message.edit({ embeds: [messageEmbedGet("次のテキストは解析ができず、キューに追加できませんでした。\n`" + data + "`", interaction.client)] });
                    break;
                }
            }
        });

    }
}

