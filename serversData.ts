import { EnvData } from "./envJSON.js";
import * as DiscordVoice from "@discordjs/voice";
import { Client } from "discord.js";

import { ServersData } from "./interface.js";
import { PlayerSet } from "./playerSet.js";
import { FfmpegResourcePlayer } from "./ffmpegResourcePlayer.js";
import { videoCache } from "./videoMetaCache.js";

export class ServersDataClass {
    /** サーバーごとに記録する必要のある一時データです。 */
    serversData: ServersData = {};
    /** サーバー内でプレイヤーを使っている時に、曲が停止した後の処理を行います。 */
    playSet?: PlayerSet;
    private client: Client;
    constructor(client: Client) {
        this.client = client;
    }
    /** サーバーデータに必要なデータを定義します。 */
    serverDataInit(guildId: string) {
        this.serversData[guildId] = { discord: { ffmpegResourcePlayer: new FfmpegResourcePlayer() } };
        this.serversData[guildId]?.discord.ffmpegResourcePlayer.player.on(DiscordVoice.AudioPlayerStatus.Idle, async (oldState, newState) => {
            if (this.playSet === undefined) return;
            const serverData = this.serversData[guildId];
            if (!serverData || !serverData.discord.calledChannel) return;
            const envData = new EnvData(guildId);
            const playlist = envData.playlistGet();
            const playType = envData.playType;
            if ((playType && playType === 1 && playlist.length > 1) || (playType && (playType === 2 || playType === 3) && playlist.length > 0)) {
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
                if (envData.changeTellIs) {
                    const channel = this.client.guilds.cache.get(guildId)?.channels.cache.get(serverData.discord.calledChannel);
                    if (channel && channel.isTextBased()) {
                        const playlistData = playlist[0];
                        const title = playlistData.type === "videoId" ? (await videoCache.cacheGet(playlistData.body) || { title: "タイトル取得エラー(VideoID: " + playlistData.body + ")" }).title : playlistData.body;
                        const message = await channel.send("次の曲「" + title + "」の再生準備中...0%");
                        let statusTemp: {
                            status: "loading" | "downloading" | "formatchoosing" | "converting" | "done",
                            body: { percent?: number; };
                        }
                        let statuscallTime: number = Date.now();
                        await this.playSet.playerSetAndPlay(guildId, async (status, body) => {
                            const temp = { status, body }
                            if (statusTemp && statusTemp === temp) return;
                            if (statusTemp && statusTemp.status === status && Date.now() - statuscallTime < 500) return;
                            statusTemp = temp;
                            statuscallTime = Date.now();
                            if (status === "loading") await message.edit("次の曲「" + title + "」の音声ファイルを準備中..." + (body.percent ? Math.floor(body.percent) + "%" : ""));
                            if (status === "downloading") await message.edit("次の曲「" + title + "」の音声ファイルをダウンロード中..." + (body.percent ? Math.floor(body.percent) + "%" : ""));
                            if (status === "converting") await message.edit("次の曲「" + title + "」の音声ファイルを再生可能な形式に変換中...少々お待ちください..." + (body.percent ? Math.floor(body.percent) + "%" : ""));
                            if (status === "formatchoosing") await message.edit("次の曲「" + title + "」のYouTubeサーバーに保管されたフォーマットの調査中..." + (body.percent ? Math.floor(body.percent) + "%" : ""));
                        });
                        await message.edit("次の曲「" + title + "」を再生しています。");
                    }
                }
            } else {
                const channel = this.client.guilds.cache.get(guildId)?.channels.cache.get(serverData.discord.calledChannel);
                if (channel && channel.isTextBased()) {
                    channel.send("次の曲がなかったため切断しました。また`!music タイトルまたはURL`を行ってください。");
                }
                this.playSet.playerStop(guildId);
            }
        });
    }
}


