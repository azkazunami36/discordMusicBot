import * as Discord from "discord.js";
import mysql from "mysql2/promise";
import { SumLog } from "./sumLog.js";
import { messageEmbedGet, videoInfoEmbedGet } from "../func/embed.js";
import { DBmgrAPI, Unidata } from "../dbmgrAPI.js";
import { ServerInfoAPI, serviceTypeCheck } from "../dbAPIs.js";
import { GuildVoicePlayer, Player } from "./player.js";
import { dbmgrErrorCodeParser, dbmgrErrorCodePriorityCheck } from "../func/dbmgrErrorCodeParser.js";

class VariableExistCheck {
    interaction: Discord.ChatInputCommandInteraction<Discord.CacheType>;
    message: ReplyMessage;
    sumlog: SumLog;
    constructor(interaction: Discord.ChatInputCommandInteraction<Discord.CacheType>, message: ReplyMessage, sumlog: SumLog) {
        this.interaction = interaction;
        this.message = message;
        this.sumlog = sumlog;
    }
    /** サーバー内であるかどうか */
    guild(guild: Discord.Guild | null): guild is Discord.Guild {
        const status = guild !== null;
        if (status) return true;
        else {
            (async () => {
                try {
                    this.message.sendMessage("このコマンドはサーバーでのみ利用できます。");
                } catch { }
                this.sumlog.log("サーバーデータを取得できなかったので処理を中断しました。", { guildId: this.interaction.guild?.id || undefined, userId: this.interaction.user.id, functionName: "VariableExistCheck", textChannelId: this.interaction.channel?.id });
            })();
            return false;
        }
    }
    /** サーバーメンバーであるかどうか(サーバーに入ってるかという意味かな？) */
    member(member: Discord.GuildMember | Discord.APIInteractionGuildMember | null): member is Discord.GuildMember {
        const status = member instanceof Discord.GuildMember;
        if (status) return true;
        else {
            (async () => {
                try {
                    this.message.sendMessage("サーバー用ユーザーデータが取得できませんでした。");
                } catch { }
                this.sumlog.log("サーバー用ユーザーデータを取得できなかったので処理を中断しました。", { guildId: this.interaction.guild?.id || undefined, userId: this.interaction.user.id, functionName: "VariableExistCheck", textChannelId: this.interaction.channel?.id });
            })();
            return false;
        }
    }
    /** ボイスチャンネルに参加しているかどうか */
    voice(channel: Discord.VoiceBasedChannel | null): channel is Discord.VoiceBasedChannel {
        const status = channel !== null;
        if (status) {
            /**
             * 実行ユーザーが今いるVCに対して「Bot」と「ユーザー」が
             * 参加(Connect)＋発言(Speak)できるなら true。
             * それ以外（DM/未参加/型不一致/権限不足/想定外）はすべて false を返す。
             * 例外は投げません（throw/try未使用）。
             */
            function canBothJoinAndSpeak(interaction: Discord.ChatInputCommandInteraction): boolean {
                // 基本前提が揃っていなければ false
                if (!interaction || !interaction.guild || !interaction.member) return false;

                const member = interaction.member as Discord.GuildMember;
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

            function getInvokersVoiceChannel(member: Discord.GuildMember): Discord.VoiceBasedChannel | null {
                // voice または stage に居なければ null
                const ch = member.voice?.channel ?? null;
                return ch ?? null;
            }

            function isVoiceOrStage(channel: Discord.VoiceBasedChannel): boolean {
                return (
                    channel.type === Discord.ChannelType.GuildVoice ||
                    channel.type === Discord.ChannelType.GuildStageVoice
                );
            }

            function hasJoinAndSpeak(perms: Discord.PermissionsBitField, chType: Discord.ChannelType): boolean {
                if (!perms) return false;

                // 共通（見る＋入る）
                if (!perms.has(Discord.PermissionsBitField.Flags.ViewChannel)) return false;
                if (!perms.has(Discord.PermissionsBitField.Flags.Connect)) return false;

                // 発言（Voice と Stage で判定を分ける）
                if (chType === Discord.ChannelType.GuildVoice) {
                    // 通常VCは Speak が必要
                    return perms.has(Discord.PermissionsBitField.Flags.Speak);
                }

                if (chType === Discord.ChannelType.GuildStageVoice) {
                    // Stage は Speak 権限が無いことが多いので、
                    // 1) Speak がある もしくは 2) RequestToSpeak がある のどちらかを満たせば「発言可能」とみなす
                    return (
                        perms.has(Discord.PermissionsBitField.Flags.Speak) ||
                        perms.has(Discord.PermissionsBitField.Flags.RequestToSpeak)
                    );
                }

                // 想定外タイプは false（ここには来ない想定だがthrowはしない）
                return false;
            }
            if (!canBothJoinAndSpeak(this.interaction)) {
                (async () => {
                    try {
                        this.message.sendMessage("あなたが参加しているVCに入る権限がなく、操作を実行できませんでした。");
                    } catch { }
                    this.sumlog.log("VC参加権限がなかったので処理を中断しました。", { guildId: this.interaction.guild?.id || undefined, userId: this.interaction.user.id, functionName: "VariableExistCheck", textChannelId: this.interaction.channel?.id });
                })();
                return false;
            }
            return true;
        } else {
            (async () => {
                try {
                    this.message.sendMessage("ユーザーデータが取得できませんでした。");
                } catch { }
                this.sumlog.log("ユーザーデータを取得できなかったので処理を中断しました。", { guildId: this.interaction.guild?.id || undefined, userId: this.interaction.user.id, functionName: "VariableExistCheck", textChannelId: this.interaction.channel?.id });
            })();
            return false;
        }
    }
}

interface CommandInfo {
    execute: (info: {
        interaction: Discord.ChatInputCommandInteraction<Discord.CacheType>;
        replyManager: ReplyManager;
        replyMessage: ReplyMessage;
        sumlog: SumLog;
        db: mysql.Pool;
        vec: VariableExistCheck;
        dbmgr: DBmgrAPI;
        serverInfo: ServerInfoAPI;
        player: Player;
    }) => Promise<any>;
    command: Discord.SlashCommandOptionsOnlyBuilder;
    adminIs: boolean;
};

/**
 * コマンドデータをここにセットします。
 */
const interactionCommandData: CommandInfo[] = [
    {
        adminIs: false,
        execute: async info => {
            const { interaction, sumlog, dbmgr, serverInfo, vec, player, replyManager } = info;
            let { replyMessage } = info;
            const text = interaction.options.getString("text");
            const client = interaction.client;
            const guild = interaction.guild;
            if (!vec.guild(guild)) return;
            const member = interaction.member;
            if (!vec.member(member)) return;
            const vchannel = member.voice.channel;
            if (!vec.voice(vchannel)) return;
            const guildPlayer = await player.getPlayer(guild.id);
            if (!guildPlayer) return replyMessage.sendMessage("内部エラーが発生しました。このサーバーに関する再生プレイヤーの準備ができませんでした。", true);
            if (text) {
                const addedUnidatas: Unidata<{}>[] = [];
                /** 検索機能を利用した後に追加する際にこのフォーカスを利用します。 */
                const focus = Number(text.replace(/[！-～]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)));
                if (!Number.isNaN(focus)) { // 検索結果からプレイリストに追加
                    const result = await serverInfo.transactionCatched(async connection => {
                        const unidata = await serverInfo.searchList.searchListGet(connection, focus - 1, 1);
                        if (!unidata?.[0]) return false;
                        await serverInfo.playlist.playlistSet(connection, unidata[0]);
                        addedUnidatas.push(unidata[0]);
                        return true;
                    }, e => {
                        console.error(e);
                        replyMessage.sendMessage("検索結果の取得・またはプレイリストの変更においてエラーが発生しました。現在、原因の特定中のため、お手数をお掛けしますが、もう一度コマンドを実行してください。", true);
                    });
                    if (!result) {
                        return replyMessage.sendMessage("数字は検索リストの選択に割り当てられていますが、検索データを見つけられませんでした。正しい数字、または`/search`を再実行してください。", true);
                    }
                } else { // ただのURLまたは文字列である場合
                    replyMessage.sendMessage("文字列の分析中...");
                    const parsed = await dbmgr.urlParser(text);
                    if (parsed) {
                        replyMessage.sendMessage("プレイリストに追加中...");
                        const unidatas: (Unidata<{}>)[] = [];
                        if (serviceTypeCheck(parsed.servicetype))
                            for (const parseData of parsed.data)
                                unidatas.push(dbmgr.createUnidata(parseData.id, parsed.servicetype, 0, {}));

                        const result = await serverInfo.transactionCatched(async connection => {
                            await serverInfo.playlist.playlistsSet(connection, unidatas);
                            if (!guildPlayer.playingCheck()) await serverInfo.playlist.nextMusic(connection, true);
                        }, (e) => {
                            console.error(e);
                            replyMessage.sendMessage("プレイリストの変更に失敗しました。現在、原因の特定中のため、お手数をお掛けしますが、もう一度コマンドを実行してください。", true);
                            return "error";
                        });
                        if (result === "error") return;
                        addedUnidatas.push(...unidatas);
                    } else {
                        // 文字列を検索する
                    }
                }
                let count = 0;
                replyMessage.sendMessage("表示する項目のみ動画の情報を取得中...(" + count + "/" + Math.min(addedUnidatas.length, 4) + ")");
                await replyMessage.sendEmbed("プレイリストに曲を追加しました。", addedUnidatas, true);
                if (guildPlayer.playingCheck()) return;
                else replyMessage = replyManager.newMessageText("情報の取得を待機しています...");
            }
            async function playMusicOp(guildPlayer: GuildVoicePlayer, vchannel: Discord.VoiceBasedChannel, playtype: "autoNext" | undefined = undefined) {
                replyMessage.sendMessage("情報の取得を待機しています...");
                let playMusic: {
                    playingNumber: number;
                    unidata: Unidata<{}>;
                } | undefined;
                let nextMusic: Unidata<{}>[] | undefined;
                try {
                    await serverInfo.transaction(async connection => {
                        if (!guildPlayer.playingCheck() && playtype !== "autoNext") playMusic = await serverInfo.playlist.playing(connection);
                        nextMusic = await serverInfo.playlist.nextMusic(connection);
                    });
                } catch (e) {
                    console.log(e);
                    return replyMessage.sendMessage("プレイリストから再生する曲の取得ができませんでした。現在、原因の特定中のため、お手数をお掛けしますが、もう一度コマンドを実行してください。", true);
                }
                const unidata = playMusic?.unidata || nextMusic?.[0];
                if (!unidata) {
                    if (playtype === "autoNext") {
                        await serverInfo.transactionCatched(async connection => {
                            await serverInfo.playlist.playingDelete(connection);
                        });
                        guildPlayer.leave();
                    }
                    replyMessage.sendMessage((playtype === "autoNext" ? "プレイリストが空になったため退出しました。" : "プレイリストが空のようです。") + "再生する場合は`/play`コマンドにてURLを指定しましょう。また、`/search`コマンドも利用できます。", true);
                    return;
                }
                function progressBar(percent: number, length: number, full?: number) {
                    const write = Math.trunc(((percent < (full !== undefined ? full : 100) ? percent : (full !== undefined ? full : 100)) / (full !== undefined ? full : 100)) * length);
                    const black = length - write;
                    return "=".repeat(write) + " ".repeat(black);
                }
                /** 残り時間を大雑把にします。日本語で帰ってきます。0以下だと不明となります。 */
                function roundEta(ms: number) {
                    if (ms < 0) return "不明";
                    const round = Math.round(ms / 10000); // 1=約10秒など
                    if (round === 0) {
                        return "残り5秒未満";
                    } else if (round <= 3) {
                        return "残り" + (round * 10) + "秒未満";
                    } else {
                        const min = Math.floor(ms / 60000);
                        const sec = Math.floor(((ms / 1000) % 60));
                        return "残り約" + (min > 0 ? min + "分" : "") + sec + "秒";
                    }
                }
                await unidata.fetch(true, async (progress, elapsed, eta, status) => {
                    const bar = progressBar(progress, 35, 100);
                    await replyMessage.sendEmbed(
                        progress + "%[" + bar + "]\n" + (
                            status === "waiting" ? "情報の取得を待機しています..." :
                                status === "downloading" ? "音声のダウンロード中..." :
                                    status === "converting" ? "音声を再生可能な形式に変換中..." :
                                        "しばらくお待ちください..."
                        ) + Math.floor(elapsed / 1000) + "秒作業しました..." + roundEta(eta), [unidata]);
                });
                if (!unidata.fetched || !unidata.sourceReadyIs) {
                    const error = dbmgrErrorCodeParser(dbmgrErrorCodePriorityCheck(unidata.error ?? []).main[0] ?? "エラー未検出");
                    await serverInfo.transactionCatched(async connection => {
                        const playing = await serverInfo.playlist.playing(connection);
                        await serverInfo.playlist.playlistDelete(connection, playing?.playingNumber, 1);
                        if (!guildPlayer.joiningCheck()) await serverInfo.playlist.nextMusic(connection, true);
                    });
                    replyMessage.sendMessage("この動画は再生できず、プレイリストから削除されました。理由:" + error.title + "\n" + error.description + "\n\n次の曲の再生の準備をしています。\n削除された曲のID: `" + unidata.id + "`", true);
                    replyMessage = replyManager.newMessageText("情報の取得を待機しています...");
                    return await playMusicOp(guildPlayer, vchannel, playtype);
                }
                const oldPlayStatus = guildPlayer.joiningCheck();
                if (!await guildPlayer.join(vchannel.id)) return replyMessage.sendMessage("VCに参加をすることができませんでした。現在、原因の特定中のため、お手数をお掛けしますが、もう一度コマンドを実行してください。", true);
                if (!await guildPlayer.play(dbmgr.uriCreator(unidata.id + (unidata.servicetype === "twitter" ? "-" + (unidata.index + 1) : ""), unidata.servicetype, "audio"), 0, type => {
                    console.log(type); // 次の曲に進むかなどの挙動を実装予定
                    if (type === "played") {
                        replyMessage = replyManager.newMessageText("情報の取得を待機しています...");
                        playMusicOp(guildPlayer, vchannel, "autoNext");
                    } else if (type === "leaved") {
                        replyMessage = replyManager.newMessageText("botが退出させられたため、自動的に再生が終了しました。");
                    }
                })) return replyMessage.sendMessage("再生を開始できませんでした。現在、原因の特定中のため、お手数をお掛けしますが、もう一度コマンドを実行してください。", true);
                if (nextMusic) {
                    try {
                        await serverInfo.transaction(async connection => {
                            await serverInfo.playlist.nextMusic(connection, true);
                        })
                    } catch (e) {
                        console.log(e);
                        return replyMessage.sendMessage("プレイリストの変更に失敗しました。現在、原因の特定中です。次の曲において、現在再生している曲が再生される可能性があります。", true);
                    }
                }
                await replyMessage.sendEmbed(((oldPlayStatus || playtype === "autoNext") ? "次の曲の" : "") + "再生を開始しました。", [unidata], true);
            }
            await playMusicOp(guildPlayer, vchannel);
        },
        command: (
            new Discord.SlashCommandBuilder()
                .setName("play")
                .setDescription("曲を再生します。")
                .addStringOption(option => option
                    .setName("text")
                    .setDescription("音楽を追加することができます。URLまたは検索したいタイトルを入力してください。")
                )
                .addStringOption(option => option
                    .setName("type")
                    .setDescription("優先する読み取り方法です。動画URLだけどプレイリストがあったら取得したいときはプレイリストを選択します。YouTubeの場合にのみ対応しています。")
                    .addChoices(
                        { name: "動画", value: "youtube" },
                        { name: "プレイリスト", value: "youtubePlaylist" }
                    )
                )
        )
    }, {
        adminIs: false,
        execute: async info => {
            const { interaction, sumlog, dbmgr, serverInfo, vec, player, replyManager } = info;
            let { replyMessage } = info;
            if (!vec.guild(interaction.guild)
                || !vec.member(interaction.member)
                || !vec.voice(interaction.member.voice.channel)) return;
            const guild = interaction.guild;
            const guildPlayer = await player.getPlayer(guild.id);
            if (!guildPlayer) return replyMessage.sendMessage("内部エラーが発生しました。このサーバーに関する再生プレイヤーの準備ができませんでした。", true);
            if (guildPlayer.playingCheck()) {
                replyMessage.sendMessage("曲を停止しました。");
            } else {
                replyMessage.sendMessage("停止されているためその操作はできません。`/help`で使い方をみることができます。");
            }
        },
        command: (
            new Discord.SlashCommandBuilder()
                .setName("stop")
                .setDescription("再生を停止します。")
        )
    }
];

