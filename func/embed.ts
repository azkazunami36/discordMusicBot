import { APIEmbedField, Attachment, AttachmentBuilder, BaseMessageOptions, BufferResolvable, Client, EmbedBuilder } from "discord.js";
import path from "path";
import Stream from "stream";
import mysql from "mysql2/promise";
import { } from "../interface.js";
import { SumLog } from "../class/sumLog.js";
import { ServerInfoAPI } from "../dbAPIs.js";
import { Unidata } from "../dbmgrAPI.js";

const serviceInfos: {
    type: "youtube" | "niconico" | "twitter" | "soundcloud";
    name: string;
    iconUrl: string;
    color: "NotQuiteBlack" | "Red" | "Grey";
    url: string;
    artistUrl: string;
}[] = [
        {
            type: "youtube",
            name: "YouTube",
            iconUrl: "https://azkazunami36.github.io/URL-basedData/yt_icon_red_digital.png",
            color: "Red",
            url: "https://youtu.be/%ID%",
            artistUrl: "https://www.youtube.com/channel/%ID%"
        },
        {
            type: "niconico",
            name: "ニコニコ動画",
            iconUrl: "https://azkazunami36.github.io/URL-basedData/nc296562_ニコニコ_シンボルマーク_白.png",
            color: "Grey",
            url: "https://www.nicovideo.jp/watch/%ID%",
            artistUrl: "https://www.nicovideo.jp/user/%ID%"
        },
        {
            type: "twitter",
            name: "X",
            iconUrl: "https://azkazunami36.github.io/URL-basedData/x-logo.png",
            color: "Grey",
            url: "https://www.x.com/%ID%",
            artistUrl: "https://www.x.com/i/web/status/%ID%"
        },
        { // 準備中
            type: "soundcloud",
            name: "SoundCloud",
            iconUrl: "https://azkazunami36.github.io/URL-basedData/yt_icon_red_digital.png",
            color: "Grey",
            url: "https://youtu.be/%ID%",
            artistUrl: "https://www.youtube.com/channel/%ID%"
        },
    ];

/**
 * 動画の情報を表示するものです。多く入力すると端折られます。1つだけだと綺麗に大きく表示します。
 */
export async function videoInfoEmbedGet(
    playlistDatas: Unidata<{}>[],
    message: string,
    client: Client,
    sumlog: SumLog,
): Promise<{ embeds: EmbedBuilder[]; }> {
    if (playlistDatas[0] && playlistDatas.length === 1) { // １つの動画が入力された場合、それを表示する。
        const playlistData = playlistDatas[0];
        await playlistData.fetch();
        const data = playlistData.getInfo(playlistData.index);
        const serviceInfo = serviceInfos.find(str => playlistData.servicetype === str.type);
        const embed = new EmbedBuilder()
        embed.setAuthor({
            name: data?.userName || "取得できませんでした。",
            url: data?.userId ? serviceInfo?.artistUrl.replace("%ID%", data.userId) : undefined,
            iconURL: data?.userIconUrl
        })
        embed.setTitle(data?.title || "取得できませんでした。");
        embed.setURL(serviceInfo?.url.replace("%ID%", playlistData.id) ?? null);
        embed.setImage(data?.thumbnailUrl ?? null);
        embed.setDescription(message);
        embed.setColor(serviceInfo?.color || "NotQuiteBlack");
        embed.setFooter({
            text: "Service by " + (serviceInfo?.name ?? "?????") + " (ID: " + playlistData.id + ")",
            iconURL: serviceInfo?.iconUrl,
        });
        return { embeds: [embed] };
    } else {
        const fields: APIEmbedField[] = [];
        for (let i = 0; i < playlistDatas.length; i++) {
            if (playlistDatas.length > 5 && i === 2) {
                fields.push({
                    name: (i + 1) + "-" + (playlistDatas.length - 2) + ". 省略",
                    value: "詳細は`/status`コマンドでチェック"
                });
                i = playlistDatas.length - 2;
            }
            const playlistData = playlistDatas[i];
            await playlistData.fetch();
            const data = playlistData.getInfo(playlistData.index);
            const serviceInfo = serviceInfos.find(str => playlistData.servicetype === str.type);
            let videoTitle = "取得ができませんでした。";
            if (data?.title) videoTitle = data.title;
            fields.push({
                name: (i + 1) + ". " + videoTitle,
                value: "動画サービス: `" + (serviceInfo?.name ?? "不明") + "` ID: `" + playlistData.id + "`"
            })
        }
        const embed = new EmbedBuilder()
            .setAuthor({
                name: "音楽bot",
                iconURL: client.user?.avatarURL() || undefined,
            })
            .setDescription(message)
            .addFields(fields)
            .setColor("Purple");
        return { embeds: [embed] };
    }
}

