import { Client } from "discord.js";
import mysql from "mysql2/promise";

export interface SumInfo {
    /** 20文字までです。 */
    functionName: string;
    guildId?: string;
    textChannelId?: string;
    voiceChannelId?: string
    client?: Client;
    userId?: string;
}

export interface SumLogJSON {
    message?: string;
    type?: string;
    info?: {
        functionName?: string;
        guild?: {
            id?: string;
            name?: string;
        }
        textChannelId?: {
            id?: string;
            name?: string;
        }
        voiceChannelId?: {
            id?: string;
            name?: string;
        }
        userId?: {
            id?: string;
            globalName?: string | null;
            displayName?: string;
            username?: string;
        }
    };
    date?: number;
}
/**
 * # かずなみが見やすいと思うログを表示するやつだよ！！！！
 * 
 * １つ１つの進捗をめっさ見やすく表示するやつだよ！普通のconsole.logとかerrorとかはもう信用しない！AIが書かない、純粋に僕がみるようのやつだよ！
 */
export class SumLog {
    db: mysql.Connection;
    constructor(db: mysql.Pool) { this.db = db; }
    client?: Client;
    logWrite(message: string, info: SumInfo, type: string) {
        if (info.client) this.client = info.client;
        const guild = info.guildId ? this.client?.guilds.cache.get(info.guildId) : undefined;
        const textChannel = info.textChannelId ? guild?.channels.cache.get(info.textChannelId) : undefined;
        const voiceChannel = info.voiceChannelId ? guild?.channels.cache.get(info.voiceChannelId) : undefined;
        const user = info.userId ? this.client?.users.cache.get(info.userId) : undefined;
        const json: SumLogJSON = {
            message, type, info: {
                functionName: info.functionName,
                guild: info.guildId && guild ? {
                    id: info.guildId,
                    name: guild.name,
                } : undefined,
                textChannelId: info.textChannelId && textChannel ? {
                    id: info.textChannelId,
                    name: textChannel.name
                } : undefined,
                voiceChannelId: info.voiceChannelId && voiceChannel ? {
                    id: info.voiceChannelId,
                    name: voiceChannel.name
                } : undefined,
                userId: info.userId && user ? {
                    id: info.userId,
                    globalName: user.globalName,
                    displayName: user.displayName,
                    username: user.username
                } : undefined
            },
            date: Date.now()
        };
        (async () => {
            await this.db.execute(
                `
            INSERT INTO sumlog (
                msg,
                funcname,
                guildId,
                guildName,
                channelId,
                channelName,
                vcId,
                vcName,
                userId,
                userName,
                userGName,
                userDName,
                createtime,
                type
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ? ,? ,? ,? ,?, ?)
            `, [
                json?.message ?? null,
                json?.info?.functionName ?? null,
                json?.info?.guild?.id ?? null,
                json?.info?.guild?.name ?? null,
                json?.info?.textChannelId?.id ?? null,
                json?.info?.textChannelId?.name ?? null,
                json?.info?.voiceChannelId?.id ?? null,
                json?.info?.voiceChannelId?.name ?? null,
                json?.info?.userId?.id ?? null,
                json?.info?.userId?.username ?? null,
                json?.info?.userId?.globalName ?? null,
                json?.info?.userId?.displayName ?? null,
                json?.date ? new Date(json.date) : null,
                json?.type ?? null
            ]
            )
        })();
    }
    log(message: string, info: SumInfo) {
        this.logWrite(message, info, "log");
    }
    warn(message: string, info: SumInfo) {
        this.logWrite(message, info, "warn");
    }
    error(message: string, info: SumInfo) {
        this.logWrite(message, info, "error");
    }
};
