import fs from "fs";

import { Interaction, SlashCommandBuilder, CacheType, EmbedBuilder, APIEmbedField, APIEmbed, Message, SlashCommandOptionsOnlyBuilder, RESTPostAPIApplicationCommandsJSONBody, REST, Routes } from "discord.js";
import { InteractionInputData } from "../funcs/interface.js";
import { messageEmbedGet } from "../funcs/embed.js";
import { musicBrainz } from "../worker/helper/createByChatGPT/musicBrainzInfoHelper.js";

export const command = new SlashCommandBuilder()
    .setName("commandreset")
    .setDescription("音楽botのコマンドを再定義します。")
export const commandExample = "";

export async function execute(interaction: Interaction<CacheType>, inputData: InteractionInputData, message: Message) {
    if (interaction.isChatInputCommand()) {
        /** インタラクションコマンドのデータです。 */
        const interactionFuncs = (() => {
            const arr: {
                execute?: (interaction: Interaction, inputData: InteractionInputData, message: Message) => Promise<void>;
                command?: SlashCommandOptionsOnlyBuilder;
            }[] = [];
            fs.readdirSync("interaction").forEach(async str => {
                if (!str.endsWith(".ts")) return;
                try {
                    const { execute, command } = await import("./" + str);
                    arr.push({ execute, command });
                } catch (e) {
                    console.error(e, str);
                }
            });
            return arr;
        })();
        
        /** インタラクションコマンドのデータです。 */
        const adminInteractionFuncs = (() => {
            const arr: {
                execute?: (interaction: Interaction, inputData: InteractionInputData, message: Message) => Promise<void>;
                command?: SlashCommandOptionsOnlyBuilder;
            }[] = [];
            fs.readdirSync("adminInteraction").forEach(async str => {
                if (!str.endsWith(".ts")) return;
                try {
                    const { execute, command } = await import("./" + str);
                    arr.push({ execute, command });
                } catch (e) {
                    console.error(e, str);
                }
            });
            return arr;
        })();
        // JSON へ変換（REST 配信用）
        function toJSONBody(builders: SlashCommandOptionsOnlyBuilder[]): RESTPostAPIApplicationCommandsJSONBody[] {
            return builders.map((b) => (b as any).toJSON ? (b as any).toJSON() : (b as unknown as RESTPostAPIApplicationCommandsJSONBody));
        }
        await message.edit("処理を開始します...");
        const token = process.env.DISCORD_TOKEN;
        const clientId = interaction.client.user?.id;

        if (!token || !clientId) return await message.edit("トークンまたはクライアントIDが無効だったよ。");
        const commands = interactionFuncs.map(func => func.command).filter((cmd): cmd is SlashCommandOptionsOnlyBuilder => cmd !== undefined);
        const body = toJSONBody(commands);
        const adminCommands = adminInteractionFuncs.map(func => func.command).filter((cmd): cmd is SlashCommandOptionsOnlyBuilder => cmd !== undefined);
        const adminBody = toJSONBody(adminCommands);
        const rest = new REST({ version: "10" }).setToken(token);

        message.edit("グローバルコマンドをセットしています...");
        await rest.put(Routes.applicationCommands(clientId), { body: body });

        // サーバーのID一覧
        const guildIds = [process.env.DISCORD_ADMIN_GUILD_ID || "926965020724691005"];
        for (let i = 0; i < guildIds.length; i++) {
            const guildId = guildIds[i];
            message.edit("サーバーコマンドを" + guildIds.length + "中" + (i + 1) + "つ目の「" + interaction.client.guilds.cache.get(guildId)?.name + "/" + guildId + "」に登録しています...時間がかかります。");
            await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: body });
            message.edit("サーバーコマンドを" + guildIds.length + "中" + (i + 1) + "つ目の「" + interaction.client.guilds.cache.get(guildId)?.name + "/" + guildId + "」から削除しています...");
            await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: adminBody });
        }
        message.edit("グローバルコマンドを登録しました。");
    }
}
