import { Interaction, SlashCommandBuilder, CacheType, EmbedBuilder } from "discord.js";

import { InteractionInputData } from "../interface.js";
import { VariableExistCheck } from "../variableExistCheck.js";
import { EnvData, VideoMetaCache } from "../envJSON.js";
import { messageEmbedGet, videoInfoEmbedGet } from "../embed.js";

export const command = new SlashCommandBuilder()
    .setName("skip")
    .setDescription("現在の曲をスキップして次の曲を再生します。")
    .addNumberOption(option => option
        .setName("skipnum")
        .setDescription("指定した番号だけプレイリストを進めます。プレイリストより多い数でも機能はしますが、負荷がかかるのでおやめください。")
    )
export const commandExample = "";

export async function execute(interaction: Interaction<CacheType>, inputData: InteractionInputData) {
    if (interaction.isChatInputCommand()) {
        const variableExistCheck = new VariableExistCheck(interaction);
        const guildData = await variableExistCheck.guild();
        if (!guildData) return;
        if (await variableExistCheck.playlistIsEmpty()) return;
        const envData = new EnvData(guildData.guildId);
        const playlist = envData.playlistGet();
        const skipNum = interaction.options.getNumber("skipnum") || 2;
        if (envData.playType === 1) playlist.shift();
        if (skipNum > playlist.length + 10) return await interaction.editReply({ embeds: [messageEmbedGet("指定したスキップ数が大きすぎます。枕がでかすぎる！ンアーッ！")] });
        for (let i = 0; i < skipNum - 1; i++) {
            const startPlaylistData = playlist.shift();
            if (startPlaylistData) playlist.push(startPlaylistData);
        }
        envData.playlistSave(playlist);
        const metaEmbed = await videoInfoEmbedGet(playlist[0], "次の曲の再生準備中...0%");
        await interaction.editReply({ embeds: [metaEmbed] });
        await inputData.player.sourceSet(guildData.guildId, playlist[0]);
        metaEmbed.setDescription("次の曲にスキップしました。");
        await interaction.editReply({ embeds: [metaEmbed] });
    }
}

