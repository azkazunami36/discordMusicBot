import { ServersDataClass } from "../class/serversData.js";
import { Player } from "../class/player.js";
import { Playlist } from "../class/envJSON.js";

export interface ServersData {
    [guildId: string]: {
        discord: {
            calledChannel?: string;
            /** 最後に検索されたデータです。timeが5分以上の場合は失効としましょう。 */
            search?: {
                time: number;
                list: Playlist[];
            }
        }
        users?: {
            [userId: string]: {
                /** 曲を聴き始めた時間です。再生時間を算出するのに役立ちます。 */
                startTime?: number;
            };
        }
    } | undefined;
}

export interface InteractionInputData {
    serversDataClass: ServersDataClass;
    player: Player;
}
