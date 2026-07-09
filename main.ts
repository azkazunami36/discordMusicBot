import * as Discord from "discord.js";
import mysql from "mysql2/promise";
import "dotenv/config";

import { SumLog } from "./class/sumLog.js";
import { ClientOn } from "./class/clientOn.js";
import { DBmgrAPI } from "./dbmgrAPI.js";
import { Player } from "./class/player.js";

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

const db = mysql.createPool({
    host: "localhost",
    user: "root",
    database: "musicbot"
});

const sumlog = new SumLog(db);
const dbmgr = new DBmgrAPI();
const player = new Player(client, db);
new ClientOn(client, sumlog, db, dbmgr, player);

await client.login(process.env.DISCORD_TOKEN);

console.log("起動したよ");
