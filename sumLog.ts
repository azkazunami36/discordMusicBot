import { Client } from "discord.js";
import { appendFileSync, existsSync, writeFileSync } from "fs";

function padStringWithSpaces(str: string, length: number): string {
  // 文字列の実際の長さを全角・半角で計算
  const calcLength = Array.from(str).reduce((sum, ch) => {
    // 全角文字は2、半角は1
    return sum + (ch.match(/[ -~]/) ? 1 : 2);
  }, 0);

  // 足りない分のスペース数を算出
  const diff = length - calcLength;
  if (diff > 0) {
    return str + ' '.repeat(diff);
  } else {
    return str;
  }
}

function formatJapaneseDate(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  const second = String(date.getSeconds()).padStart(2, "0");

  return `${year}年${month}月${day}日${hour}時${minute}分${second}秒`;
}

export interface SumInfo {
  /** 20文字までです。 */
  functionName: string;
  guildId?: string;
  textChannelId?: string;
  voiceChannelId?: string
  client?: Client;
  userId?: string;
}
/**
 * # かずなみが見やすいと思うログを表示するやつだよ！！！！
 * 
 * １つ１つの進捗をめっさ見やすく表示するやつだよ！普通のconsole.logとかerrorとかはもう信用しない！AIが書かない、純粋に僕がみるようのやつだよ！
 */
export class SumLog {
  static #logWrite(message: string, info: SumInfo, type: string) {
    if (!existsSync("./log/sumlogJSON.jsonl")) writeFileSync("./log/sumlogJSON.jsonl", "");
    const guild = info.guildId ? info.client?.guilds.cache.get(info.guildId) : undefined;
    const textChannel = info.textChannelId ? guild?.channels.cache.get(info.textChannelId) : undefined;
    const voiceChannel = info.voiceChannelId ? guild?.channels.cache.get(info.voiceChannelId) : undefined;
    const user = info.userId ? info.client?.users.cache.get(info.userId) : undefined;
    let text = formatJapaneseDate(Date.now()) +
      "|" + padStringWithSpaces(type.slice(0, 5), 5) + ":" + padStringWithSpaces(info.functionName.slice(0, 20), 20) +
      "|sv:" + padStringWithSpaces(guild ? guild.name.slice(0, 10) || "" : "", 10) +
      "|ch:" + padStringWithSpaces(textChannel ? textChannel.name.slice(0, 10) || "" : "", 10) +
      "|vc:" + padStringWithSpaces(voiceChannel ? voiceChannel.name.slice(0, 10) || "" : "", 10) +
      "|us:" + padStringWithSpaces(user ? (user.globalName || user.displayName).slice(0, 10) || "" : "", 10) +
      "|" + message;
    appendFileSync("./log/sumlogJSON.jsonl", "\n" + JSON.stringify({
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
      }, date: Date.now()
    }));
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
