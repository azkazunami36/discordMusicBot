import { Client } from "discord.js";
import { ServersDataClass } from "./serversData.js";
import express from "express";
import fs from "fs";

/**
 * やる気があったらプレイヤーをGUIで操作できるようにします。  
 * https://music-bot.azkazunami36-page.uk を利用します。GUIサイトは現時点でGitHub Pagesより利用可能になる予定です。このリポジトリ「discordMusicBot」のguiフォルダをPagesに割り当てます。  
 * 現在はまだやる気がないのでリッスンされません。
 */
export class WebPlayerAPI {
    serversDataClass: ServersDataClass;
    client: Client;
    express: express.Express;
    constructor(serversDataClass: ServersDataClass, client: Client) {
        this.serversDataClass = serversDataClass;
        this.client = client;
        this.express = express();
        const app = this.express;
        app.get("/{*youtube}", (req, res) => { if (fs.existsSync(process.cwd() + "/youtubeCache/" + req.url.split("/")[2])) res.sendFile(process.cwd() + "/youtubeCache/" + req.url.split("/")[2]); else { res.status(404), res.end() } });
        app.get("/{*niconico}", (req, res) => { if (fs.existsSync(process.cwd() + "/niconicoCache/" + req.url.split("/")[2])) res.sendFile(process.cwd() + "/niconicoCache/" + req.url.split("/")[2]); else { res.status(404), res.end() } });
        app.post("/request", async (req, res) => {
            // クライアントからのリクエストがすべてここに来ます。
        });
        app.post("/statusSend", async (req, res) => {
            // クライアントが空のデータを渡します。必要に応じて返答します。
        });
        if (false) app.listen("5800", err => { console.log("WebPlayerAPI 5080 起動済み") });
    }
}
