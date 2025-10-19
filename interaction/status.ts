import { Interaction, SlashCommandBuilder, CacheType, EmbedBuilder, CommandInteraction, APIEmbedField, Message } from "discord.js";

import { InteractionInputData } from "../funcs/interface.js";
import { VariableExistCheck } from "../class/variableExistCheck.js";
import { statusEmbedGet } from "../funcs/embed.js";

export const command = new SlashCommandBuilder()
    .setName("status")
    .setDescription("キュー・再生状態を確認できます。")
    .addNumberOption(option => option
        .setName("page")
        .setDescription("ページを指定します。")
    )
export const commandExample = "";

export async function execute(interaction: Interaction<CacheType>, inputData: InteractionInputData, message: Message) {
    if (interaction.isChatInputCommand()) {
        const variableExistCheck = new VariableExistCheck(interaction);
        const guildData = await variableExistCheck.guild();
        if (!guildData) return;
        const playlist = await variableExistCheck.playlist();
        if (!playlist) return;
        const serverData = await variableExistCheck.serverData(inputData.serversDataClass);
        if (!serverData) return;

        const embed = await statusEmbedGet({
            guildId: guildData.guildId,
            page: interaction.options.getNumber("page") || 1,
            client: interaction.client,
            playlist,
            playing: { playingPlaylist: inputData.player.playingGet(guildData.guildId), playingTime: inputData.player.playtimeGet(guildData.guildId) }
        });
        await message.edit({embeds: [embed]});
    }
}
