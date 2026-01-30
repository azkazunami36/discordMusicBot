import fs from "fs";

import { Interaction, SlashCommandBuilder, CacheType, EmbedBuilder, APIEmbedField, APIEmbed, Message, SlashCommandOptionsOnlyBuilder, RESTPostAPIApplicationCommandsJSONBody, REST, Routes } from "discord.js";
import { InteractionInputData } from "../funcs/interface.js";
import { messageEmbedGet } from "../funcs/embed.js";
import { musicBrainz } from "../worker/helper/createByChatGPT/musicBrainzInfoHelper.js";
import { getVoiceConnections, VoiceConnection } from "@discordjs/voice";

export const command = new SlashCommandBuilder()
    .setName("botstatus")
    .setDescription("音楽botの利用状態を表示します。")
export const commandExample = "";

export async function execute(interaction: Interaction<CacheType>, inputData: InteractionInputData, message: Message) {
    if (interaction.isChatInputCommand()) {
        const connections = getVoiceConnections();
        const list: VoiceConnection[] = [];
        connections.forEach(connection => list.push(connection));
        await message.edit("現在音楽botは" + list.length + "箇所で再生されています。: " + (() => {
            let string = "";
            for (const data of list) {
                string += "\n" + (() => {
                    try {
                        return interaction.client.guilds.cache.get(data.joinConfig.guildId)?.name
                    } catch {
                        return "取得エラー"
                    }
                })() + " / " + data.joinConfig.guildId
            }
            return string;
        })() + "\nこの音楽botは" + interaction.client.guilds.cache.size + "箇所に参加しています。: " + (() => {
            let string = "";
            interaction.client.guilds.cache.forEach(data => {
                string += "\n" + (() => {
                    try {
                        return interaction.client.guilds.cache.get(data.id)?.name
                    } catch {
                        return "取得エラー"
                    }
                })() + " / " + data.id
            })
            return string;
        })());
    }
}
