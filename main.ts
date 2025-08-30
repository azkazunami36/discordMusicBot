import * as Discord from "discord.js";
import * as DiscordVoice from "@discordjs/voice";
import fs from "fs";
import "dotenv/config";
import { Writable } from "stream";

import { envJSON } from "./envJSON.js";
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
        execute: (interaction: Discord.Interaction, inputData: InteractionInputData) => Promise<void>;
        command: Discord.SlashCommandOptionsOnlyBuilder;
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
const { playerSetAndPlay, playerStop } = playerSet;

client.on(Discord.Events.InteractionCreate, async interaction => {
    if (!interaction.isCommand()) return;
    const inputData: InteractionInputData = { serversDataClass, videoCache, playerSet };
    const data = interactionFuncs.find(d => d.command.name === interaction.commandName)
    if (data) {
        await interaction.reply("コマンド「" + data.command.name + "」の処理を開始しています...");
        await data.execute(interaction, inputData);
    }
});

client.on(Discord.Events.ClientReady, () => {
    console.log("OK " + client.user?.displayName);
    client.user?.setStatus("online");
});

client.on(Discord.Events.MessageCreate, async message => {
    // 1. bot呼び出しでないものをスキップする。
    if (!message.guildId || !message.member || !message.guild) return message.reply("ごめん！！エラーっす！www");
    if (!serversData[message.guildId]) serversDataClass.serverDataInit(message.guildId);
    const serverData = serversData[message.guildId];
    if (!serverData) return message.reply("ごめん！！エラーっす！www");
    const callchannelId = envJSON(message.guildId, "callchannelId");
    const playlist = (() => {
        const playlist = envJSON(message.guildId, "playlist");
        if (playlist === undefined) return envJSON(message.guildId, "playlist", "[]");
        return playlist;
    })();
    if (!playlist) return message.reply("謎のエラーです。管理者には「プレイリストの処理でエラーが発生した」とお伝えください。");
    const playlistJSON: string[] = JSON.parse(playlist);
    const originalFiles = (() => {
        const originalFiles = envJSON(message.guildId, "originalFiles");
        if (originalFiles === undefined) return envJSON(message.guildId, "originalFiles", "[]");
        return originalFiles;
    })();
    if (!originalFiles) return message.reply("謎のエラーです。管理者には「オリジナルファイルデータの取得でエラーが発生した」とお伝えください。");
    const originalFilesJSON: {
        callName: string;
        fileName: string;
    }[] = JSON.parse(originalFiles);
    if (message.content === "VCの皆、成仏せよ") {
        if (!message.member.voice.channelId) return;
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
        const select = Math.floor(Math.random() * bt.length);
        const { name, videoId } = bt[select];
        if (playlistJSON.length > 0) playlistJSON.pop();
        playlistJSON.unshift(videoId);
        envJSON(message.guildId, "playlist", JSON.stringify(playlistJSON));
        if (serverData.discord.resource) await playerStop(message.guildId);
        const connection = DiscordVoice.joinVoiceChannel({ channelId: message.member.voice.channelId, guildId: message.guildId, adapterCreator: message.guild.voiceAdapterCreator });
        connection.subscribe(serverData.discord.player);
        serverData.discord.calledChannel = message.channelId;
        const number = 1145141919;
        envJSON(message.guildId, "volume", String(number));
        await playerSetAndPlay(message.guildId);
        serverData.discord.resource?.volume?.setVolume(number / 750);
        message.reply(name + "の日です。音量を" + 1145141919 + "%にしました。次回再生時は`/volume vol:100`を実行してください。");
        return;
    }
    if (!message.content.startsWith("!music") || message.author.bot || callchannelId && callchannelId != message.channelId) return;
    if (message.content.startsWith("!music-callch")) {
        const channelId = message.content.slice(14, message.content.length);
        if (message.guild?.channels.cache.get(channelId)) {
            envJSON(message.guildId, "callchannelId", channelId);
            message.reply("このチャンネルでのみコマンドを受け付けるように設定しました。他のチャンネルではコマンドは使用できません。");
        } else {
            envJSON(message.guildId, "callchannelId", "");
            message.reply("どのチャンネルでもコマンドが利用できるように設定しました。");
        }
    }
    if (message.content.startsWith("!music-addfile")) {
        const title = message.content.slice(15, message.content.length).split(/\s/g)[0];
        if (!title) return message.reply("曲名を指定してください。");
        if (title.length < 2) return message.reply("曲名は２文字以上にしてください。");
        if (originalFilesJSON.find(file => file.callName == title)) return message.reply("すでにその曲名は存在しています。他の名前を使用するか、数字を後に足すなどを行なってください。");
        const file = message.attachments.first();
        if (!file) return message.reply("ファイルが見つかりませんでした。ファイルを選んでください。");
        const res = await fetch(file.url);
        if (!res.ok || !res.body) return message.reply("内部エラーが発生しました。エラーは`" + res.status + "/" + res.statusText + "`です。もう一度試してください。何度も失敗する場合はあんこかずなみ36");
        const cacheFileName = "./cache/" + title
        const stream = fs.createWriteStream(cacheFileName);
        // WHATWG ReadableStream → WHATWG WritableStream (Node層へブリッジ)
        await res.body.pipeTo(Writable.toWeb(stream));

        envJSON(message.guildId, "originalFiles");
    }
})

client.login(process.env.DISCORD_TOKEN);
