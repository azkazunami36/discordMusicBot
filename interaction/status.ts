import { Interaction, SlashCommandBuilder, CacheType, Client, EmbedBuilder, CommandInteraction, APIEmbedField } from "discord.js";

import { InteractionInputData } from "../interface.js";
import { EnvData, Playlist, VideoMetaCache } from "../envJSON.js";
import { VariableExistCheck } from "../variableExistCheck.js";
import { numberToTimeString } from "../numberToTimeString.js";

export const command = new SlashCommandBuilder()
    .setName("status")
    .setDescription("プレイリスト・再生状態を確認できます。")
    .addNumberOption(option => option
        .setName("page")
        .setDescription("ページを指定します。")
    )
export const commandExample = "";

export async function execute(interaction: Interaction<CacheType>, inputData: InteractionInputData) {
    if (interaction.isChatInputCommand()) {
        const variableExistCheck = new VariableExistCheck(interaction);
        const guildData = await variableExistCheck.guild();
        if (!guildData) return;
        const playlist = await variableExistCheck.playlist();
        if (!playlist) return;
        const serverData = await variableExistCheck.serverData(inputData.serversDataClass);
        if (!serverData) return;
        async function statusEmbedGet(data: {
            guildId: string;
            page: number;
            client: Client;
            playlist: Playlist[];
            playing?: {
                playingPlaylist?: Playlist;
                playingTime?: number;
            }
        }) {
            const { client, guildId, page, playlist } = data;
            const videoMetaCache = new VideoMetaCache();
            const playlistPage = Math.ceil(playlist.length / 5);
            const selectPlaylistPage = page < playlistPage ? page : playlistPage;
            const fields: APIEmbedField[] = [];
            const viewPlaylists = playlist.slice((selectPlaylistPage - 1) * 5, (selectPlaylistPage - 1) * 5 + 5);
            for (let i = 0; i < viewPlaylists.length; i++) {
                const playlistData = viewPlaylists[i];
                const meta = await videoMetaCache.cacheGet(playlistData);
                if (meta?.body) if (meta.type === "videoId") {
                    fields.push({
                        name: ((selectPlaylistPage - 1) * 5 + i + 1) + ". " + meta.body.title,
                        value: "動画時間: `" + numberToTimeString(meta.body.duration.seconds) + "` 動画サービス: `YouTube`",
                        inline: false
                    });
                } else if (meta.type === "nicovideoId") {
                    fields.push({
                        name: (i + 1) + ". " + meta.body.title,
                        value: "動画時間: `" + (!Number.isNaN(Number(meta.body.lengthSeconds)) ? numberToTimeString(Number(meta.body.lengthSeconds)) : "不明") + "` 動画サービス: `ニコニコ動画`",
                        inline: false
                    });
                }
            }
            if (playlistPage === 0) fields.push({
                name: "曲を追加しましょう",
                value: "`/add text:[URLまたは検索したい文字列]`で追加できます。"
            })
            const envData = new EnvData(guildId);
            fields.push({
                name: "プレイリストページ",
                value: playlistPage + "ページ中" + selectPlaylistPage + "ページ目",
                inline: false
            },
                {
                    name: "その他の情報",
                    value: "",
                    inline: false
                },
                {
                    name: "再生位置",
                    value: data.playing?.playingTime ? numberToTimeString(data.playing.playingTime) : "再生していません。",
                    inline: true
                },
                {
                    name: "スピード",
                    value: envData.playSpeed + "倍速",
                    inline: true
                },
                {
                    name: "音量",
                    value: envData.volume + "%",
                    inline: true
                },
                {
                    name: "リピート",
                    value: (() => { switch (envData.playType) { case 1: return "オフ"; case 2: return "オン"; case 3: return "１曲のみ" } })(),
                    inline: true
                })
            const embed = new EmbedBuilder()
                .setAuthor({
                    name: "音楽bot",
                    iconURL: client.user?.avatarURL() || "",
                })
                .setDescription("プレイリスト")
                .addFields(fields)
                .setColor("Purple")
            if (data.playing?.playingPlaylist) {
                const meta = await videoMetaCache.cacheGet(data.playing.playingPlaylist);
                if (meta?.body) {
                    const thumbnail = meta.type === "videoId" ? meta.body.thumbnail : meta.body.thumbnailUrl;
                    if (thumbnail) embed.setThumbnail(thumbnail);
                    embed.setURL(meta?.type === "videoId" ? meta.body.url : "https://www.nicovideo.jp/user/" + meta.body.userId);
                }
                embed.setTitle("再生中 - " + (meta?.body?.title || "タイトル取得エラー"));
            } else {
                embed.setTitle("再生していません")
            }
            return embed;
        }
        const embed = await statusEmbedGet({
            guildId: guildData.guildId,
            page: interaction.options.getNumber("page") || 1,
            client: interaction.client,
            playlist,
            playing: { playingPlaylist: inputData.player.playingGet(guildData.guildId), playingTime: inputData.player.playtimeGet(guildData.guildId) }
        });
        await interaction.editReply({
            content: "音楽botのステータスです。",
            embeds: [embed]
        });
    }
}
