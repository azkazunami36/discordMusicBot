import * as Discord from "discord.js";
import * as DiscordVoice from "@discordjs/voice";
import fs from "fs";
import "dotenv/config";
import { Writable } from "stream";

import { EnvData } from "./envJSON.js";
import { videoCache } from "./videoMetaCache.js";
import { PlayerSet } from "./playerSet.js";
import { ServersDataClass } from "./serversData.js";
import { InteractionInputData } from "./interface.js";

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

/** Discordサーバーに関するデータを一時的に記録しているデータを扱うクラスです。 */
const serversDataClass = new ServersDataClass(client);
/** サーバーごとに記録する必要のある一時データです。 */
const serversData = serversDataClass.serversData;
/** サーバーに記録されたプレイリストの内容をセットしたり、プレイヤーを設定したりするのを自動で行います。 */
const playerSet = new PlayerSet(serversData);
serversDataClass.playSet = playerSet;
const { playerSetAndPlay } = playerSet;

const runedServerTime: { guildId: string; runedTime: number; }[] = []
const runlimit = 1000;
client.on(Discord.Events.InteractionCreate, async interaction => {
    if (!interaction.isCommand()) return;
    const data = interactionFuncs.find(d => d.command?.name === interaction.commandName)
    if (data && data.command && data.execute) {
        if (interaction.guildId) {
            const envData = new EnvData(interaction.guildId);
            const callchannelId = envData.callchannelId;
            if (callchannelId && callchannelId != interaction.channelId) return;
            if (!runedServerTime.find(data => data.guildId === interaction.guildId)) runedServerTime.push({ guildId: interaction.guildId, runedTime: 0 });
            const runed = runedServerTime.find(data => data.guildId === interaction.guildId);
            if (runed) {
                if (Date.now() - runed.runedTime < runlimit) return interaction.reply("コマンドは" + (runlimit / 1000) + "秒に1回までです。もう少しお待ちください。");
                runed.runedTime = Date.now();
            }
        }
        const inputData: InteractionInputData = { serversDataClass, videoCache, playerSet };
        await interaction.reply("コマンド「" + data.command.name + "」の処理を開始しています...");
        await data.execute(interaction, inputData);
    }
});

client.on(Discord.Events.ClientReady, () => {
    console.log("OK " + client.user?.displayName);
    client.user?.setStatus("online");
});
client.on(Discord.Events.VoiceStateUpdate, async (oldState, newState) => {
    const channel = newState.guild.channels.cache.get(newState.channelId || oldState.channelId || "");
    if (!channel || !channel.isVoiceBased()) return;
    if (channel.members.size < 2) {
        const serverData = serversData[newState.guild.id];
        if (serverData && serverData.discord.calledChannel) {
            const channel = newState.guild.channels.cache.get(serverData.discord.calledChannel);
            if (channel && channel.isTextBased()) {
                channel.send("全員が退出したため、再生を停止します。また再度VCに参加して`/play`を実行すると再生できます。");
            }
        }
        await playerSet.playerStop(newState.guild.id);
    }
})
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
    // 1. bot呼び出しでないものをスキップする。
    if (!message.guildId || !message.member || !message.guild) return message.reply("ごめん！！エラーっす！www");
    if (!serversData[message.guildId]) serversDataClass.serverDataInit(message.guildId);
    const serverData = serversData[message.guildId];
    if (!serverData) return message.reply("ごめん！！エラーっす！www");
    const envData = new EnvData(message.guildId);
    const callchannelId = envData.callchannelId;
    if (callchannelId && callchannelId != message.channelId) return;
    const playlist = envData.playlistGet();
    const originalFiles = envData.originalFilesGet();
    if (message.content === "VCの皆、成仏せよ") {
        if (!message.member.voice.channelId) return;
        if (!runedServerTime.find(data => data.guildId === message.guildId)) runedServerTime.push({ guildId: message.guildId, runedTime: 0 });
        const runed = runedServerTime.find(data => data.guildId === message.guildId);
        if (runed) {
            if (Date.now() - runed.runedTime < runlimit) return message.reply("コマンドは" + (runlimit / 1000) + "秒に1回までです。もう少しお待ちください。");
            runed.runedTime = Date.now();
        }
        if ((joubutuNumber++) >= bt.length - 1) joubutuNumber = 0;
        const { name, videoId } = bt[joubutuNumber];
        const deletedVideoId = playlist.shift();
        playlist.unshift({
            type: "videoId",
            body: videoId
        });
        envData.playlistSave(playlist);
        const connection = DiscordVoice.joinVoiceChannel({ channelId: message.member.voice.channelId, guildId: message.guildId, adapterCreator: message.guild.voiceAdapterCreator });
        await DiscordVoice.entersState(connection, DiscordVoice.VoiceConnectionStatus.Ready, 10000);
        connection.subscribe(serverData.discord.ffmpegResourcePlayer.player);
        serverData.discord.calledChannel = message.channelId;
        const number = 1145141919;
        const volume = envData.volume;
        envData.volume = number;
        await playerSetAndPlay(message.guildId);
        await message.reply(name + "の日です。音量を" + 1145141919 + "%にしました。音割れをお楽しみください。プレイリストや設定は変更していないため、次の曲からは音量は" + volume + "%に戻ります。");
        envData.volume = volume;
        playlist.shift();
        if (deletedVideoId) playlist.unshift(deletedVideoId);
        envData.playlistSave(playlist);
        return;
    }
    if (message.content.startsWith("!musiec-addfile")) {
        const title = message.content.slice(15, message.content.length).split(/\s/g)[0];
        if (!title) return message.reply("曲名を指定してください。");
        if (title.length < 2) return message.reply("曲名は２文字以上にしてください。");
        if (envData.originalFilesGet().find(file => file.callName == title)) return message.reply("すでにその曲名は存在しています。他の名前を使用するか、数字を後に足すなどを行なってください。");
        const file = message.attachments.first();
        if (!file) return message.reply("ファイルが見つかりませんでした。ファイルを選んでください。");
        const res = await fetch(file.url);
        if (!res.ok || !res.body) return message.reply("内部エラーが発生しました。エラーは`" + res.status + "/" + res.statusText + "`です。もう一度試してください。何度も失敗する場合はあんこかずなみ36");
        const cacheFileName = "./cache/" + title
        const stream = fs.createWriteStream(cacheFileName);
        // WHATWG ReadableStream → WHATWG WritableStream (Node層へブリッジ)
        await res.body.pipeTo(Writable.toWeb(stream));

        envData.originalFilesGet();
    }
})

client.login(process.env.DISCORD_TOKEN);
