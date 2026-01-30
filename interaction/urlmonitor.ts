import { Interaction, SlashCommandBuilder, CacheType, GuildMember, Message } from "discord.js";

import { InteractionInputData } from "../funcs/interface.js";
import { VariableExistCheck } from "../class/variableExistCheck.js";
import { EnvData } from "../class/envJSON.js";
import { messageEmbedGet } from "../funcs/embed.js";

export const command = new SlashCommandBuilder()
    .setName("urlmonitor")
    .setDescription("特定チャンネルに送られるURLを常に解析し再生するかを設定します。")
    .addChannelOption(option => option
        .setName("channel")
        .setDescription("監視したいチャンネルを指定します。現時点で１つまでのチャンネルを監視できます。")
    )
export const commandExample = "";

export async function execute(interaction: Interaction<CacheType>, inputData: InteractionInputData, message: Message) {
    if (interaction.isChatInputCommand()) {
        await message.edit("現在この機能は実装途中です。利用できません。");
    }
}
