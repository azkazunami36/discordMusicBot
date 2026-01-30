import { Interaction, Message } from "discord.js";
import fs from "fs";
import { SumLog } from "../class/sumLog.js";

export function messageLog(message: Message) {
    if (fs.existsSync("./log/usermessage.log")) {
        const meta = fs.statSync("./log/usermessage.log");
        if (meta.size > 10 * 1000 * 1000) {
            let num = 0;
            while (fs.existsSync("./log/usermessage." + num + ".log")) num++;
            fs.renameSync("./log/usermessage.log", "./log/usermessage." + num + ".log")
        }
    }
    if (!fs.existsSync("./log/usermessage.log")) fs.writeFileSync("./log/usermessage.log", "");
    function formatDateJST(date = new Date()) {
        const offsetMs = 9 * 60 * 60 * 1000; // JST(+9時間)
        const jstDate = new Date(date.getTime() + offsetMs);

        const iso = jstDate.toISOString(); // 例: 2025-10-11T20:33:14.112Z
        return iso.replace('Z', '+09:00');
    }
    function extractMessageExtras(message: Message) {
        const results = [];

        // 添付ファイル（画像・動画・PDFなど）
        for (const [, attachment] of message.attachments) {
            results.push({
                type: 'attachment',
                body: attachment.url
            });
        }

        // ステッカー（スタンプ）
        for (const [, sticker] of message.stickers) {
            results.push({
                type: 'sticker',
                body: sticker.id
            });
        }

        // 埋め込み（リンクのメタ情報など）
        for (const embed of message.embeds) {
            results.push({
                type: 'embed',
                body: embed.url || embed.title || '[embed without url]'
            });
        }

        // ボタン・メニューなど（components）
        for (const row of message.components) {
            results.push({
                type: 'component',
                body: JSON.stringify(row.toJSON())
            });
        }

        // 投票（poll）
        if (message.poll) {
            results.push({
                type: 'poll',
                body: message.poll.question?.text ?? '[poll]'
            });
        }

        return results;
    }
    fs.appendFileSync("./log/usermessage.log", "\n[" + formatDateJST() + "] [" + message.guild?.name + "(" + message.guildId + ")" + "] [" + message.author.globalName + "(" + message.author.username + "/" + message.author.id + ")" + "] " + message.content + ", " + JSON.stringify(extractMessageExtras(message), null, "  "))

    SumLog.log(message.content, { client: message.client, functionName: "client.on message", guildId: message.guildId || undefined, textChannelId: message.channelId, userId: message.member?.id });
}

