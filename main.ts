import * as Discord from "discord.js";
import * as DiscordVoice from "@discordjs/voice";
import fs from "fs";
import "dotenv/config";
import { Writable } from "stream";

import { EnvData, VideoMetaCache } from "./envJSON.js";
import { ServersDataClass } from "./serversData.js";
import { InteractionInputData } from "./interface.js";
import { sourcePathManager } from "./sourcePathManager.js";
import { WebPlayerAPI } from "./webAPI.js";
import { Player } from "./player.js";

const client = new Discord.Client({
    intents: [
        Discord.GatewayIntentBits.Guilds,
        Discord.GatewayIntentBits.GuildMessages,
        Discord.GatewayIntentBits.MessageContent,
        Discord.GatewayIntentBits.GuildVoiceStates
    ],
    partials: [
        Discord.Partials.Channel
    ]
});

/** Discordサーバーに関するデータを一時的に記録しているデータを扱うクラスです。 */
const serversDataClass = new ServersDataClass(client);
/** サーバーごとに記録する必要のある一時データです。 */
const serversData = serversDataClass.serversData;
const webPlayerAPI = new WebPlayerAPI(serversDataClass, client);
/** 全てのVCの動作を追いかけるクラスです。 */
const player = new Player();

player.on("playAutoEnd", async (guildId) => {
    const serverData = serversData[guildId];
    if (!serverData || !serverData.discord.calledChannel) return;
    const channel = client.guilds.cache.get(guildId)?.channels.cache.get(serverData.discord.calledChannel);
    const envData = new EnvData(guildId);
    const playlist = envData.playlistGet();
    const playType = envData.playType;
    switch (playType) {
        case 1: {
            playlist.shift();
            envData.playlistSave(playlist);
            break;
        }
        case 2: {
            const videoId = playlist.shift();
            if (videoId) playlist.push(videoId);
            envData.playlistSave(playlist);
            break;
        }
    }
    if (playlist.length < 1) {
        if (channel && channel.isTextBased()) {
            await channel.send("次の曲がなかったため切断しました。また`/add text:[タイトルまたはURL`を行ってください。]");
        }
        player.stop(guildId);
        return;
    }
    if (envData.changeTellIs) {
        const channel = client.guilds.cache.get(guildId)?.channels.cache.get(serverData.discord.calledChannel);
        if (channel && channel.isTextBased()) {
            const playlistData = playlist[0];
            const videoMetaCache = new VideoMetaCache();
            const meta = await videoMetaCache.cacheGet(playlistData);
            const title = "次の曲「" + (meta?.body ? meta.body.title : "タイトル取得エラー(ID: " + playlistData.body + ")") + "」";
            const message = await channel.send({
                embeds: [
                    new Discord.EmbedBuilder()
                        .setDescription(title + "の再生準備中...0%")
                        .setColor("Purple")
                ]
            });
            await player.forcedPlay({
                guildId: guildId,
                source: playlist[0],
                playtime: 0,
                speed: envData.playSpeed,
                volume: envData.volume
            })
            await message.edit({
                embeds: [
                    new Discord.EmbedBuilder()
                        .setDescription(title + "にスキップしました。")
                        .setColor("Purple")
                ]
            });
        }
    }
})

/** インタラクションコマンドのデータです。 */
const interactionFuncs = (() => {
    const arr: {
        execute?: (interaction: Discord.Interaction, inputData: InteractionInputData) => Promise<void>;
        command?: Discord.SlashCommandOptionsOnlyBuilder;
    }[] = [];
    fs.readdirSync("interaction").forEach(async str => {
        if (str.endsWith(".ts") || str.endsWith(".d.ts")) return;
        try {
            const { execute, command } = await import("./interaction/" + str);
            arr.push({ execute, command });
        } catch (e) {
            console.log(e);
        }
    });
    return arr;
})();

