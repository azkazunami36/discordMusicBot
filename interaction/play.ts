import { Interaction, SlashCommandBuilder, CacheType, EmbedBuilder } from "discord.js";
import * as DiscordVoice from "@discordjs/voice";

import { InteractionInputData } from "../interface.js";
import { VariableExistCheck } from "../variableExistCheck.js";
import { EnvData, VideoMetaCache } from "../envJSON.js";
import { messageEmbedGet, videoInfoEmbedGet } from "../embed.js";
import { progressBar } from "../progressBar.js";

export const command = new SlashCommandBuilder()
    .setName("play")
    .setDescription("キュー内の曲を再生します。")
export const commandExample = "";

export async function execute(interaction: Interaction<CacheType>, inputData: InteractionInputData) {
    if (interaction.isChatInputCommand()) {
        // 1. 必要な変数があるかチェック
        const variableExistCheck = new VariableExistCheck(interaction);
        if (await variableExistCheck.playlistIsEmpty()) return;
        if (await variableExistCheck.playerIsPlaying(inputData.player)) return;
        const guildData = await variableExistCheck.guild();
        if (!guildData) return;
        const vchannelId = await variableExistCheck.voiceChannelId();
        if (!vchannelId) return;
        const serverData = await variableExistCheck.serverData(inputData.serversDataClass);
        if (!serverData) return;
        const playlist = await variableExistCheck.playlist();
        if (!playlist) return;
        serverData.discord.calledChannel = interaction.channelId;
        const metaEmbed = await videoInfoEmbedGet(playlist[0], "再生準備中...\n0%`" + progressBar(0, 35) + "`");
        await interaction.editReply({ embeds: [metaEmbed] });
        const envData = new EnvData(guildData.guildId);
        let statusTemp: {
            status: "loading" | "downloading" | "formatchoosing" | "converting" | "done",
            body: { percent?: number; };
        }
        let statuscallTime: number = Date.now();
        await inputData.player.forcedPlay({
            guildId: guildData.guildId,
            channelId: vchannelId,
            adapterCreator: guildData.guild.voiceAdapterCreator,
            source: playlist[0],
            playtime: 0,
            tempo: envData.playTempo,
            pitch: envData.playPitch,
            volume: envData.volume
        }, async (status, body) => {
            const temp = { status, body }
            if (statusTemp && statusTemp === temp) return;
            if (statusTemp && statusTemp.status === status && Date.now() - statuscallTime < 500) return;
            statusTemp = temp;
            statuscallTime = Date.now();
            if (status === "loading") { metaEmbed.setDescription("音声ファイルを準備中...\n" + (body.percent ? Math.floor(body.percent) + "%`" + progressBar(body.percent, 35) + "`" : "")); await interaction.editReply({ embeds: [metaEmbed] }); }
            if (status === "downloading") { metaEmbed.setDescription("音声ファイルをダウンロード中...\n" + (body.percent ? Math.floor(body.percent) + "%`" + progressBar(body.percent, 35) + "`" : "")); await interaction.editReply({ embeds: [metaEmbed] }); }
            if (status === "converting") { metaEmbed.setDescription("音声ファイルを再生可能な形式に変換中...\n" + (body.percent ? Math.floor(body.percent) + "%`" + progressBar(body.percent, 35) + "`" : "")); await interaction.editReply({ embeds: [metaEmbed] }); }
            if (status === "formatchoosing") { metaEmbed.setDescription((body.type ? (body.type === "youtube" ? "YouTube" : body.type === "niconico" ? "ニコニコ動画" : "X") : "") + "サーバーに保管されたフォーマットの調査中...\n" + (body.percent ? Math.floor(body.percent) + "%`" + progressBar(body.percent, 35) + "`" : "")); await interaction.editReply({ embeds: [metaEmbed] }); }
            if (status === "done") { metaEmbed.setDescription("再生開始処理中...\n" + (body.percent ? Math.floor(body.percent) + "%`" + progressBar(body.percent, 35) + "`" : "")); await interaction.editReply({ embeds: [metaEmbed] }); }
        });
        metaEmbed.setDescription("再生を開始しました。")
        await interaction.editReply({ embeds: [metaEmbed] });
    }
}

