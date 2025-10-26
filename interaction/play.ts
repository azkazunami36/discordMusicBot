import { Interaction, SlashCommandBuilder, CacheType, EmbedBuilder, Message } from "discord.js";
import * as DiscordVoice from "@discordjs/voice";

import { InteractionInputData } from "../funcs/interface.js";
import { VariableExistCheck } from "../class/variableExistCheck.js";
import { EnvData } from "../class/envJSON.js";
import { messageEmbedGet, videoInfoEmbedGet } from "../funcs/embed.js";
import { progressBar } from "../createByChatGPT/progressBar.js";
import { SumLog } from "../class/sumLog.js";
import { urlToQueue } from "../funcs/urlToQueue.js";

export const command = new SlashCommandBuilder()
    .setName("play")
    .setDescription("キュー内の曲を再生します。")
    .addStringOption(option => option
        .setName("text")
        .setDescription("音楽を追加することができます。URLまたは検索したいタイトルを入力してください。")
    )
export const commandExample = "";

export async function execute(interaction: Interaction<CacheType>, inputData: InteractionInputData, message: Message) {
    if (interaction.isChatInputCommand()) {
        // 1. 必要な変数があるかチェック
        const variableExistCheck = new VariableExistCheck(interaction);
        const text = interaction.options.getString("text");
        if (!text && await variableExistCheck.playlistIsEmpty()) return;
        const guildData = await variableExistCheck.guild();
        if (!guildData) return;
        if (!text && inputData.player.playStatusGet(guildData.guildId) === "play") return message.edit({ embeds: [messageEmbedGet("すでに再生中です。`/help`で使い方をみることができます。", interaction.client)] });
        const vchannelId = await variableExistCheck.voiceChannelId();
        if (!vchannelId) return;
        const serverData = await variableExistCheck.serverData(inputData.serversDataClass);
        if (!serverData) return;
        const envData = new EnvData(guildData.guildId);
        console.log(text)
        serverData.discord.calledChannel = interaction.channelId;
        let stopIs = false;
        if (text && inputData.player.playStatusGet(guildData.guildId) !== "play") {
            await urlToQueue(text, guildData, null, message, async (percent, status, playlist, option) => {
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
                        break;
                    }
                    case "failed": {
                        stopIs = true;
                        await message.edit({ embeds: [messageEmbedGet("次のテキストは解析ができず、キューに追加できませんでした。\n`" + text + "`", interaction.client)] });
                        break;
                    }
                }
            }, { soloAdd: true, firstAdd: true });
        }
        if (text && inputData.player.playStatusGet(guildData.guildId) === "play") {
            await urlToQueue(text, guildData, null, message, async (percent, status, playlist) => {
                switch (status) {
                    case "analyzing": {
                        await message.edit({ embeds: [messageEmbedGet("文字列を分析しています...\n" + (Math.floor(percent * 10) / 10) + "%`" + progressBar(percent, 35) + "`", interaction.client)] });
                        break;
                    }
                    case "searching": {
                        await message.edit({ embeds: [messageEmbedGet("検索しています...\n" + (Math.floor(percent * 10) / 10) + "%`" + progressBar(percent, 35) + "`", interaction.client)] });
                        break;
                    }
                    case "checkAndDownloading": {
                        await message.edit({ embeds: [messageEmbedGet("取得したデータを解析・ダウンロードしています..." + (playlist || []).length + "曲はキューに追加済みで、再生が可能です。" + "\n" + (Math.floor(percent * 10) / 10) + "%`" + progressBar(percent, 35) + "`", interaction.client)] });
                        break;
                    }
                    case "done": {
                        await message.edit(await videoInfoEmbedGet(playlist || [], "曲を追加しました。", interaction.client));
                        break;
                    }
                    case "failed": {
                        stopIs = true;
                        await message.edit({ embeds: [messageEmbedGet("次のテキストは解析ができず、キューに追加できませんでした。\n`" + text + "`", interaction.client)] });
                        break;
                    }
                }
            });
        }
        if (!text && inputData.player.playStatusGet(guildData.guildId) === "pause") {
            inputData.player.play(guildData.guildId);
            await message.edit({ embeds: [messageEmbedGet("再生を再開しました。", interaction.client)] });
        } else if (!stopIs && inputData.player.playStatusGet(guildData.guildId) !== "play") {
            const playlistData = envData.playlist.get(0);
            if (!playlistData) {
                SumLog.warn("通常この位置だとプレイリストに曲が存在するのに、取得できませんでした。" + JSON.stringify(playlistData), { functionName: "play" })
                return message.edit({ embeds: [messageEmbedGet("通常存在する状況で、プレイリストに曲がありませんでした。", message.client)] });
            }
            let embed: EmbedBuilder | undefined;
            const metaEmbed = await videoInfoEmbedGet([playlistData], "再生準備中...\n0%`" + progressBar(0, 35) + "`", interaction.client, eb => { embed = eb; });
            await message.edit(metaEmbed);
            SumLog.log(playlistData.body + "の再生処理を開始します。", { functionName: "play", guildId: interaction.guildId || undefined, textChannelId: interaction.channelId, voiceChannelId: vchannelId, userId: interaction.user.id, client: interaction.client });
            let statusTemp: {
                status: "loading" | "downloading" | "formatchoosing" | "converting" | "done" | "queue",
                percent: number;
            }
            let statuscallTime: number = Date.now();
            const type = playlistData.type;
            await inputData.player.forcedPlay({
                guildId: guildData.guildId,
                channelId: vchannelId,
                adapterCreator: guildData.guild.voiceAdapterCreator,
                source: playlistData,
                playtime: 0,
                tempo: envData.playTempo,
                pitch: envData.playPitch,
                volume: envData.volume,
                reverbType: envData.reverbType
            }, async (status, percent) => {
                const temp = { status, percent }
                if (statusTemp && statusTemp === temp) return;
                if (statusTemp && statusTemp.status === status && Date.now() - statuscallTime < 500) return;
                statusTemp = temp;
                statuscallTime = Date.now();
                if (embed) {
                    if (status === "loading") { embed.setDescription("音声ファイルを準備中...\n" + Math.floor(percent) + "%`" + progressBar(percent, 35) + "`"); await message.edit(metaEmbed); }
                    if (status === "downloading") { embed.setDescription("音声ファイルをダウンロード中...\n" + Math.floor(percent) + "%`" + progressBar(percent, 35) + "`"); await message.edit(metaEmbed); }
                    if (status === "converting") { embed.setDescription("音声ファイルを再生可能な形式に変換中...\n" + Math.floor(percent) + "%`" + progressBar(percent, 35) + "`"); await message.edit(metaEmbed); }
                    if (status === "formatchoosing") { embed.setDescription((type ? (type === "videoId" ? "YouTube" : type === "nicovideoId" ? "ニコニコ動画" : "X") : "") + "サーバーに保管されたフォーマットの調査中...\n" + Math.floor(percent) + "%`" + progressBar(percent, 35) + "`"); await message.edit(metaEmbed); }
                    if (status === "done") { embed.setDescription("再生開始処理中...\n" + Math.floor(percent) + "%`" + progressBar(percent, 35) + "`"); await message.edit(metaEmbed); }
                }
            });
            if (embed) embed.setDescription("再生を開始しました。");
            await message.edit(metaEmbed);
        }
    }
}
