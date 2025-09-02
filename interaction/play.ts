import { Interaction, SlashCommandBuilder, CacheType, EmbedBuilder } from "discord.js";
import * as DiscordVoice from "@discordjs/voice";

import { InteractionInputData } from "../interface.js";
import { VariableExistCheck } from "../variableExistCheck.js";
import { VideoMetaCache } from "../envJSON.js";

export const command = new SlashCommandBuilder()
    .setName("play")
    .setDescription("プレイリスト内の曲を再生します。")
export const commandExample = "";

export async function execute(interaction: Interaction<CacheType>, inputData: InteractionInputData) {
    if (interaction.isChatInputCommand()) {
        // 1. 必要な変数があるかチェック
        const variableExistCheck = new VariableExistCheck(interaction);
        if (await variableExistCheck.playlistIsEmpty()) return;
        if (await variableExistCheck.playerIsPlaying(inputData.serversDataClass)) return;
        const guildData = await variableExistCheck.guild();
        if (!guildData) return;
        const vchannelId = await variableExistCheck.voiceChannelId();
        if (!vchannelId) return;
        const serverData = await variableExistCheck.serverData(inputData.serversDataClass);
        if (!serverData) return;
        const playlist = await variableExistCheck.playlist();
        if (!playlist) return;
        await interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setDescription("VCの状態をチェック中...0%")
                    .setColor("Purple")
            ]
        });
        const oldConnection = DiscordVoice.getVoiceConnection(guildData.guildId);
        oldConnection?.disconnect();
        oldConnection?.destroy();
        const connection = DiscordVoice.joinVoiceChannel({ channelId: vchannelId, guildId: guildData.guildId, adapterCreator: guildData.guild.voiceAdapterCreator });
        await DiscordVoice.entersState(connection, DiscordVoice.VoiceConnectionStatus.Ready, 10000);
        connection.subscribe(serverData.discord.ffmpegResourcePlayer.player);
        serverData.discord.calledChannel = interaction.channelId;

        const videoMetaCache = new VideoMetaCache();
        const meta = await videoMetaCache.cacheGet(playlist[0]);
        const title = (meta?.body ? meta.body.title : "タイトル取得エラー(ID: " + playlist[0].body + ")")
        await interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setDescription("「" + title + "」の再生準備中...0%")
                    .setColor("Purple")
            ]
        });
        let statusTemp: {
            status: "loading" | "downloading" | "formatchoosing" | "converting" | "done",
            body: { percent?: number; };
        }
        let statuscallTime: number = Date.now();
        await inputData.playerSet.playerSetAndPlay(guildData.guildId, async (status, body) => {
            const temp = { status, body }
            if (statusTemp && statusTemp === temp) return;
            if (statusTemp && statusTemp.status === status && Date.now() - statuscallTime < 500) return;
            statusTemp = temp;
            statuscallTime = Date.now();
            if (status === "loading") await interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription("「" + title + "」の音声ファイルを準備中..." + (body.percent ? Math.floor(body.percent) + "%" : ""))
                        .setColor("Purple")
                ]
            });
            if (status === "downloading") await interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription("「" + title + "」の音声ファイルをダウンロード中..." + (body.percent ? Math.floor(body.percent) + "%" : ""))
                        .setColor("Purple")
                ]
            });
            if (status === "converting") await interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription("「" + title + "」の音声ファイルを再生可能な形式に変換中...少々お待ちください..." + (body.percent ? Math.floor(body.percent) + "%" : ""))
                        .setColor("Purple")
                ]
            });
            if (status === "formatchoosing") await interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription("「" + title + "」の" + (body.type ? (body.type === "youtube" ? "YouTube" : "ニコニコ動画") : "") + "サーバーに保管されたフォーマットの調査中..." + (body.percent ? Math.floor(body.percent) + "%" : ""))
                        .setColor("Purple")
                ]
            });
        });
        await interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setDescription("「" + title + "」の再生を開始しました。")
                    .setColor("Purple")
            ]
        });
    }
}

