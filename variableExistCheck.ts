import * as Discord from "discord.js";
import * as DiscordVoice from "@discordjs/voice";
import { EnvData } from "./envJSON.js";
import { ServersDataClass } from "./serversData.js";
import { Player } from "./player.js";
import { messageEmbedGet } from "./embed.js";
import { ChannelType, ChatInputCommandInteraction, GuildMember, PermissionsBitField, VoiceBasedChannel } from "discord.js";
import { SumLog } from "./sumLog.js";

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
            try { await this.interaction.editReply({ embeds: [messageEmbedGet("このコマンドはサーバーでのみ利用できます。", this.interaction.client)] }); } catch (e) { }
            SumLog.log("サーバーデータを取得できなかったので処理を中断しました。", { guildId: this.interaction.guildId || undefined, userId: this.interaction.user.id, functionName: "VariableExistCheck", textChannelId: this.interaction.channelId });
            return undefined;
        }
        return { guildId: this.interaction.guildId, guild: this.interaction.guild, member: this.interaction.member };
    }
    async voiceChannelId() {
        const guildData = await this.guild();
        if (guildData === undefined) return undefined;
        const vchannelId = (guildData.member as Discord.GuildMember).voice.channelId;
        if (!vchannelId) {
            try { await this.interaction.editReply({ embeds: [messageEmbedGet("あなたがVCに参加していません。使用したいVCの場所を指定するには、VCに参加してください。", this.interaction.client)] }); } catch (e) { }
            SumLog.log("VCデータを取得できなかったので処理を中断しました。", { guildId: this.interaction.guildId || undefined, userId: this.interaction.user.id, functionName: "VariableExistCheck", textChannelId: this.interaction.channelId });
            return undefined;
        }
        /**
         * 実行ユーザーが今いるVCに対して「Bot」と「ユーザー」が
         * 参加(Connect)＋発言(Speak)できるなら true。
         * それ以外（DM/未参加/型不一致/権限不足/想定外）はすべて false を返す。
         * 例外は投げません（throw/try未使用）。
         */
        function canBothJoinAndSpeak(interaction: ChatInputCommandInteraction): boolean {
            // 基本前提が揃っていなければ false
            if (!interaction || !interaction.guild || !interaction.member) return false;

            const member = interaction.member as GuildMember;
            const vc = getInvokersVoiceChannel(member);
            if (!vc) return false;

            // 対象がVC以外（例: ステージ以外の未知タイプ）は false
            if (!isVoiceOrStage(vc)) return false;

            const me = interaction.guild.members.me;
            if (!me) return false;

            // Bot権限チェック
            const botPerms = me.permissionsIn(vc.id);
            if (!hasJoinAndSpeak(botPerms, vc.type)) return false;

            // ユーザー権限チェック
            const userPerms = member.permissionsIn(vc.id);
            if (!hasJoinAndSpeak(userPerms, vc.type)) return false;

            return true;
        }

        /* ===== ヘルパ ===== */

        function getInvokersVoiceChannel(member: GuildMember): VoiceBasedChannel | null {
            // voice または stage に居なければ null
            const ch = member.voice?.channel ?? null;
            return ch ?? null;
        }

        function isVoiceOrStage(channel: VoiceBasedChannel): boolean {
            return (
                channel.type === ChannelType.GuildVoice ||
                channel.type === ChannelType.GuildStageVoice
            );
        }

        function hasJoinAndSpeak(perms: PermissionsBitField, chType: ChannelType): boolean {
            if (!perms) return false;

            // 共通（見る＋入る）
            if (!perms.has(PermissionsBitField.Flags.ViewChannel)) return false;
            if (!perms.has(PermissionsBitField.Flags.Connect)) return false;

            // 発言（Voice と Stage で判定を分ける）
            if (chType === ChannelType.GuildVoice) {
                // 通常VCは Speak が必要
                return perms.has(PermissionsBitField.Flags.Speak);
            }

            if (chType === ChannelType.GuildStageVoice) {
                // Stage は Speak 権限が無いことが多いので、
                // 1) Speak がある もしくは 2) RequestToSpeak がある のどちらかを満たせば「発言可能」とみなす
                return (
                    perms.has(PermissionsBitField.Flags.Speak) ||
                    perms.has(PermissionsBitField.Flags.RequestToSpeak)
                );
            }

            // 想定外タイプは false（ここには来ない想定だがthrowはしない）
            return false;
        }
        if (!this.interaction.isChatInputCommand() || !canBothJoinAndSpeak(this.interaction)) {
            try { await this.interaction.editReply({ embeds: [messageEmbedGet("あなたが参加しているVCに入る権限がなく、操作を実行できませんでした。", this.interaction.client)] }); } catch (e) { }
            return undefined;
        }
        return vchannelId;
    }
    /** キューを取得します。正しく取得できないと自動でユーザーに連絡されるので、undefinedだった場合の処理は不要です。 */
    async playlist() {
        const guildData = await this.guild();
        if (guildData === undefined) return undefined;
        const envData = new EnvData(guildData.guildId);
        return envData.playlistGet();
    }
    /** キューが空かどうかを検証します。からだったらfalse、じゃなければtrue、そもそも前提データがない場合はundefinedです。 */
    async playlistIsEmpty() {
        const guildData = await this.guild();
        if (guildData === undefined) return undefined;
        const playlist = await this.playlist();
        if (!playlist) return undefined;
        if (playlist.length === 0) {
            try { await this.interaction.editReply({ embeds: [messageEmbedGet("キューが空っぽです。`/add text:[タイトルまたはURL]`で曲を追加してください。", this.interaction.client)] }); } catch (e) { }
            SumLog.log("プレイリストが空でした。", { guildId: this.interaction.guildId || undefined, userId: this.interaction.user.id, functionName: "VariableExistCheck", textChannelId: this.interaction.channelId });
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
            try { await this.interaction.editReply({ embeds: [messageEmbedGet("謎のエラーです。管理者には「サーバーデータの処理に失敗」とお伝えください。", this.interaction.client)] }); } catch (e) { }
            SumLog.error("サーバーデータの処理に失敗しました。", { guildId: this.interaction.guildId || undefined, userId: this.interaction.user.id, functionName: "VariableExistCheck", textChannelId: this.interaction.channelId });
            return undefined;
        }
        return serverData;
    }
    async playerIsPlaying(player: Player) {
        const guildData = await this.guild();
        if (!guildData) return;
        if (player.playingGet(guildData.guildId)) {
            try { await this.interaction.editReply({ embeds: [messageEmbedGet("すでに再生中です。`/help`で使い方をみることができます。", this.interaction.client)] }); } catch (e) { };
            SumLog.log("既に再生中です。", { guildId: this.interaction.guildId || undefined, userId: this.interaction.user.id, functionName: "VariableExistCheck", textChannelId: this.interaction.channelId });
            return true;
        } else return false;
    }
    async playerIsNotPlaying(player: Player) {
        const guildData = await this.guild();
        if (!guildData) return;
        if (!player.playingGet(guildData.guildId)) {
            try { await this.interaction.editReply({ embeds: [messageEmbedGet("再生されていないためその操作はできません。`/help`で使い方をみることができます。", this.interaction.client)] }); } catch (e) { };
            SumLog.log("再生されていませんでした。", { guildId: this.interaction.guildId || undefined, userId: this.interaction.user.id, functionName: "VariableExistCheck", textChannelId: this.interaction.channelId });
            return true;
        } else return false;
    }
}
