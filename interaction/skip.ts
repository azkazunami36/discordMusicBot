import { Interaction, SlashCommandBuilder, CacheType, EmbedBuilder } from "discord.js";

import { InteractionInputData } from "../interface.js";
import { VariableExistCheck } from "../variableExistCheck.js";
import { EnvData, VideoMetaCache } from "../envJSON.js";
import { messageEmbedGet, videoInfoEmbedGet } from "../embed.js";
import { progressBar } from "../progressBar.js";

export const command = new SlashCommandBuilder()
    .setName("skip")
    .setDescription("現在の曲をスキップして次の曲を再生します。")
    .addNumberOption(option => option
        .setName("skipnum")
        .setDescription("指定した番号だけキューを進めます。キューより多い数でも機能はしますが、負荷がかかるのでおやめください。")
    )
export const commandExample = "";

export async function execute(interaction: Interaction<CacheType>, inputData: InteractionInputData) {
    if (interaction.isChatInputCommand()) {
        const variableExistCheck = new VariableExistCheck(interaction);
        const guildData = await variableExistCheck.guild();
        if (!guildData) return;
        // vcidは使わないが、VCに参加していないことをはっきりするために用意。
        const vchannelId = await variableExistCheck.voiceChannelId();
        if (!vchannelId) return;
        if (await variableExistCheck.playlistIsEmpty()) return;
        const envData = new EnvData(guildData.guildId);
        const playlist = envData.playlistGet();
        const skipNum = interaction.options.getNumber("skipnum") || 2;
        if (envData.playType === 1) playlist.shift();
        if (skipNum > playlist.length + 10) return await interaction.editReply({ embeds: [messageEmbedGet("指定したスキップ数が大きすぎます。枕がでかすぎる！ンアーッ！", interaction.client)] });
        for (let i = 0; i < skipNum - 1; i++) {
            const startPlaylistData = playlist.shift();
            if (startPlaylistData) playlist.push(startPlaylistData);
        }
        envData.playlistSave(playlist);
        const metaEmbed = await videoInfoEmbedGet([playlist[0]], "次の曲の再生準備中...\n0%`" + progressBar(0, 35) + "`", interaction.client);
        await interaction.editReply({ embeds: [metaEmbed] });
        let statusTemp: {
            status: "loading" | "downloading" | "formatchoosing" | "converting" | "done" | "queue",
            percent: number;
        }
        let statuscallTime: number = Date.now();
        const type = playlist[0].type;
        await inputData.player.sourceSet(guildData.guildId, playlist[0], async (status, percent) => {
            const temp = { status, percent }
            if (statusTemp && statusTemp === temp) return;
            if (statusTemp && statusTemp.status === status && Date.now() - statuscallTime < 500) return;
            statusTemp = temp;
            statuscallTime = Date.now();
            if (status === "loading") { metaEmbed.setDescription("次の曲の音声ファイルを準備中...\n" + Math.floor(percent) + "%`" + progressBar(percent, 35) + "`"); await interaction.editReply({ embeds: [metaEmbed] }); }
            if (status === "downloading") { metaEmbed.setDescription("次の曲の音声ファイルをダウンロード中...\n" + Math.floor(percent) + "%`" + progressBar(percent, 35) + "`"); await interaction.editReply({ embeds: [metaEmbed] }); }
            if (status === "converting") { metaEmbed.setDescription("次の曲の音声ファイルを再生可能な形式に変換中...\n" + Math.floor(percent) + "%`" + progressBar(percent, 35) + "`"); await interaction.editReply({ embeds: [metaEmbed] }); }
            if (status === "formatchoosing") { metaEmbed.setDescription("次の曲の" + (type ? (type === "videoId" ? "YouTube" : type === "nicovideoId" ? "ニコニコ動画" : "X") : "") + "サーバーに保管されたフォーマットの調査中...\n" + Math.floor(percent) + "%`" + progressBar(percent, 35) + "`"); await interaction.editReply({ embeds: [metaEmbed] }); }
            if (status === "done") { metaEmbed.setDescription("次の曲の再生開始処理中...\n" + Math.floor(percent) + "%`" + progressBar(percent, 35) + "`"); await interaction.editReply({ embeds: [metaEmbed] }); }
        });
        inputData.player.volumeSet(guildData.guildId, envData.volume);
        metaEmbed.setDescription("次の曲にスキップしました。");
        await interaction.editReply({ embeds: [metaEmbed] });
    }
}

