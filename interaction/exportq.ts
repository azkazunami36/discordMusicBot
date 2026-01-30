import { Interaction, SlashCommandBuilder, CacheType, EmbedBuilder, Message } from "discord.js";

import { InteractionInputData } from "../funcs/interface.js";
import { EnvData } from "../class/envJSON.js";
import { VariableExistCheck } from "../class/variableExistCheck.js";
import { messageEmbedGet, videoInfoEmbedGet } from "../funcs/embed.js";

export const command = new SlashCommandBuilder()
    .setName("exportq")
    .setDescription("キュー内の曲をURLリストにして書き出します。")
export const commandExample = "";

export async function execute(interaction: Interaction<CacheType>, inputData: InteractionInputData, message: Message) {
    if (interaction.isChatInputCommand()) {
        const variableExistCheck = new VariableExistCheck(interaction);
        const guildData = await variableExistCheck.guild();
        if (!guildData) return;
        const envData = new EnvData(guildData.guildId);
        if (await variableExistCheck.playlistIsEmpty()) return;
        let result = "```";
        for (const playlistData of envData.playlist) {
            switch (playlistData.type) {
                case "videoId": result += "\nhttps://youtu.be/" + playlistData.body; break;
                case "originalFileId": break;
                case "nicovideoId": result += "\nhttps://nicovideo.jp/watch/" + playlistData.body; break;
                case "twitterId": break;
            }
        }
        result += "\n```";
        await message.edit({ embeds: [messageEmbedGet("以下はキュー内の動画をURLに変換したものです。\n" + result, interaction.client)] });
    }
}
