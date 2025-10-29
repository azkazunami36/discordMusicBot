import { Interaction, SlashCommandBuilder, CacheType, Message, Guild, GuildMember, APIInteractionGuildMember, MessageType } from "discord.js";
import ytdl from "ytdl-core";
import yts from "yt-search";

import { InteractionInputData } from "../funcs/interface.js";
import { VariableExistCheck } from "../class/variableExistCheck.js";
import { messageEmbedGet, videoInfoEmbedGet } from "../funcs/embed.js";
import { urlToQueue } from "../funcs/urlToQueue.js";
import { progressBar } from "../createByChatGPT/progressBar.js";
import { EnvData } from "../class/envJSON.js";

export const command = new SlashCommandBuilder()
    .setName("add")
    .setDescription("曲を追加します。")
    .addStringOption(option => option
        .setName("text")
        .setDescription("音楽を追加することができます。URLまたは検索したいタイトルを入力してください。")
        .setRequired(true)
    )
    .addStringOption(option => option
        .setName("type")
        .setDescription("優先する読み取り方法です。動画URLだけどプレイリストがあったら取得したいときはプレイリストを選択します。YouTubeの場合にのみ対応しています。")
        .addChoices(
            { name: "動画", value: "youtube" },
            { name: "プレイリスト", value: "youtubePlaylist" }
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
        const serversData = await variableExistCheck.serverData(inputData.serversDataClass);
        if (!serversData) return;
        if (data === null) return await message.edit({ embeds: [messageEmbedGet("追加したい曲が指定されませんでした。入力してから追加を行なってください。", interaction.client)] });
        const priority = interaction.options.getString("type");
        const focus = Number(data.replace(/[！-～]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)));
        const playlist = serversData.discord.search?.list[focus - 1];
        /** 指定方法が数字であり、かつ検索結果がまだ有効な場合 */
        if (focus) {
            if (focus > 0 && playlist && Date.now() - (serversData.discord.search?.time || 0) < 5 * 60 * 60 * 1000) {
                const envData = new EnvData(guildData.guildId);
                envData.playlist.push(playlist);
                await message.edit(await videoInfoEmbedGet([playlist], "曲を追加しました。", interaction.client));
            }
            else await message.edit({ embeds: [messageEmbedGet("この指定は認識することができませんでした。検索結果に一致する番号を選択すること、また`/search`コマンドを再度実行することをお試しください。", interaction.client)] });
            return;
        }
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
                    await message.edit({ embeds: [messageEmbedGet("次のテキストは解析ができませんでした。\n`" + data + "`\n`/search`コマンドを利用することを検討してください。", interaction.client)] });
                    break;
                }
            }
        }, { urlOnly: true });

    }
}

