import fs from "fs";

import { Interaction, SlashCommandBuilder, CacheType, EmbedBuilder, APIEmbedField, APIEmbed, Message } from "discord.js";
import { InteractionInputData } from "../interface.js";
import { musicBrainz } from "../MusicBrainz.js";
import { messageEmbedGet } from "../embed.js";

export const command = new SlashCommandBuilder()
    .setName("mblink")
    .setDescription("MusicBrainzサービスの設定をします。")
    .addSubcommand(command => command
        .setName("view")
        .setDescription("MusicBrainzサービスの情報と関連づけられている動画を表示します。")
        .addNumberOption(option => option
            .setName("page")
            .setDescription("ページを選択します。")
        )
    )
    .addSubcommand(command => command
        .setName("set")
        .setDescription("MusicBrainサービスと動画を関連づけます。すでに関連づけられている場合、上書きが可能です。")
        .addStringOption(option => option
            .setName("releasembid")
            .setDescription("Release MBIDを設定します。")
            .setRequired(true)
        )
        .addStringOption(option => option
            .setName("recordingmbid")
            .setDescription("Recording MBIDを設定します。")
            .setRequired(true)
        )
        .addStringOption(option => option
            .setName("videoid")
            .setDescription("VideoIDを設定します。")
            .setRequired(true)
        )
    )
    .addSubcommand(command => command
        .setName("check")
        .setDescription("MBIDに関連づけられた情報をチェックします。")
        .addStringOption(option => option
            .setName("releasembid")
            .setDescription("Release MBIDの情報をチェックします。")
        )
        .addStringOption(option => option
            .setName("recordingmbid")
            .setDescription("Recording MBIDの情報をチェックします。")
        )
    )
export const commandExample = "";

export async function execute(interaction: Interaction<CacheType>, inputData: InteractionInputData, message: Message) {
    if (interaction.isChatInputCommand()) {
        const subcommand = interaction.options.getSubcommand(false);
        if (subcommand === null) return message.edit({ embeds: [messageEmbedGet("サブコマンドがなく、実行ができませんでした。正しい構文で実行してください。", interaction.client)] });
        switch (subcommand) {
            case "view": {
                const albumInfoJson = JSON.parse(String(fs.readFileSync("albumInfo.json")));
                const list: {
                    [videoId: string]: {
                        recording: string;
                        release: string;
                    };
                } = albumInfoJson.youtubeLink.videoId;
                const fields: APIEmbedField[] = [];
                const videoIds = Object.keys(list);
                const videoIdsPage = Math.ceil(videoIds.length / 10);
                const page = interaction.options.getNumber("page") || 1;
                const selectvideoIdsPage = page < videoIdsPage ? page : videoIdsPage;
                const viewVideoIds = videoIds.slice((selectvideoIdsPage - 1) * 10, (selectvideoIdsPage - 1) * 10 + 10);
                message.edit({ embeds: [messageEmbedGet("MusicBrainzから情報を取得中...", interaction.client)] });
                for (let i = 0; i < viewVideoIds.length; i++) {
                    const videoId = viewVideoIds[i];
                    const recordingInfo = await musicBrainz.recordingInfoGet(list[videoId].recording);
                    const releaseInfo = await musicBrainz.releaseInfoGet(list[videoId].release);
                    fields.push({
                        name: ((selectvideoIdsPage - 1) * 10 + i + 1) + ". " + recordingInfo.title + " - " + releaseInfo.title,
                        value: "VideoID: `" + videoId + "` Recording MBID: `" + list[videoId].recording + "` Release MBID: `" + list[videoId].release + "`"
                    });
                }
                await message.edit({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle("MusicBrainzリンク済み動画(" + selectvideoIdsPage + "/" + videoIdsPage + ")")
                            .setAuthor({
                                name: "音楽bot",
                                iconURL: interaction.client.user?.avatarURL() || undefined,
                            })
                            .setDescription("この音楽botには **" + videoIds.length + "** 個関連づけられた動画があります。")
                            .setColor("Purple")
                            .addFields(fields)]
                });
                break;
            }
            case "set": {
                if (interaction.user.id !== "835789352910716968") return message.edit({ embeds: [messageEmbedGet("現在`/mblink set`コマンドは管理者のみが操作可能です。ご了承ください。", interaction.client)] });
                const releaseMBID = interaction.options.getString("releasembid");
                const recordingMBID = interaction.options.getString("recordingmbid");
                const videoId = interaction.options.getString("videoid");
                if (!releaseMBID || !recordingMBID || !videoId) return message.edit({ embeds: [messageEmbedGet("IDが不足しており、実行ができません。すべて入力してください。", interaction.client)] });
                const albumInfoJson = JSON.parse(String(fs.readFileSync("albumInfo.json")));
                const list: {
                    [videoId: string]: {
                        recording: string;
                        release: string;
                    };
                } = albumInfoJson.youtubeLink.videoId;
                list[videoId] = {
                    recording: recordingMBID,
                    release: releaseMBID
                };
                fs.writeFileSync("albumInfo.json", JSON.stringify(albumInfoJson, null, "    "));
                message.edit({ embeds: [messageEmbedGet("セットが完了しました。`/add text:" + videoId + "`を行って確認してください。", interaction.client)] });
                break;
            }
            case "check": {
                const embeds: EmbedBuilder[] = [];
                const releaseMBID = interaction.options.getString("releasembid");
                const recordingMBID = interaction.options.getString("recordingmbid");
                if (releaseMBID) {
                    const releaseInfo = await musicBrainz.releaseInfoGet(releaseMBID);
                    const embed = new EmbedBuilder();
                    embed.setTitle(releaseInfo.title);
                    embed.setImage("https://coverartarchive.org/release/" + releaseMBID + "/front");
                    embed.setDescription("Release MBIDの内容です。");
                    embed.setAuthor({
                        name: "音楽bot",
                        iconURL: interaction.client.user?.avatarURL() || undefined,
                    })
                    embed.setColor("Purple");
                    embeds.push(embed);
                }
                if (recordingMBID) {
                    const recordingInfo = await musicBrainz.recordingInfoGet(recordingMBID);
                    const embed = new EmbedBuilder();
                    embed.setTitle(recordingInfo.title);
                    embed.setImage("https://coverartarchive.org/release/" + recordingMBID + "/front");
                    embed.setDescription("Release MBIDの内容です。");
                    embed.setAuthor({
                        name: "音楽bot",
                        iconURL: interaction.client.user?.avatarURL() || undefined,
                    })
                    embed.setColor("Purple");
                    embeds.push(embed);
                }
                message.edit({ embeds })
                break;
            }
            default: {
                return message.edit({ embeds: [messageEmbedGet("正しいサブコマンド名ではないため、実行ができませんでした。正しい構文で実行してください。", interaction.client)] });
            }
        }
    }
}
