import fs from "fs";
import fsP from "fs/promises";

import { MusicLibraryJSON, TwitterInfoData } from "../dbmgr/main.js";
import { jsonAnalizer, JSONAnalizerInfo } from "../dbmgr/worker/jsonAnalyzerHelper.js";
import { info } from "console";
import { TwitterInfo, twitterInfoGet } from "../dbmgr/worker/infoGetHelper.js";
import { ProgressView } from "../class/progressView.js";

export async function databaseCheck(discordMusicBotPath: string, json: MusicLibraryJSON) {
    console.log("ミュージックライブラリのJSONと実体の整合性チェックを行います。");
    const jsonInfo = await jsonAnalizer();
    console.log("YouTubeアイテムは" + jsonInfo.youtube.numoffile + "個あります。");
    console.log("Twitterアイテムは" + jsonInfo.twitter.numoffile + "個あります。");
    console.log("ニコニコ動画アイテムは" + jsonInfo.niconico.numoffile + "個あります。");
    console.log("SoundCloudアイテムは" + jsonInfo.soundcloud.numoffile + "個あります。");
    console.log("JSON上では音声ファイル合計サイズは" + (Math.floor(jsonInfo.totalsize * 10 / 1000 / 1000) / 10) + "MBとされています。");

    console.log("TwitterのJSONチェックを行います。主にTwitterのユーザー数字IDがJSONに含まれているかのチェックを行います。");
    const 修正済みデータ: TwitterInfoData[] = [];
    const twitterUser = new Map<string, string>();
    const progress = new ProgressView();
    progress.reflashrate = 60;
    let success = 0;
    json.twitter.forEach(info => {
        info.videoInfos.forEach(info => {
            if (info.userId && info.userNumId) twitterUser.set(info.userId, info.userNumId);
        });
    });
    for (let i = 0; i < json.twitter.length; i++) {
        const info = json.twitter[i];
        progress.message = "TwitterのユーザーID存在チェック・修復中 (" + i + "/" + json.twitter.length + ") " + success + "個成功";
        progress.percent = i / json.twitter.length * 100;
        let get = false;
        info.videoInfos.forEach(info => {
            if (!info.userNumId) get = true;
        })
        if (get) {
            let getted = false;
            if (!twitterUser.get(info.id)) {
                const newInfo = await twitterInfoGet(info.id);
                if (newInfo.status !== "error") {
                    getted = true;
                    newInfo.resolve.forEach(info => {
                        if (info.userId) twitterUser.set(info.userId, info.userNumId);
                    });
                }
            }
            let bk = false;
            const newVideoInfos: TwitterInfo[] = [];
            for (const inf of info.videoInfos) {
                const userId = inf.userId;
                if (!userId) return bk = true;
                const numid = await (async () => {
                    if (!twitterUser.get(userId) && !getted) {
                        getted = true;
                        const newInfo = await twitterInfoGet(inf.id);
                        if (newInfo.status === "error") return;
                        newInfo.resolve.forEach(info => {
                            if (info.userId) twitterUser.set(info.userId, info.userNumId);
                        });
                    }
                    return twitterUser.get(userId);
                })();
                if (!numid) return bk = true;
                inf.userNumId = numid;
                newVideoInfos.push(inf);
            }
            if (bk) continue;
            info.videoInfos = newVideoInfos;
            修正済みデータ.push(info);
            success++;
        } else 修正済みデータ.push(info);
    }
    progress.done = true;
    console.log("TwitterのJSON" + json.twitter.length + "個のうち" + (json.twitter.length - 修正済みデータ.length) + "個は破棄され、" + success + "個はチェックまたは修復されました。");
    json.twitter = 修正済みデータ;

    async function folderCheck(folderName: string, serviceName: string, info: JSONAnalizerInfo, fileList: string[]) {
        console.log(serviceName + "のソースフォルダのチェックを行います。");
        const files = fs.readdirSync(discordMusicBotPath + "/" + folderName);
        const notfoundfiles: string[] = [];
        let folderitemnum = files.length;
        console.log("./" + folderName + "を見つけました。" + files.length + "個あります。");
        for (const filename of fileList) {
            const index = files.indexOf(filename);
            if (index !== -1) files.splice(index, 1);
            else notfoundfiles.push(filename);
        }
        const filescheck = [...files];
        for (const filename of filescheck) {
            const info = await fsP.stat(discordMusicBotPath + "/" + folderName + "/" + filename);
            if (info.isDirectory()) {
                await fsP.rm(discordMusicBotPath + "/" + folderName + "/" + filename, { force: true, recursive: true });
                const index = files.indexOf(filename);
                if (index !== -1) {
                    files.splice(index, 1);
                    folderitemnum--;
                }
                console.log("作業途中の一時フォルダ「" + filename + "」を発見しました。削除済みです。");
            }
        }
        const nfitemfiles = notfoundfiles.length; // JSONのデータを使って検索したが、ヒットしなかったJSONデータ(フォルダに存在しないJSON内アイテム)
        const nfitemjson = files.length; // JSONのデータを使って検索したが、フォルダ内でアクセスされなかったファイル群(JSONに存在しないフォルダ内アイテム)
        console.log(serviceName + "はJSONに" + info.numoffile + "個あり、フォルダには" + folderitemnum + "個ありました。"
            + (nfitemfiles === 0 && nfitemjson === 0 ? "JSONとフォルダの内容は正常です。" :
                ((nfitemfiles !== 0 ? "フォルダに存在しない(JSONにのみ存在する)アイテムが" + nfitemfiles + "個あります。" : "") + (nfitemjson !== 0 ? "JSONに存在しないファイル(フォルダにのみ存在する)アイテムが" + nfitemjson + "個あります。" : ""))));
    }
    await folderCheck("youtube", "YouTube", jsonInfo.youtube, json.youtube.map(info => info.sourceInfo.filename));
    await folderCheck("niconico", "ニコニコ動画", jsonInfo.niconico, json.niconico.map(info => info.sourceInfo.filename));
    await folderCheck("twitter", "Twitter", jsonInfo.twitter, json.twitter.map(info => info.sourceInfos.map(info => info.filename)).flat());
    await folderCheck("soundcloud", "SoundCloud", jsonInfo.soundcloud, json.soundcloud.map(info => info.sourceInfo.filename));

    function userIconsDupCheck(serviceName: string, iconinfo: { id: string, url: string | null }[]) {
        const 出てきたユーザーID = new Set<string>();
        const 修正済みデータ = []
        for (const data of iconinfo) {
            if (!出てきたユーザーID.has(data.id)) {
                出てきたユーザーID.add(data.id);
                修正済みデータ.push(data);
            }
        }
        console.log(serviceName + "ユーザーアイコン情報は" + 修正済みデータ.length + "個あります。" + (修正済みデータ.length < iconinfo.length ? "重複していた項目" + (iconinfo.length - 修正済みデータ.length) + "個を削除済みです。" : ""));
        return 修正済みデータ;
    }
    json.youtubeUserIcons = userIconsDupCheck("YouTube", json.youtubeUserIcons);
    json.niconicoUserIcons = userIconsDupCheck("ニコニコ動画", json.niconicoUserIcons);
    json.soundcloudUserIcons = userIconsDupCheck("SoundCloud", json.soundcloudUserIcons);
    json.twitterUserIcons = userIconsDupCheck("Twitter", json.twitterUserIcons);

    console.log("フォルダとJSONの実体チェックのみ完了しました。FFprobeを利用したソース内容のチェックは実装されていません。");
}