/** プログラムではこちらを読み取りますが、ここに書き込まないでください。コマンド名と実際のコマンドの整合性が取れない場合に不具合の原因となります。 */
const interactionCommand: Record<string, CommandInfo> = {};

for (const icd of interactionCommandData) {
    interactionCommand[icd.command.name] = icd;
}

type MessageType = ({
    message: Discord.Message
}) & {
    guildId: string | undefined;
    channelId: string | undefined;
    messageId: string;
}

class ReplyManager {
    #interaction: Discord.ChatInputCommandInteraction;
    #interactionReplyed = false;
    #interactionReplyWait: Promise<void> | undefined;
    #lastMessage: Discord.Message | undefined;
    #irm: InteractionReplyManager;
    constructor(irm: InteractionReplyManager, interaction: Discord.ChatInputCommandInteraction) {
        this.#irm = irm;
        this.#interaction = interaction;
    }
    /** メッセージを作ると自動で送信されます。しばらく待機してください。 */
    newMessage(defaultMessage: Discord.BaseMessageOptions) {
        if (!this.#interactionReplyed) {
            this.#interactionReplyed = true;
            let resolve: (() => void) | undefined;
            let returned = false;
            this.#interactionReplyWait = new Promise<void>(r => {
                resolve = r;
                setTimeout(() => {
                    if (returned) r();
                }, 1000);
            });
            return new ReplyMessage(this.#irm, defaultMessage, async content => {
                const replyed = await this.#interaction.reply({ ...content, withResponse: true });
                const message = replyed.resource?.message ?? await (this.#interaction.channel as Discord.TextChannel).send(content);
                resolve?.();
                returned = true;
                this.#lastMessage = message;
                return {
                    message,
                    guildId: message.guild?.id,
                    channelId: message.channel.id,
                    messageId: message.id
                }
            });
        }
        return new ReplyMessage(this.#irm, defaultMessage, async content => {
            await this.#interactionReplyWait;
            const message = await this.#lastMessage?.reply(content) ?? await (this.#interaction.channel as Discord.TextChannel).send(content);
            this.#lastMessage = message;
            return {
                message,
                guildId: message.guild?.id,
                channelId: message.channel.id,
                messageId: message.id
            }
        });
    }
    newMessageText(text: string, title: string = "メッセージ") {
        return this.newMessage({ embeds: [messageEmbedGet(text, this.#irm.client, title)] });
    }
}

class ReplyMessage {
    #irm: InteractionReplyManager;
    messageType: Promise<MessageType> | undefined;
    #firstSendContent: Discord.BaseMessageOptions | undefined;
    #firstSendTimeout: NodeJS.Timeout | undefined;
    #firstMessageGenerator: ((content: Discord.BaseMessageOptions) => Promise<MessageType>) | undefined;
    constructor(irm: InteractionReplyManager, defaultMessage: Discord.BaseMessageOptions, messageGenerator: (content: Discord.BaseMessageOptions) => Promise<MessageType>) {
        this.#irm = irm;
        this.#firstSendContent = defaultMessage;
        this.#firstMessageGenerator = messageGenerator;
        this.#firstSendTimeout = setTimeout(() => {
            if (this.#firstSendContent && this.#firstSendTimeout && this.#firstMessageGenerator) {
                this.messageType = messageGenerator(this.#firstSendContent);
                this.#firstSendContent = undefined;
                this.#firstSendTimeout = undefined;
                this.#firstMessageGenerator = undefined;
            }
        }, 1000);
    }
    send(content: Discord.BaseMessageOptions, force: boolean = false) {
        if (!this.messageType) {
            if (force) {
                if (this.#firstSendContent && this.#firstSendTimeout && this.#firstMessageGenerator) {
                    clearTimeout(this.#firstSendTimeout);
                    this.messageType = this.#firstMessageGenerator(content);
                    this.#firstSendContent = undefined;
                    this.#firstSendTimeout = undefined;
                    this.#firstMessageGenerator = undefined;
                }
            } else {
                this.#firstSendContent = content;
            }
        } else {
            this.messageType.then(messageType => {
                if (messageType.guildId && messageType.channelId) {
                    this.#irm.editQueue(messageType, content);
                }
            })
        }
    }
    sendMessage(text: string, fast: boolean = false, title: string = "メッセージ") {
        this.send({ embeds: [messageEmbedGet(text, this.#irm.client, title)] }, fast);
    }
    async sendEmbed(text: string, unidatas: Unidata<{}>[], fast: boolean = false) {
        this.send(await videoInfoEmbedGet(unidatas, text, this.#irm.client, this.#irm.sumlog), fast);
    }
}

/**
 * 各サーバー、各チャンネル毎の情報を持ち、そのチャンネル毎でレート制限をかけます。
 * 
 * しかし、今はだるすぎて！！！メッセージが1秒ごとに送信されるだけです。
 */
class InteractionReplyManager {
    #rate = 1000;
    /** [guildId-channelId]という形式で書き込み、sendクラスが書き込まれます。Promiseが完了した場合、削除して構いません(自動で削除されます) */
    #sendingInfo: Record<string, Symbol | undefined> = {};
    /** guildId、channelId、messageIdの中にキューデータが入ります。送信が完了すると削除されます。 */
    #interactions: Record<string, Record<string, Record<string, {
        sendTool: MessageType
        content: Discord.BaseMessageOptions
    }>>> = {};
    client: Discord.Client;
    sumlog: SumLog;
    constructor(client: Discord.Client, sumlog: SumLog) {
        this.client = client;
        this.sumlog = sumlog;
    }
    editQueue(sendTool: MessageType, content: Discord.BaseMessageOptions, fast = false) {
        if (!sendTool.channelId || !sendTool.guildId) return;
        const channelId = sendTool.channelId;
        const guildId = sendTool.guildId;
        const messageId = sendTool.messageId;
        if (!this.#interactions[guildId]) this.#interactions[guildId] = {};
        if (!this.#interactions[guildId][channelId]) this.#interactions[guildId][channelId] = {};
        this.#interactions[guildId][channelId][messageId] = { sendTool, content };
        if (fast || !this.#sendingInfo[guildId + "-" + channelId]) { // 優先送信があったり送信中の内容がなかったりした場合
            const func = Symbol();
            this.#sendingInfo[guildId + "-" + channelId] = func;
            this.#send(guildId, channelId, messageId, func, fast);
        }
    }
    /** 送信します。 */
    async #send(guildId: string, channelId: string, messageId: string, checkSymbol: Symbol, fast = false) {
        let error = 0;
        while (true) {
            try {
                if (!fast) await new Promise<void>(resolve => setTimeout(() => { resolve() }, this.#rate));
                if (this.#sendingInfo[guildId + "-" + channelId] !== checkSymbol) return; // このループと違うシンボルの場合破棄
                if (this.#interactions[guildId][channelId][messageId]) {
                    const { sendTool, content } = this.#interactions[guildId][channelId][messageId];
                    delete this.#interactions[guildId][channelId][messageId];
                    await sendTool.message.edit(content);
                } else { // 送るべき内容がない場合
                    delete this.#sendingInfo[guildId + "-" + channelId]; // シンボルを破棄
                    break; // ループを終了
                }
            } catch (e) { // エラーが出過ぎるとループを破棄。
                if (error > 5) {
                    if (this.#interactions[guildId][channelId][messageId])
                        delete this.#interactions[guildId][channelId][messageId];
                    break;
                }
                error++;
                // ループを再試行する(普通interactionなどは消えているはず...。)
            }
        }
    }
    /** インタラクションを作ったらすぐにnewMesseageを実行してください。 */
    newInteraction(interaction: Discord.ChatInputCommandInteraction) {
        return new ReplyManager(this, interaction);
    }
}

export class ClientOn {
    constructor(client: Discord.Client, sumlog: SumLog, db: mysql.Pool, dbmgr: DBmgrAPI, player: Player) {
        client.on("messageCreate", message => { this.messageCreate(message, sumlog, db, dbmgr, player); });
        const interactionReplyManager = new InteractionReplyManager(client, sumlog);
        client.on("interactionCreate", interaction => { this.interactionCreate(interaction, sumlog, db, dbmgr, player, interactionReplyManager) })
    }
    interactionLimit = 500;
    interactionRunningStatus: Record<string, number> = {};
    async messageCreate(message: Discord.Message, sumlog: SumLog, db: mysql.Pool, dbmgr: DBmgrAPI, player: Player) {
        try {
            if (message.author.bot) return;
            sumlog.log(message.content, { functionName: "client.on messageCreate", guildId: message.guild?.id, textChannelId: message.channel.id, userId: message.member?.id, client: message.client });
            if (message.content === message.client.user?.displayName + "のコマンドを再定義する") {
                if (message.guildId === process.env.DISCORD_ADMIN_GUILD_ID && message.author.id === process.env.DISCORD_ADMIN_AUTHOR_ID) {
                    const botmessage = await message.reply("処理を開始します...");

                    const token = process.env.DISCORD_TOKEN;
                    const clientId = message.client.user?.id;

                    if (!token || !clientId) return await botmessage.edit("トークンまたはクライアントIDが無効だったよ。");

                    // JSON へ変換（REST 配信用）
                    function toJSONBody(builders: Discord.SlashCommandOptionsOnlyBuilder[]): Discord.RESTPostAPIApplicationCommandsJSONBody[] {
                        return builders.map((b) => (b as any).toJSON ? (b as any).toJSON() : (b as unknown as Discord.RESTPostAPIApplicationCommandsJSONBody));
                    }
                    const body = toJSONBody(interactionCommandData.map(data => data.command));
                    const rest = new Discord.REST({ version: "10" }).setToken(token);
                    await botmessage.edit("グローバルコマンドをセットしています...");
                    await rest.put(Discord.Routes.applicationCommands(clientId), { body: body });

                    /* 管理者コマンドが追加されたらこれを使います
                    const guildIds = [process.env.DISCORD_ADMIN_GUILD_ID];
                    for (let i = 0; i < guildIds.length; i++) {
                        const guildId = guildIds[i];
                        botmessage.edit("サーバーコマンドを" + guildIds.length + "中" + (i + 1) + "つ目の「" + message.client.guilds.cache.get(guildId)?.name + "/" + guildId + "」に登録しています...時間がかかります。");
                        await rest.put(Discord.Routes.applicationGuildCommands(clientId, guildId), { body: body });
                        botmessage.edit("サーバーコマンドを" + guildIds.length + "中" + (i + 1) + "つ目の「" + message.client.guilds.cache.get(guildId)?.name + "/" + guildId + "」から削除しています...");
                        await rest.put(Discord.Routes.applicationGuildCommands(clientId, guildId), { body: adminBody });
                    }*/
                    await botmessage.edit("グローバルコマンドを登録しました。");
                }
            }
        } catch (e) {
            sumlog.error("メッセージの受信でエラーが発生しました。", { client: message.client, guildId: message.guild?.id, textChannelId: message.channel?.id, functionName: "client.on messageCreate", userId: message.member?.id });
            console.error(e);
        }
    }
    async interactionCreate(interaction: Discord.Interaction, sumlog: SumLog, db: mysql.Pool, dbmgr: DBmgrAPI, player: Player, irm: InteractionReplyManager) {
        try {
            if (interaction.isCommand() && interaction.isChatInputCommand()) {
                if (!interaction.guild) return await interaction.reply({
                    embeds: [messageEmbedGet("ここではコマンドは実行できません。", interaction.client)],
                    flags: "Ephemeral"
                });
                if (Date.now() - this.interactionRunningStatus[interaction.guild.id] <= this.interactionLimit) return await interaction.reply({
                    embeds: [messageEmbedGet("コマンドは" + (this.interactionLimit / 1000) + "秒に1回までです。もう少しお待ちください。", interaction.client)],
                    flags: "Ephemeral"
                });
                this.interactionRunningStatus[interaction.guild.id] = Date.now();
                const cmd = interactionCommand[interaction.commandName];
                if (!cmd) return await interaction.reply({
                    embeds: [messageEmbedGet("コマンドが見つかりませんでした。", interaction.client)],
                    flags: "Ephemeral"
                });

                try {
                    const replyManager = irm.newInteraction(interaction);
                    if (!this.#permissionCheck(interaction)) replyManager.newMessage({
                        embeds: [messageEmbedGet(
                            "この音楽botはテキスト送信権限のないチャンネルでコマンドを実行しています。権限を付与しない場合、様々な機能が利用できません。ご注意ください。この警告は改善されるまで常に表示されます。",
                            interaction.client,
                            "警告"
                        )]
                    });
                    const replyMessage = replyManager.newMessage({
                        embeds: [messageEmbedGet("コマンド「" + interaction.commandName + "」の処理を開始しています...", interaction.client)]
                    })
                    const vec = new VariableExistCheck(interaction, replyMessage, sumlog);
                    const serverInfo = new ServerInfoAPI(interaction.guild.id, db);
                    await cmd.execute({ interaction, replyManager, replyMessage, sumlog, db, vec, dbmgr, serverInfo, player });
                } catch (e) {
                    sumlog.error("コマンド「/" + interaction.commandName + "」の実行でエラーが発生しました。", { client: interaction.client, guildId: interaction.guildId || undefined, textChannelId: interaction.channelId || undefined, functionName: "client.on Interaction", userId: interaction.user.id });
                    console.error(e);
                    await interaction.editReply({
                        embeds: [new Discord.EmbedBuilder()
                            .setTitle("エラー")
                            .setAuthor({
                                name: "音楽bot",
                                iconURL: interaction.client.user?.avatarURL() || undefined,
                            })
                            .setDescription("このbotでコマンドの処理をしている途中でエラーが発生しました。以下のエラーは生のエラー内容です。これは管理者側でもチェックが可能です。修正までしばらくお待ちください。\n```" + e + "\n```")
                            .setColor("Purple")
                        ]
                    });
                }
            }
        } catch (e) {
            sumlog.error("インタラクションの受信でエラーが発生しました。", { client: interaction.client, guildId: interaction.guild?.id, textChannelId: interaction.channel?.id, functionName: "client.on interaction", userId: interaction.user.id });
            console.error(e);
        }
    }
    #permissionCheck(interaction: Discord.Interaction) {
        if (!interaction.channel) return false;
        const isThread = interaction.channel?.type === Discord.ChannelType.PublicThread ||
            interaction.channel?.type === Discord.ChannelType.PrivateThread ||
            interaction.channel?.type === Discord.ChannelType.AnnouncementThread;
        const checkPermission = [Discord.PermissionsBitField.Flags.SendMessages, isThread ? Discord.PermissionsBitField.Flags.SendMessagesInThreads : Discord.PermissionsBitField.Flags.ViewChannel];
        if (interaction.channel?.type === Discord.ChannelType.GuildText) {
            const me = interaction.guild?.members.me;
            if (!me) return false;
            else if (!interaction.channel.permissionsFor(me).has(checkPermission)) return false;
        }
        return true;
    }
} 
