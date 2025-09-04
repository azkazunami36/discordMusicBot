import * as Discord from "discord.js";
import * as DiscordVoice from "@discordjs/voice";
import { EnvData } from "./envJSON.js";
import { ServersDataClass } from "./serversData.js";
import { Player } from "./player.js";

/**
 * 変数の存在をチェックし、存在しない変数があるとundefinedを返すだけでなく自動でeditReplyをします。replyを予め行なってください。
 */
export class VariableExistCheck {
    interaction: Discord.CommandInteraction;
    constructor(interaction: Discord.CommandInteraction) {
        this.interaction = interaction;
    }
    /** サーバーで実行しているかどうかの検証に役立ちます。 */
    async guild() {
        if (!this.interaction.guildId || !this.interaction.guild || !this.interaction.member) {
            try { await this.interaction.editReply("このコマンドはサーバーでのみ利用できます。"); } catch (e) { }
            return undefined;
        }
        return { guildId: this.interaction.guildId, guild: this.interaction.guild, member: this.interaction.member };
    }
    async voiceChannelId() {
        const guildData = await this.guild();
        if (guildData === undefined) return undefined;
        const vchannelId = (guildData.member as Discord.GuildMember).voice.channelId;
        if (!vchannelId) {
            try { await this.interaction.editReply("ボイチャに入ってないとどこに入ればいいかわかりません。できればボイチャ入っててください。"); } catch (e) { }
            return undefined;
        }
        return vchannelId;
    }
    /** プレイリストを取得します。正しく取得できないと自動でユーザーに連絡されるので、undefinedだった場合の処理は不要です。 */
    async playlist() {
        const guildData = await this.guild();
        if (guildData === undefined) return undefined;
        const envData = new EnvData(guildData.guildId);
        return envData.playlistGet();
    }
    /** プレイリストが空かどうかを検証します。からだったらfalse、じゃなければtrue、そもそも前提データがない場合はundefinedです。 */
    async playlistIsEmpty() {
        const guildData = await this.guild();
        if (guildData === undefined) return undefined;
        const playlist = await this.playlist();
        if (!playlist) return undefined;
        if (playlist.length === 0) {
            try { await this.interaction.editReply("プレイリストが空っぽです。`/add text:[タイトルまたはURL]`で曲を追加してください。"); } catch (e) { }
            return true;
        }
        return false;
    }
    async serverData(serversDataClass: ServersDataClass) {
        const guildData = await this.guild();
        if (guildData === undefined) return undefined;
        if (!serversDataClass.serversData[guildData.guildId]) serversDataClass.serverDataInit(guildData.guildId);
        const serverData = serversDataClass.serversData[guildData.guildId];
        if (serverData === undefined) {
            try { await this.interaction.editReply("謎のエラーです。管理者には「サーバーデータの処理に失敗」とお伝えください。"); } catch (e) { }
            return undefined;
        }
        return serverData;
    }
    async playerIsPlaying(player: Player) {
        const guildData = await this.guild();
        if (!guildData) return;
        if (player.playingGet(guildData.guildId)) {
            try { await this.interaction.editReply("すでに再生中です。`/help`で使い方をみることができます。"); } catch (e) { };
            return true;
        } else return false;
    }
    async playerIsNotPlaying(player: Player) {
        const guildData = await this.guild();
        if (!guildData) return;
        if (!player.playingGet(guildData.guildId)) {
            try { await this.interaction.editReply("再生されていないためその操作はできません。`/help`で使い方をみることができます。"); } catch (e) { };
            return true;
        } else return false;
    }
}
