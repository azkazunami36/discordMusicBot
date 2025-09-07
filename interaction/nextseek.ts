import { Interaction, SlashCommandBuilder, CacheType, GuildMember, EmbedBuilder } from "discord.js";
import * as DiscordVoice from "@discordjs/voice";

import { InteractionInputData } from "../interface.js";
import { VariableExistCheck } from "../variableExistCheck.js";
import { messageEmbedGet } from "../embed.js";

export const command = new SlashCommandBuilder()
    .setName("nextseek")
    .setDescription("再生位置を１０秒後にすすめます。")
    .addNumberOption(option => option
        .setName("second")
        .setDescription("時間を指定してすすめます。秒で指定します。")
    )
export const commandExample = "";

export async function execute(interaction: Interaction<CacheType>, inputData: InteractionInputData) {
    if (interaction.isChatInputCommand()) {
        // 1. 必要な変数があるかチェック
        const variableExistCheck = new VariableExistCheck(interaction);
        const guildData = await variableExistCheck.guild();
        if (!guildData) return;
        const serverData = await variableExistCheck.serverData(inputData.serversDataClass);
        if (!serverData) return;
        if (await variableExistCheck.playerIsNotPlaying(inputData.player)) return;
        const second = interaction.options.getNumber("second") || 10;
        await inputData.player.playtimeSet(guildData.guildId, inputData.player.playtimeGet(guildData.guildId) + second);
        interaction.editReply({ embeds: [messageEmbedGet(second + "秒すすめました。")] });
    }
}

