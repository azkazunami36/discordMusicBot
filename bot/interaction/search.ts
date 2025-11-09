import { Interaction, SlashCommandBuilder, CacheType, GuildMember, Message, EmbedBuilder } from "discord.js";

import { InteractionInputData } from "../funcs/interface.js";
import { VariableExistCheck } from "../class/variableExistCheck.js";
import { EnvData, Playlist, videoMetaCacheGet } from "../class/envJSON.js";
import { messageEmbedGet, videoInfoEmbedGet } from "../funcs/embed.js";
import yts from "yt-search";
import fs from "fs";
import { musicBrainz } from "../worker/helper/createByChatGPT/musicBrainzInfoHelper.js";
import { youtubeUserInfoGet } from "../worker/helper/createByChatGPT/youtubeUserInfoGetHelper.js";
import { progressBar } from "../createByChatGPT/progressBar.js";

/**
        .addStringOption(option => option
        .setName("service")
        .setDescription("優先するサービスです。動画URLだけどプレイリストがあったら取得したいときはプレイリストを選択します。検索次に優先したいサービスがあれば、それを選択します。")
        .addChoices(
            { name: "YouTube", value: "youtube" },
            { name: "YouTubeプレイリスト", value: "youtubePlaylist" },
            { name: "ニコニコ動画", value: "niconico" },
            { name: "X", value: "twitter" }
        )
    )
 */
export const command = new SlashCommandBuilder()
    .setName("search")
    .setDescription("動画を検索します。現時点でYouTubeのみに対応しています。")
    .addStringOption(option => option
        .setName("text")
        .setDescription("検索したいワードを入力します。")
        .setRequired(true)
    )
    .addStringOption(option => option
        .setName("length")
        .setDescription("検索したい個数を入力します。デフォルトは５つです。")
        .setChoices({ name: "５個", value: "5" }, { name: "１０個", value: "10" }, { name: "１５個", value: "15" })
    )
    .addBooleanOption(option => option
        .setName("thumbnail")
        .setDescription("サムネイルを表示するかどうかを決めます。")
    )
export const commandExample = "";

export async function execute(interaction: Interaction<CacheType>, inputData: InteractionInputData, message: Message) {
    if (interaction.isChatInputCommand()) {
        const word = interaction.options.getString("text");
        const length = Number(interaction.options.getString("length"));
        const thumbnail = interaction.options.getBoolean("thumbnail");
        const variableExistCheck = new VariableExistCheck(interaction);
        const guildData = await variableExistCheck.guild();
        if (!guildData) return;
        const serversData = await variableExistCheck.serverData(inputData.serversDataClass);
        if (!serversData) return;
        if (word === null) return await message.edit({ embeds: [messageEmbedGet("追加したい曲が指定されませんでした。入力してから追加を行なってください。", interaction.client)] });
        const youtubeDatas = (await yts(word)).videos;
        const embeds = [];
        const files = [];
        const pllists = [];
        let sendTime = 0;
        function send(now: number, full: number) {
            const nowTime = Date.now();
            if (nowTime - sendTime > 1000) {
                message.edit({ embeds: [messageEmbedGet("検索結果の表示のための動画情報を収集中...\n" + ((now / full) * 100) + "%`" + progressBar(now, 40, full) + "`", interaction.client)] })
                sendTime = nowTime;
            }
        }
        if (thumbnail) {
            for (let i = 0; i < (length || 5); i++) {
                send(i, length || 5);
                const videoId = youtubeDatas[i].videoId;
                const playlistData: Playlist = { type: "videoId", body: videoId };
                pllists.push(playlistData);
                const data = await videoInfoEmbedGet([playlistData], "この動画を追加するには`/add text:" + (i + 1) + "`または`/add text:" + videoId + "`と入力", interaction.client);
                embeds.push(...data.embeds);
                if (data.files) files.push(...data.files)
            }
            embeds.push(messageEmbedGet("検索一覧です。`/add` `/play`コマンドを使用して追加しましょう！このリストの期限は５分間です。", interaction.client));
        } else {
            for (let i = 0; i < (length || 5); i++) {
                send(i, length || 5);
                const videoId = youtubeDatas[i].videoId;
                if (!embeds[0]) {
                    embeds[0] = new EmbedBuilder();
                    const embed = embeds[0];
                    embed.setTitle("検索一覧");
                    embed.setDescription("次に取得されたリストを表示します。`/add` `/play`コマンドを使って追加しましょう！このリストの期限は５分間です。");
                    embed.setAuthor({
                        name: "音楽bot",
                        iconURL: interaction.client.user?.avatarURL() || undefined,
                    });
                    embed.setColor("Purple");
                }
                const embed = embeds[0];
                const playlistData: Playlist = { type: "videoId", body: videoId };
                pllists.push(playlistData);
                const meta = await videoMetaCacheGet(playlistData);
                if (meta?.body && meta.type === "videoId") {
                    let videoTitle = meta.body?.title || "取得ができませんでした。";
                    let authorName = "取得ができませんでした。";
                    const albumInfoJson: {
                        youtubeLink: {
                            videoId: {
                                [videoId: string]: {
                                    recording: string;
                                    release: string;
                                }
                            }
                        }
                    } = JSON.parse(String(fs.readFileSync("albumInfo.json")));
                    let musicBrainzIs = false;
                    if (albumInfoJson.youtubeLink.videoId[playlistData.body]) {
                        const recordingInfo = await musicBrainz.recordingInfoGet(albumInfoJson.youtubeLink.videoId[playlistData.body].recording);
                        videoTitle = recordingInfo.title;
                        musicBrainzIs = true;
                    }
                    const data = await youtubeUserInfoGet(meta.body.author.url);
                    if (data) {
                        authorName = data?.snippet?.localized?.title || data?.snippet?.title || "取得に失敗";
                    }
                    embed.addFields({ name: (i + 1) + ". " + videoTitle, value: "ユーザー: `" + authorName + "` 追加するには`/add text:" + (i + 1) + "`" });
                }
            }
        }
        serversData.discord.search = {
            list: pllists,
            time: Date.now()
        };
        await message.edit({ embeds: embeds, files: files });
    }
}