/** コマンドの実行が早すぎる場合に阻止するために使うための変数です。 */
const runedServerTime: { guildId: string; runedTime: number; }[] = [];
/** コマンドの最短実行間隔です。 */
const runlimit = 1000;
client.on(Discord.Events.InteractionCreate, async interaction => {
    if (!interaction.isCommand()) return;
    /** 1. コマンドを検索します。ヒットしたコマンドがここに記録されます。 */
    const data = interactionFuncs.find(d => d.command?.name === interaction.commandName);
    // 2. コマンドが正しく検索され、そのコマンドが正しく取得できていた場合実行します。
    if (data && data.command && data.execute) {
        // 3. サーバー内で実行されている場合、専用チャンネルであるかどうかやそのサーバーで間隔内でチャットが行われているかどうかの検査をします。
        if (interaction.guildId) {
            const envData = new EnvData(interaction.guildId);
            const callchannelId = envData.callchannelId;
            if (callchannelId && callchannelId != interaction.channelId) return await interaction.reply({
                embeds: [
                    new Discord.EmbedBuilder()
                        .setDescription("ここで曲を追加することはできません。特定のチャンネルでやり直してください。")
                ],
                flags: "Ephemeral"
            });
            if (!runedServerTime.find(data => data.guildId === interaction.guildId)) runedServerTime.push({ guildId: interaction.guildId, runedTime: 0 });
            const runed = runedServerTime.find(data => data.guildId === interaction.guildId);
            if (runed) {
                if (Date.now() - runed.runedTime < runlimit) return interaction.reply({
                    embeds: [
                        new Discord.EmbedBuilder()
                            .setDescription("コマンドは" + (runlimit / 1000) + "秒に1回までです。もう少しお待ちください。")
                    ]
                });
                runed.runedTime = Date.now();
            }
        }
        // 4. 必要なデータを整え、コマンドを実行します。
        const inputData: InteractionInputData = { serversDataClass, player };
        await interaction.reply({
            embeds: [
                new Discord.EmbedBuilder()
                    .setDescription("コマンド「" + data.command.name + "」の処理を開始しています...")
            ]
        });
        await data.execute(interaction, inputData);
    }
});
client.on(Discord.Events.ClientReady, () => {
    console.log("OK " + client.user?.displayName);
    client.user?.setStatus("online");
});
// VCの状態が変化したら実行します。
client.on(Discord.Events.VoiceStateUpdate, async (oldState, newState) => {
    const channel = newState.guild.channels.cache.get(newState.channelId || oldState.channelId || "");
    if (!channel || !channel.isVoiceBased() || !player.playingGet(channel.guildId)) return;
    // 1. VCにいる人数がBotを含め1人以下になったら退出します。
    if (channel.members.size <= 1) {
        const serverData = serversData[newState.guild.id];
        // 退出チャットが表示できそうなら表示します。
        if (serverData && serverData.discord.calledChannel) {
            const channel = newState.guild.channels.cache.get(serverData.discord.calledChannel);
            if (channel && channel.isTextBased()) {
                channel.send({
                    embeds: [
                        new Discord.EmbedBuilder()
                            .setDescription("全員が退出したため、再生を停止します。また再度VCに参加して`/play`を実行すると再生できます。")
                    ]
                });
            }
        }
        // 実際に退出します。
        player.stop(channel.guildId);
    }
});

client.login(process.env.DISCORD_TOKEN);

// ここから下は至って重要なコードではありません。

const bt = [
    {
        name: "音割れポッター",
        videoId: "OwN6FwkSWwY"
    },
    {
        name: "威風堂々",
        videoId: "-Tyy3zTbVWc"
    },
    {
        name: "ソ連",
        videoId: "rwAns-qsMPo"
    },
    {
        name: "ココナッツモール池崎",
        videoId: "kgJ3K1keWGU"
    },
    {
        name: "BIG HSI",
        videoId: "Ai4g34CTdA0"
    },
    {
        name: "タドコロ電機",
        videoId: "1kAZdsQrO4s"
    },
]
let joubutuNumber = Math.floor(Math.random() * bt.length);
client.on(Discord.Events.MessageCreate, async message => {
    if (message.guildId === "926965020724691005" && message.content === "音楽botのコマンドを再定義する") {// JSON へ変換（REST 配信用）
        function toJSONBody(builders: Discord.SlashCommandOptionsOnlyBuilder[]): Discord.RESTPostAPIApplicationCommandsJSONBody[] {
            return builders.map((b) => (b as any).toJSON ? (b as any).toJSON() : (b as unknown as Discord.RESTPostAPIApplicationCommandsJSONBody));
        }
        const botmessage = await message.reply("処理を開始します...");
        const token = process.env.DISCORD_TOKEN;
        const clientId = "1028285721955553362";

        if (!token || !clientId) return await botmessage.edit("トークンまたはクライアントIDが無効だったよ。");
        const commands = interactionFuncs.map(func => func.command).filter((cmd): cmd is Discord.SlashCommandOptionsOnlyBuilder => cmd !== undefined);
        const body = toJSONBody(commands);
        const rest = new Discord.REST({ version: "10" }).setToken(token);

        botmessage.edit("グローバルコマンドをセットしています...");
        await rest.put(Discord.Routes.applicationCommands(clientId), { body: body });

        // Botが参加している全サーバーのID一覧
        const guildIds = client.guilds.cache.map(guild => guild.id);
        for (let i = 0; i < guildIds.length; i++) {
            const guildId = guildIds[i];
            botmessage.edit("サーバーコマンドを" + guildIds.length + "中" + (i + 1) + "つ目の「" + client.guilds.cache.get(guildId)?.name + "/" + guildId + "」に登録しています...時間がかかります。");
            await rest.put(Discord.Routes.applicationGuildCommands(clientId, guildId), { body: body });
            botmessage.edit("サーバーコマンドを" + guildIds.length + "中" + (i + 1) + "つ目の「" + client.guilds.cache.get(guildId)?.name + "/" + guildId + "」から削除しています...");
            await rest.put(Discord.Routes.applicationGuildCommands(clientId, guildId), { body: [] });
        }
        botmessage.edit("グローバルコマンドを登録しました。");
        return;
    }
    // 1. bot呼び出しでないものをスキップする。
    if (!message.guildId || !message.member || !message.guild) return message.reply("ごめん！！エラーっす！www");
    if (message.content === "VCの皆、成仏せよ") {
        return message.reply("ただいまVCの皆を成仏させることができません。botのアップデートにご協力ください。");
    }
})
