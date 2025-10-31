import fs from "fs";

import { Interaction, SlashCommandBuilder, CacheType, EmbedBuilder, APIEmbedField, APIEmbed, Message, SlashCommandOptionsOnlyBuilder, RESTPostAPIApplicationCommandsJSONBody, REST, Routes, PresenceData } from "discord.js";
import { InteractionInputData } from "../funcs/interface.js";
import { messageEmbedGet } from "../funcs/embed.js";
import { musicBrainz } from "../worker/helper/createByChatGPT/musicBrainzInfoHelper.js";
import { getVoiceConnections, VoiceConnection } from "@discordjs/voice";
import { EnvData, GlobalEnvData } from "../class/envJSON.js";

export const command = new SlashCommandBuilder()
    .setName("statusmessageset")
    .setDescription("音楽botのステータスメッセージを設定します。")
    .addStringOption(option => option
        .setName("message")
        .setDescription("表示したいメッセージを入力します。")
    )
export const commandExample = "";

export async function execute(interaction: Interaction<CacheType>, inputData: InteractionInputData, message: Message) {
    if (interaction.isChatInputCommand()) {
        const text = interaction.options.getString("message");
        const globalEnvData = new GlobalEnvData();
        if (text) globalEnvData.botMessage = text;
        else globalEnvData.botMessage = "";
        try {
            const status: PresenceData = {};
            status.status = "online";
            status.activities = [{ name: globalEnvData.botMessage }];
            interaction.client.user?.setPresence(status);
        } catch { }
    }
}
