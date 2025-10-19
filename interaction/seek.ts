import { Interaction, SlashCommandBuilder, CacheType, GuildMember, Message } from "discord.js";

import { InteractionInputData } from "../funcs/interface.js";
import { parseStrToNum } from "../createByChatGPT/parseTimeStrToNum.js";
import { numberToTimeString } from "../createByChatGPT/numberToTimeString.js";
import { VariableExistCheck } from "../class/variableExistCheck.js";
import { EnvData } from "../funcs/envJSON.js";
import { messageEmbedGet } from "../funcs/embed.js";

export const command = new SlashCommandBuilder()
    .setName("seek")
    .setDescription("再生位置を任意の場所に移動します。")
    .addStringOption(option => option
        .setName("time")
        .setDescription("時間を指定します。「2:05」「２分５秒」「125」が利用できます。")
        .setRequired(true)
    )
export const commandExample = "";

export async function execute(interaction: Interaction<CacheType>, inputData: InteractionInputData, message: Message) {
    if (interaction.isChatInputCommand()) {
        // 1. 必要な変数があるかチェック
        const variableExistCheck = new VariableExistCheck(interaction);
        const guildData = await variableExistCheck.guild();
        if (!guildData) return;
        const serverData = await variableExistCheck.serverData(inputData.serversDataClass);
        if (!serverData) return;
        if (await variableExistCheck.playerIsNotPlaying(inputData.player)) return;
        const envData = new EnvData(guildData.guildId);
        const time = interaction.options.getString("time");
        if (time === null) return await message.edit({ embeds: [messageEmbedGet("時間が指定されていません。時間を指定してからもう一度やり直してください。", interaction.client)] });
        const second = parseStrToNum(time);
        if (second === undefined) return await message.edit({ embeds: [messageEmbedGet("「" + time + "」を正しく分析できません。もう一度入力し直してください。", interaction.client)] });
        await inputData.player.playtimeSet(guildData.guildId, second);
        await message.edit({ embeds: [messageEmbedGet("時間を" + numberToTimeString(second) + "にしました。", interaction.client)] });
    }
}