export async function statusEmbedGet(data: {
    guildId: string;
    /**
     * ページ情報です。ページ量計算などを任せます。
     * 
     * 各プロパティに置いて、基準は0ではなく1です。入力した数字がそのままUIとなります。
     */
    pageInfo: {
        /** ページのどこをフォーカスしているか。1以上。 */
        focus: number;
        /** ページの長さ。1以上。 */
        pageLength: number;
        /** ページ１つにつき最大アイテム個数。1以上。 */
        itemLength: number;
    }
    client: Client;
    /** 
     * この中がすべてフィールドに表示されます。ページ計算などを含めお任せします。
     * 
     * もし空っぽで返すとプレイリストが空と認識します。ページの範囲以上をもらっても必ずページの終端を返すようにしてください。
     */
    playlist: Unidata<{}>[];
    /** 再生中のものがフォーカスされます。 */
    playing?: Unidata<{}>;
    sumlog: SumLog;
    db: mysql.Pool;
}) {
    const startTime = Date.now();
    const { client, guildId, pageInfo, playlist, playing, sumlog, db } = data;
    const fields: APIEmbedField[] = [];
    for (let i = 0; i < playlist.length; i++) {
        const playlistData = playlist[i];
        await playlistData.fetch();
        fields.push({
            name: ((pageInfo.focus - 1) * pageInfo.itemLength + (i + 1)) + ". " + (playlistData.getInfo(playlistData.index)?.title || "取得できませんでした。"),
            value: "動画時間: `実装途中` 動画サービス: `" + serviceInfos.find(str => playlistData.servicetype === str.type) + "` ID: `" + playlistData.id + "`",
            inline: false
        });
    }
    if (playlist.length === 0) fields.push({
        name: "曲を追加しましょう",
        value: "`/add text:[URLまたは検索したい文字列]`で追加できます。"
    })
    const serverInfo = new ServerInfoAPI(guildId, db);
    const connection = await serverInfo.connectionStart();
    const { tempo, volume, pitch, repeatType } = await serverInfo.infoGet(connection, "tempo", "volume", "pitch", "repeatType");
    await serverInfo.connectionEnd(connection);
    fields.push({
        name: "キューページ",
        value: pageInfo.pageLength + "ページ中" + pageInfo.focus + "ページ目",
        inline: false
    },
        {
            name: "その他の情報",
            value: "",
            inline: false
        },
        {
            name: "再生位置",
            value: "実装途中",
            inline: true
        },
        {
            name: "スピード",
            value: tempo + "倍速",
            inline: true
        },
        {
            name: "音程",
            value: String(pitch),
            inline: true
        },
        {
            name: "音量",
            value: volume + "%",
            inline: true
        },
        {
            name: "リピート",
            value: (() => { switch (repeatType) { case 0: return "オフ"; case 1: return "オン"; case 2: return "１曲のみ" } })(),
            inline: true
        });
    const embed = new EmbedBuilder()
        .setAuthor({
            name: "音楽bot",
            iconURL: client.user?.avatarURL() || undefined,
        })
        .setDescription("キュー")
        .addFields(fields)
        .setColor("Purple")
    if (playing) {
        await playing.fetch();
        const playingData = playing.getInfo(playing.index);
        embed.setTitle("再生中 - " + playingData?.title || "タイトル取得エラー");
        embed.setThumbnail(playingData?.thumbnailUrl ?? null);
    } else {
        embed.setTitle("再生していません");
    }
    sumlog.log("/statusコマンド用Embedを作成しました。作成にかかった時間は" + Math.floor((Date.now() - startTime) / 1000) + "秒です。", { functionName: "statusEmbedGet" });
    return embed;
}

export function messageEmbedGet(message: string, client: Client, customTitle: string = "メッセージ") {
    return new EmbedBuilder()
        .setTitle(customTitle)
        .setAuthor({
            name: "音楽bot",
            iconURL: client.user?.avatarURL() || undefined,
        })
        .setDescription(message)
        .setColor("Purple")
}
