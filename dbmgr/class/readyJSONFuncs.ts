import { MusicLibraryJSON } from "../interface.js";
import fs from "fs";
import fsPromise from "fs/promises";

/**
 * ミュージックライブラリのJSONを初めて読み込むときに使用する関数をまとめたものです。保存が同時進行しないようにも設計しています。
 */
export class ReadyJSONFuncs {
    private saveQueue?: string;
    private saving = false;

    getJSON(): MusicLibraryJSON {
        if (!fs.existsSync("./dbmgr.json")) fs.writeFileSync("./dbmgr.json", "{}");
        try {
            const json = JSON.parse(String(fs.readFileSync("./dbmgr.json")));
            if (json.youtube === undefined) json.youtube = [];
            if (json.niconico === undefined) json.niconico = [];
            if (json.twitter === undefined) json.twitter = [];
            if (json.soundcloud === undefined) json.soundcloud = [];

            if (json.musicBrainzReleaseInfo === undefined) json.musicBrainzReleaseInfo = [];
            if (json.musicBrainzRecordingInfo === undefined) json.musicBrainzRecordingInfo = [];

            if (json.youtubeUserIcons === undefined) json.youtubeUserIcons = [];
            if (json.niconicoUserIcons === undefined) json.niconicoUserIcons = [];
            if (json.twitterUserIcons === undefined) json.twitterUserIcons = [];
            if (json.soundcloudUserIcons === undefined) json.soundcloudUserIcons = [];

            if (json.users === undefined) json.users = [];
            if (json.servers === undefined) json.servers = [];
            if (json.v2metadata === undefined) json.v2metadata = {};
            return json;
        } catch (e) {
            try {
                console.error("ミュージックライブラリはJSONの読み込みに失敗しました。dbmgr-old.jsonに変更し、新しいJSONで続行されます。");
                fs.renameSync("./dbmgr.json", "./dbmgr-old.json");
            } catch (e) {
                console.error("ミュージックライブラリは読み込みに失敗したJSONの名前の変更にも失敗しました。");
                // SumLog.error("ミュージックライブラリは読み込みに失敗したJSONの名前の変更にも失敗しました。");
                process.exit(1);
            }
            try {
                fs.writeFileSync("./dbmgr.json", "{}");
            } catch (e) {
                console.error("ミュージックライブラリは読み込みに失敗したJSONの上書きにも失敗しました。");
                // SumLog.error("ミュージックライブラリは読み込みに失敗したJSONの上書きにも失敗しました。");
                process.exit(1);
            }
            return {
                youtube: [],
                niconico: [],
                twitter: [],
                soundcloud: [],
                musicBrainzReleaseInfo: [],
                musicBrainzRecordingInfo: [],
                youtubeUserIcons: [],
                niconicoUserIcons: [],
                twitterUserIcons: [],
                soundcloudUserIcons: [],
                users: [],
                servers: [],
                v2metadata: {}
            };
        }
    };


    async saveJSON(json: MusicLibraryJSON) {
        this.saveQueue = JSON.stringify(json, null, 2);
        if (this.saving) return;
        while (true) {
            this.saving = true;
            const saveData = this.saveQueue;
            this.saveQueue = undefined;
            await fsPromise.writeFile("./dbmgr-saving.json", saveData);
            await fsPromise.rename("./dbmgr-saving.json", "./dbmgr.json");
            console.log("JSONを保存しました。");
            this.saving = false;
            if (!this.saveQueue) break;
        }
    }
}
