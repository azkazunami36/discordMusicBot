import { Interaction, SlashCommandBuilder, CacheType, EmbedBuilder } from "discord.js";

import { InteractionInputData } from "../interface.js";
import { VariableExistCheck } from "../variableExistCheck.js";
import { EnvData, VideoMetaCache } from "../envJSON.js";

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
        if (skipNum > playlist.length + 10) return await interaction.editReply("指定したスキップ数が大きすぎます。枕がでかすぎる！ンアーッ！");
        for (let i = 0; i < skipNum - 1; i++) {
            const startPlaylistData = playlist.shift();
            if (startPlaylistData) playlist.push(startPlaylistData);
        }
        envData.playlistSave(playlist);
        const videoMetaCache = new VideoMetaCache();
        const meta = await videoMetaCache.cacheGet(playlist[0]);
        const title = "次の曲「" + (meta?.body ? meta.body.title : "タイトル取得エラー(ID: " + playlist[0].body + ")") + "」";
        await interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setDescription(title + "の再生準備中...")
                .setColor("Purple")
            ]
        });
        await inputData.player.sourceSet(guildData.guildId, playlist[0]);
        await interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setDescription(title + "にスキップしました。")
                .setColor("Purple")
            ]
        });
    }
}

