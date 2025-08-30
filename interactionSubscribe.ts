import * as Discord from "discord.js";
import fs from "fs";
import path from "path";
import "dotenv/config";

const client = new Discord.Client({
    intents: [Discord.GatewayIntentBits.Guilds], // Guild情報を取るにはGuilds intentが必要
});

// interaction ディレクトリから .js のコマンドだけを読み込む
async function loadInteractionBuilders(): Promise<Discord.SlashCommandOptionsOnlyBuilder[]> {
    const dir = path.resolve("interaction");
    const files = fs.readdirSync(dir);

    const builders = await Promise.all(
        files
            .filter((f) => f.endsWith(".js")) // ts 実行時は .js を対象にする
            .map(async (file) => {
                try {
                    const mod = await import("./interaction/" + file);
                    const { command } = mod as { command: Discord.SlashCommandOptionsOnlyBuilder };
                    if (!command) return null;
                    return command;
                } catch (e) {
                    console.log(e);
                    return null;
                }
            })
    );

    return builders.filter((b): b is Discord.SlashCommandOptionsOnlyBuilder => Boolean(b));
}

export const interactionCommands: Discord.SlashCommandOptionsOnlyBuilder[] = await loadInteractionBuilders();

// JSON へ変換（REST 配信用）
function toJSONBody(builders: Discord.SlashCommandOptionsOnlyBuilder[]): Discord.RESTPostAPIApplicationCommandsJSONBody[] {
    return builders.map((b) => (b as any).toJSON ? (b as any).toJSON() : (b as unknown as Discord.RESTPostAPIApplicationCommandsJSONBody));
}

client.once("ready", async () => {
    const token = process.env.DISCORD_TOKEN;
    const clientId = "1028285721955553362";

    if (!token || !clientId) {
        throw new Error("DISCORD_TOKEN または DISCORD_CLIENT_ID が未設定です");
    }

    const body = toJSONBody(interactionCommands);
    const rest = new Discord.REST({ version: "10" }).setToken(token);

    console.log(`Registering ${body.length} global slash commands...`);
    await rest.put(Discord.Routes.applicationCommands(clientId), { body: body });

    // Botが参加している全サーバーのID一覧
    const guildIds = client.guilds.cache.map(guild => guild.id);
    for (let i = 0; i < guildIds.length; i++) {
        const guildId = guildIds[i];
        console.log("Guild command setting... " + (i + 1) + "/" + guildIds.length, guildId, client.guilds.cache.get(guildId)?.name);
        await rest.put(Discord.Routes.applicationGuildCommands(clientId, guildId), { body: body });
        console.log("Deleteing...");
        await rest.put(Discord.Routes.applicationGuildCommands(clientId, guildId), { body: [] });
    }
    await client.destroy();
    console.log("Global commands registered.");
});

client.login(process.env.DISCORD_TOKEN);