export function interactionLog(interaction: Interaction) {
    SumLog.log("インタラクションを受信しました。", { client: interaction.client, guildId: interaction.guildId || undefined, textChannelId: interaction.channelId || undefined, functionName: "client.on Interaction", userId: interaction.user.id });
    if (fs.existsSync("./log/userinteraction.log")) {
        const meta = fs.statSync("./log/userinteraction.log");
        if (meta.size > 10 * 1000 * 1000) {
            let num = 0;
            while (fs.existsSync("./log/userinteraction." + num + ".log")) num++;
            fs.renameSync("./log/userinteraction.log", "./log/userinteraction." + num + ".log")
        }
    }
    if (!fs.existsSync("./log/userinteraction.log")) fs.writeFileSync("./log/userinteraction.log", "");
    function formatDateJST(date = new Date()) {
        const offsetMs = 9 * 60 * 60 * 1000; // JST(+9時間)
        const jstDate = new Date(date.getTime() + offsetMs);

        const iso = jstDate.toISOString(); // 例: 2025-10-11T20:33:14.112Z
        return iso.replace('Z', '+09:00');
    }
    function summarizeInteraction(interaction: Interaction) {
        // ユーティリティ：安全にJSON化（循環・BigInt回避）
        const safe = (o: unknown) =>
            JSON.stringify(o, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), "  ");

        // 1) ボタン
        if (interaction.isButton()) {
            return {
                type: 'Button',
                body: safe({
                    customId: interaction.customId,
                    messageId: interaction.message?.id,
                    channelId: interaction.channelId,
                }),
            };
        }

        // 2) モーダル
        if (interaction.isModalSubmit()) {
            return {
                type: 'ModalSubmit',
                body: safe({
                    customId: interaction.customId,
                    fields: interaction.fields.fields.map(f => ({
                        customId: f.customId,
                        value: interaction.fields.getTextInputValue(f.customId),
                    })),
                }),
            };
        }

        // 3) セレクトメニュー群
        if (interaction.isAnySelectMenu()) {
            // 種別名の見栄え整形
            const typeName =
                interaction.isStringSelectMenu() ? 'StringSelectMenu' :
                    interaction.isUserSelectMenu() ? 'UserSelectMenu' :
                        interaction.isRoleSelectMenu() ? 'RoleSelectMenu' :
                            interaction.isMentionableSelectMenu() ? 'MentionableSelectMenu' :
                                interaction.isChannelSelectMenu() ? 'ChannelSelectMenu' :
                                    'SelectMenu';

            return {
                type: typeName,
                body: safe({
                    customId: interaction.customId,
                    values:
                        'values' in interaction ? interaction.values : undefined, // string[]
                    users:
                        interaction.isUserSelectMenu()
                            ? interaction.users.map(u => ({ id: u.id, tag: u.tag }))
                            : undefined,
                    roles:
                        interaction.isRoleSelectMenu()
                            ? interaction.roles.map(r => ({ id: r.id, name: r.name }))
                            : undefined,
                    channels:
                        interaction.isChannelSelectMenu()
                            ? interaction.channels.map(c => ({ id: c.id, name: c.type }))
                            : undefined,
                    mentionables:
                        interaction.isMentionableSelectMenu()
                            ? interaction.values // mentionableはID配列
                            : undefined,
                }),
            };
        }

        // 4) メッセージコンポーネント（一般）
        if (interaction.isMessageComponent()) {
            // 上の個別分岐に引っかからなかったコンポーネント（稀）
            return {
                type: 'MessageComponent',
                body: "never",
            };
        }

        // 5) オートコンプリート
        if (interaction.isAutocomplete()) {
            const focused = interaction.options.getFocused(true);
            return {
                type: 'Autocomplete',
                body: safe({
                    commandName: interaction.commandName,
                    focusedOption: { name: focused.name, value: focused.value },
                }),
            };
        }

        // 6) Chat Input（スラッシュ）コマンド
        if (interaction.isChatInputCommand()) {
            // オプションを素直に展開
            const opts = interaction.options.data.map(o => ({
                name: o.name,
                type: o.type,
                value: o.value,
                focused: (o as any).focused ?? false,
                options: (o as any).options ?? undefined,
            }));
            return {
                type: 'ChatInputCommand',
                body: safe({
                    commandName: interaction.commandName,
                    options: opts,
                }),
            };
        }

        // 7) コンテキストメニューコマンド（メッセージ／ユーザー）
        if (interaction.isContextMenuCommand()) {
            const base = {
                commandName: interaction.commandName,
                targetId: interaction.targetId,
            };

            if (interaction.isMessageContextMenuCommand()) {
                return {
                    type: 'MessageContextMenuCommand',
                    body: safe({
                        ...base,
                        targetMessageId: interaction.targetMessage.id,
                        targetAuthorId: interaction.targetMessage.author?.id,
                    }),
                };
            }
            if (interaction.isUserContextMenuCommand()) {
                return {
                    type: 'UserContextMenuCommand',
                    body: safe({
                        ...base,
                        targetUserId: interaction.targetUser.id,
                        targetUserTag: interaction.targetUser.tag,
                    }),
                };
            }

            // 予備（将来型）
            return {
                type: 'ContextMenuCommand',
                body: safe(base),
            };
        }

        // 8) 一般の CommandInteraction（後方互換）
        if (interaction.isCommand && interaction.isCommand()) {
            return {
                type: 'Command',
                body: safe({
                    commandName: (interaction as any).commandName,
                }),
            };
        }

        // 9) PrimaryEntryPointCommand（対応環境向け）
        if ((interaction as any).isPrimaryEntryPointCommand?.()) {
            return {
                type: 'PrimaryEntryPointCommand',
                body: safe({
                    commandName: (interaction as any).commandName,
                }),
            };
        }

        // 10) Repliable（返信可能）かどうかのメタ
        if (interaction.isRepliable()) {
            return {
                type: 'Repliable',
                body: safe({
                    id: interaction.id,
                    channelId: interaction.channelId,
                }),
            };
        }

        // Fallback
        return {
            type: 'Unknown',
            body: safe({
                id: "never",
                type: (interaction as any).type,
            }),
        };
    }
    const stat = summarizeInteraction(interaction);
    fs.appendFileSync("./log/userinteraction.log", "\n[" + formatDateJST() + "] [" + stat.type + "] [" + interaction.guild?.name + "(" + interaction.guildId + ")" + "] [" + interaction.user.globalName + "(" + interaction.user.username + "/" + interaction.user.id + ")" + "] " + stat.body)
}
