import { parentPort } from "worker_threads";
import fs from "fs";
import { MusicLibraryJSON } from "../main.js";

if (fs.existsSync("./dbmgr.json")) {
    const json: MusicLibraryJSON | undefined = (() => {
        try {
            return JSON.parse(String(fs.readFileSync("./dbmgr.json")));
        } catch (e) { }
    })();
    if (json) {
        const res = {
            youtube: json.youtube ? {
                totalsize: json.youtube.map(info => info.sourceInfo.size).reduce((pre, cur) => pre + cur, 0),
                numoffile: json.youtube.length
            } : undefined,
            niconico: json.niconico ? {
                totalsize: json.niconico.map(info => info.sourceInfo.size).reduce((pre, cur) => pre + cur, 0),
                numoffile: json.niconico.length
            } : undefined,
            twitter: json.twitter ? {
                totalsize: json.twitter.map(info => info.sourceInfos.map(source => source.size)).reduce((pre, cur) => pre + cur.reduce((pre, cur) => pre + cur, 0), 0),
                numoffile: json.twitter.map(info => info.sourceInfos.length).reduce((pre, cur) => pre + cur, 0)
            } : undefined,
            soundcloud: json.soundcloud ? {
                totalsize: json.soundcloud.map(info => info.sourceInfo.size).reduce((pre, cur) => pre + cur, 0),
                numoffile: json.soundcloud.length
            } : undefined,
            totalsize: 0,
            numoffile: 0
        }
        res.totalsize += res.youtube ? res.youtube.totalsize : 0;
        res.totalsize += res.niconico ? res.niconico.totalsize : 0;
        res.totalsize += res.twitter ? res.twitter.totalsize : 0;
        res.totalsize += res.soundcloud ? res.soundcloud.totalsize : 0;
        res.numoffile += res.youtube ? res.youtube.numoffile : 0;
        res.numoffile += res.niconico ? res.niconico.numoffile : 0;
        res.numoffile += res.twitter ? res.twitter.numoffile : 0;
        res.numoffile += res.soundcloud ? res.soundcloud.numoffile : 0;
        parentPort?.postMessage({ data: res });
    } else {
        parentPort?.postMessage({ errorText: "JSONの取得に失敗しました。" });
    }
} else {
    parentPort?.postMessage({ errorText: "JSONがありませんでした。" });
}
