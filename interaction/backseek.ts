import { Interaction, SlashCommandBuilder, CacheType, EmbedBuilder } from "discord.js";

import { InteractionInputData } from "../interface.js";
import { VariableExistCheck } from "../variableExistCheck.js";

export const command = new SlashCommandBuilder()
    .setName("backseek")
    .setDescription("再生位置を１０秒前にずらします。")
    .addNumberOption(option => option
        .setName("second")
        .setDescription("時間を指定して巻き戻します。秒で指定します。")
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
        if (await variableExistCheck.playerIsNotPlaying(inputData.serversDataClass)) return;
        const second = interaction.options.getNumber("second") || 10;
        await serverData.discord.ffmpegResourcePlayer.seek(serverData.discord.ffmpegResourcePlayer.playtime - second);
        interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setDescription(second + "秒巻き戻しました。")
                    .setColor("Purple")
            ]
        });
    }
}

