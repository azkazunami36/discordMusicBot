import { Interaction, SlashCommandBuilder, CacheType, EmbedBuilder } from "discord.js";
import * as DiscordVoice from "@discordjs/voice";

import { InteractionInputData } from "../interface.js";
import { VariableExistCheck } from "../variableExistCheck.js";
import { EnvData, VideoMetaCache } from "../envJSON.js";

export const command = new SlashCommandBuilder()
    .setName("play")
    .setDescription("プレイリスト内の曲を再生します。")
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
        await interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setDescription("VCの状態をチェック中...0%")
                    .setColor("Purple")
            ]
        });
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
        const envData = new EnvData(guildData.guildId);
        await inputData.player.forcedPlay({
            guildId: guildData.guildId,
            channelId: vchannelId,
            adapterCreator: guildData.guild.voiceAdapterCreator,
            source: playlist[0],
            playtime: 0,
            speed: envData.playSpeed,
            volume: envData.volume
        })
        await interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setDescription("「" + title + "」の再生を開始しました。")
                    .setColor("Purple")
            ]
        });
    }
}

