import { Interaction, SlashCommandBuilder, CacheType, EmbedBuilder } from "discord.js";

import { InteractionInputData } from "../interface.js";
import { EnvData, VideoMetaCache } from "../envJSON.js";
import { VariableExistCheck } from "../variableExistCheck.js";
import { messageEmbedGet, videoInfoEmbedGet } from "../embed.js";

export const command = new SlashCommandBuilder()
    .setName("exportq")
    .setDescription("キュー内の曲をURLリストにして書き出します。")
export const commandExample = "";

export async function execute(interaction: Interaction<CacheType>, inputData: InteractionInputData) {
    if (interaction.isChatInputCommand()) {
        const variableExistCheck = new VariableExistCheck(interaction);
        const guildData = await variableExistCheck.guild();
        if (!guildData) return;
        const playlist = await variableExistCheck.playlist();
        if (!playlist) return;
        if (await variableExistCheck.playlistIsEmpty()) return;
        let result = "```";
        for (const playlistData of playlist) {
            switch (playlistData.type) {
                case "videoId": result += "\nhttps://youtu.be/" + playlistData.body; break;
                case "originalFileId": break;
                case "nicovideoId": result += "\nhttps://nicovideo.jp/watch/" + playlistData.body; break;
                case "twitterId": break;
            }
        }
        result += "\n```";
        await interaction.editReply({ embeds: [messageEmbedGet("以下はキュー内の動画をURLに変換したものです。\n" + result, interaction.client)] });
    }
}

