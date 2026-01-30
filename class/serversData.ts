import { Client, EmbedBuilder } from "discord.js";

import { ServersData } from "../funcs/interface.js";

export class ServersDataClass {
    /** サーバーごとに記録する必要のある一時データです。 */
    serversData: ServersData = {};
    private client: Client;
    constructor(client: Client) {
        this.client = client;
    }
    /** サーバーデータに必要なデータを定義します。 */
    serverDataInit(guildId: string) {
        this.serversData[guildId] = { discord: {} };
    }
}
