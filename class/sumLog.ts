import { Client } from "discord.js";
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "fs";

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
    static #logWrite(message: string, info: SumInfo, type: string) {
        if (!existsSync("./log")) mkdirSync("./log");
        if (!existsSync("./log/sumlogJSON.jsonl")) writeFileSync("./log/sumlogJSON.jsonl", "");
        const guild = info.guildId ? info.client?.guilds.cache.get(info.guildId) : undefined;
        const textChannel = info.textChannelId ? guild?.channels.cache.get(info.textChannelId) : undefined;
        const voiceChannel = info.voiceChannelId ? guild?.channels.cache.get(info.voiceChannelId) : undefined;
        const user = info.userId ? info.client?.users.cache.get(info.userId) : undefined;
        const saveJSON: SumLogJSON = {
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
        appendFileSync("./log/sumlogJSON.jsonl", "\n" + JSON.stringify(saveJSON));
    }
    static log(message: string, info: SumInfo) {
        this.#logWrite(message, info, "log");
    }
    static warn(message: string, info: SumInfo) {
        this.#logWrite(message, info, "warn");
    }
    static error(message: string, info: SumInfo) {
        this.#logWrite(message, info, "error");
    }
}
