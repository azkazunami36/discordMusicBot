import { statusErrorCodeDbmgrFormat, stringToErrorCode } from "../../func/dbmgrErrorCodeParser.js";
import { MusicLibraryJSON } from "../interface.js";
import { musicBrainzRecordingInfoGet, musicBrainzReleaseInfoGet, soundcloudUserIconGet, youtubeUserIconGet } from "../worker/infoGetHelper.js";
import { MusicBrainzRecordingInfo, MusicBrainzReleaseInfo } from "../worker/infoGetWorker.js";
import { ReadyJSONFuncs } from "./readyJSONFuncs.js";

/**
 * MusicBrainzなどの情報データやユーザー情報などの処理を行います。
 * 
 * 同時に要求された場合に重複処理しないように賢く内部で処理をします。
 * 
 * 現時点で最も読むのが大変なコードです。
 */
export class JSONManager {
    private json: MusicLibraryJSON;
    private rjsonf: ReadyJSONFuncs;
    private get JSON() { return this.json }
    private downloadStatus: {
        musicBrainz: {
            release: {
                mbid: string;
                datawaitfunc: Promise<statusErrorCodeDbmgrFormat<MusicBrainzReleaseInfo>>;
            }[];
            recording: {
                mbid: string;
                datawaitfunc: Promise<statusErrorCodeDbmgrFormat<MusicBrainzRecordingInfo>>;
            }[];
        };
        userIcons: {
            youtube: {
                id: string;
                urlwaitfunc: Promise<statusErrorCodeDbmgrFormat<string>>
            }[];
            soundcloud: {
                id: string;
                urlwaitfunc: Promise<statusErrorCodeDbmgrFormat<string>>
            }[];
            niconico: {
                id: string;
                urlwaitfunc: Promise<string | void>
            }[];
            twitter: {
                id: string;
                urlwaitfunc: Promise<{ id: string; url: string; } | void>
            }[];
        }
    } = {
            musicBrainz: {
                release: [],
                recording: []
            },
            userIcons: {
                youtube: [],
                niconico: [],
                soundcloud: [],
                twitter: []

            }
        }
    constructor(json: MusicLibraryJSON, rjsonf: ReadyJSONFuncs) {
        this.json = json;
        this.rjsonf = rjsonf;
        this.userIcons = new (class UserIconsGet {
            JSONManager: JSONManager;
            json: MusicLibraryJSON;
            constructor(json: MusicLibraryJSON, JSONManager: JSONManager) {
                this.JSONManager = JSONManager;
                this.json = json;
            }
            async getYouTube(id: string, option?: {
                errorGet?: (errorCode: string) => void;
            }) {
                if (!this.json.youtubeUserIcons) this.json.youtubeUserIcons = [];
                const info = this.json.youtubeUserIcons.find(info => info.id === id);
                if (info) return { info: info.url }
                else {
                    const status = this.JSONManager.downloadStatus.userIcons.youtube.find(status => status.id === id);
                    if (status) {
                        const result = await status.urlwaitfunc;
                        if (result.status === "error") return { info: null }
                        return { info: result.resolve }
                    } else {
                        function downloadStatusDelete(JSONManager: JSONManager) {
                            const inde = JSONManager.downloadStatus.userIcons.youtube.findIndex(status => status.id === id);
                            if (inde !== -1) JSONManager.downloadStatus.userIcons.youtube.splice(inde, 1);
                        }
                        const status: {
                            id: string;
                            urlwaitfunc: Promise<statusErrorCodeDbmgrFormat<string>>;
                        } = {
                            id, urlwaitfunc: youtubeUserIconGet(id)
                        }
                        this.JSONManager.downloadStatus.userIcons.youtube.push(status);
                        status.urlwaitfunc.then(data => {
                            if (!this.json.youtubeUserIcons) this.json.youtubeUserIcons = [];
                            if (data.status === "error") {
                                console.log("情報取得関数でエラー。");
                                option?.errorGet?.("3-2");
                                data.reject.errorCode.forEach(code => { option?.errorGet?.(code); });
                            }
                            if (data.status === "success") {
                                this.json.youtubeUserIcons.push({ id: id, url: data.resolve });
                                this.JSONManager.rjsonf.saveJSON(this.json);
                            }
                            downloadStatusDelete(this.JSONManager);
                        });
                        const info = this.json.youtubeUserIcons.find(info => info.id === id);
                        if (info) return { info: info.url }
                        else {
                            const result = await status.urlwaitfunc;
                            if (result.status === "error") return { info: null }
                            return { info: result.resolve }
                        }
                    }
                }
            }
            async getSoundCloud(id: string, option?: {
                errorGet?: (errorCode: string) => void;
            }) {
                if (!this.json.soundcloudUserIcons) this.json.soundcloudUserIcons = [];
                const info = this.json.soundcloudUserIcons.find(info => info.id === id);
                if (info) return { info: info.url }
                else {
                    const status = this.JSONManager.downloadStatus.userIcons.soundcloud.find(status => status.id === id);
                    if (status) {
                        const result = await status.urlwaitfunc;
                        if (result.status === "error") return { info: null }
                        return { info: result.resolve }

                    } else {
                        function downloadStatusDelete(JSONManager: JSONManager) {
                            const inde = JSONManager.downloadStatus.userIcons.soundcloud.findIndex(status => status.id === id);
                            if (inde !== -1) JSONManager.downloadStatus.userIcons.soundcloud.splice(inde, 1);
                        }
                        const status: {
                            id: string;
                            urlwaitfunc: Promise<statusErrorCodeDbmgrFormat<string>>;
                        } = {
                            id, urlwaitfunc: soundcloudUserIconGet(id)
                        }
                        this.JSONManager.downloadStatus.userIcons.soundcloud.push(status);
                        status.urlwaitfunc.then(data => {
                            if (!this.json.soundcloudUserIcons) this.json.soundcloudUserIcons = [];
                            if (data.status === "error") {
                                console.log("情報取得関数でエラー。");
                                option?.errorGet?.("3-2");
                                data.reject.errorCode.forEach(code => { option?.errorGet?.(code); });
                            }
                            if (data.status === "success") {
                                this.json.soundcloudUserIcons.push({ id: id, url: data.resolve });
                                this.JSONManager.rjsonf.saveJSON(this.json);
                            }
                            downloadStatusDelete(this.JSONManager);
                        });
                        const info = this.json.soundcloudUserIcons.find(info => info.id === id);
                        if (info) return { info: info.url }
                        else {
                            const result = await status.urlwaitfunc;
                            if (result.status === "error") return { info: null }
                            return { info: result.resolve }
                        }
                    }
                }
            }
            async getniconico(id: string, option?: {
                errorGet?: (errorCode: string) => void;
            }) {
                if (!this.json.niconicoUserIcons) this.json.niconicoUserIcons = [];
                const info = this.json.niconicoUserIcons.find(info => info.id === id);
                if (info) return { info: info.url }
                else {
                    const status = this.JSONManager.downloadStatus.userIcons.niconico.find(status => status.id === id);
                    if (status) {
                        return { info: await status.urlwaitfunc ?? null }
                    } else {
                        function downloadStatusDelete(JSONManager: JSONManager) {
                            const inde = JSONManager.downloadStatus.userIcons.niconico.findIndex(status => status.id === id);
                            if (inde !== -1) JSONManager.downloadStatus.userIcons.niconico.splice(inde, 1);
                        }
                        const status: {
                            id: string;
                            urlwaitfunc: Promise<string | void>;
                        } = {
                            id, urlwaitfunc: new Promise<string | void>(async resolve => {
                                try {
                                    const url = "https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/" + Math.floor(Number(id) / 10000) + "/" + id + ".jpg";
                                    const res = await fetch(url, { method: "HEAD" });
                                    if (res.ok) return resolve(url);
                                } catch { }
                                resolve()
                            })
                        }
                        this.JSONManager.downloadStatus.userIcons.niconico.push(status);
                        status.urlwaitfunc.then(data => {
                            if (!this.json.niconicoUserIcons) this.json.niconicoUserIcons = [];
                            if (data === undefined) {
                                console.log("情報取得関数でエラー。");
                                option?.errorGet?.("3-2");
                                option?.errorGet?.(stringToErrorCode("画像存在チェックで404エラーまたは正常ではない応答が返ってきました。画像は利用できません。"));
                                this.json.niconicoUserIcons.push({ id: id, url: null });
                            }
                            if (data) this.json.niconicoUserIcons.push({ id: id, url: data });
                            this.JSONManager.rjsonf.saveJSON(this.json);
                            downloadStatusDelete(this.JSONManager);
                        });
                        const info = this.json.niconicoUserIcons.find(info => info.id === id);
                        if (info) return { info: info.url }
                        else return { info: await status.urlwaitfunc ?? null }
                    }
                }
            }
            async getTwitter(id: string, option?: {
                userId?: string;
                errorGet?: (errorCode: string) => void;
            }) {
                if (!this.json.twitterUserIcons) this.json.twitterUserIcons = [];
                const info = this.json.twitterUserIcons.find(info => info.id === id);
                if (info) return { info: info.url }
                else {
                    const userId = option?.userId;
                    if (!userId) return { info: null };
                    const status = this.JSONManager.downloadStatus.userIcons.twitter.find(status => status.id === userId);
                    if (status) {
                        const info = await status.urlwaitfunc;
                        return { info: info ? info.url : null }
                    } else {
                        function downloadStatusDelete(JSONManager: JSONManager) {
                            const inde = JSONManager.downloadStatus.userIcons.twitter.findIndex(status => status.id === userId);
                            if (inde !== -1) JSONManager.downloadStatus.userIcons.twitter.splice(inde, 1);
                        }
                        const status: {
                            id: string;
                            urlwaitfunc: Promise<{ id: string; url: string; } | void>;
                        } = {
                            id: userId, urlwaitfunc: new Promise<{ id: string; url: string } | void>(async resolve => {
                                try {
                                    const url = "https://api.fxtwitter.com/" + userId;
                                    const res = await fetch(url);
                                    if (res.ok) {
                                        const jsontext = await res.text();
                                        const json: {
                                            user?: {
                                                id?: string;
                                                avatar_url?: string;
                                            }
                                        } = JSON.parse(jsontext);
                                        if (json.user?.id && json.user.avatar_url) return resolve({ id: json.user.id, url: json.user.avatar_url });
                                    }

                                } catch { }
                                resolve()
                            })
                        }
                        this.JSONManager.downloadStatus.userIcons.twitter.push(status);
                        status.urlwaitfunc.then(data => {
                            if (!this.json.twitterUserIcons) this.json.twitterUserIcons = [];
                            if (data === undefined) {
                                console.log("情報取得関数でエラー。");
                                option?.errorGet?.("3-2");
                                option?.errorGet?.(stringToErrorCode("画像存在チェックで404エラーまたは正常ではない応答が返ってきました。画像は利用できません。"));
                                this.json.twitterUserIcons.push({ id: id, url: null });
                                return;
                            }
                            if (data) this.json.twitterUserIcons.push(data);
                            this.JSONManager.rjsonf.saveJSON(this.json);
                            downloadStatusDelete(this.JSONManager);
                        });
                        const info = this.json.twitterUserIcons.find(info => info.id === id);
                        if (info) return { info: info.url }
                        else {
                            const info = await status.urlwaitfunc;
                            return { info: info ? info.url : null }
                        }
                    }
                }
            }
        })(this.JSON, this)
        this.musicBrainz = new (class MusicBrainz {
            JSONManager: JSONManager;
            json: MusicLibraryJSON;
            constructor(json: MusicLibraryJSON, JSONManager: JSONManager) {
                this.JSONManager = JSONManager;
                this.json = json;
            }
            async getRelease(mbid: string, option?: {
                errorGet?: (errorCode: string) => void;
            }) {
                if (!this.json.musicBrainzReleaseInfo) this.json.musicBrainzReleaseInfo = [];
                const info = this.json.musicBrainzReleaseInfo.find(info => info.uuid === mbid);
                if (info) return { info }
                else {
                    const status = this.JSONManager.downloadStatus.musicBrainz.release.find(status => status.mbid === mbid);
                    if (status) {
                        const result = await status.datawaitfunc;
                        if (result.status === "error") {
                            console.log("情報取得関数でエラー。");
                            option?.errorGet?.("3-2");
                            result.reject.errorCode.forEach(code => { option?.errorGet?.(code); });
                            return;
                        }
                        return { info: result.resolve }
                    } else {
                        function downloadStatusDelete(JSONManager: JSONManager) {
                            const inde = JSONManager.downloadStatus.musicBrainz.release.findIndex(status => status.mbid === mbid);
                            if (inde !== -1) JSONManager.downloadStatus.musicBrainz.release.splice(inde, 1);
                        }
                        const status: {
                            mbid: string;
                            datawaitfunc: Promise<statusErrorCodeDbmgrFormat<MusicBrainzReleaseInfo>>;
                        } = {
                            mbid, datawaitfunc: musicBrainzReleaseInfoGet(mbid)
                        }
                        this.JSONManager.downloadStatus.musicBrainz.release.push(status);
                        status.datawaitfunc.then(data => {
                            if (!this.json.musicBrainzReleaseInfo) this.json.musicBrainzReleaseInfo = [];
                            if (data.status === "error") {
                                console.log("情報取得関数でエラー。");
                                option?.errorGet?.("3-2");
                                data.reject.errorCode.forEach(code => { option?.errorGet?.(code); });
                            }
                            if (data.status === "success") {
                                this.json.musicBrainzReleaseInfo.push(data.resolve);
                                this.JSONManager.rjsonf.saveJSON(this.json);
                            }
                            downloadStatusDelete(this.JSONManager);
                        });
                        const info = this.json.musicBrainzReleaseInfo.find(info => info.uuid === mbid);
                        if (info) return { info }
                        else {
                            const result = await status.datawaitfunc;
                            if (result.status === "error") {
                                console.log("情報取得関数でエラー。");
                                option?.errorGet?.("3-2");
                                result.reject.errorCode.forEach(code => { option?.errorGet?.(code); });
                                return;
                            }
                            return { info: result.resolve }
                        }
                    }
                }
            }
            async getRecording(mbid: string, option?: {
                errorGet?: (errorCode: string) => void;
            }) {
                if (!this.json.musicBrainzRecordingInfo) this.json.musicBrainzRecordingInfo = [];
                const info = this.json.musicBrainzRecordingInfo.find(info => info.uuid === mbid);
                if (info) return { info }
                else {
                    const status = this.JSONManager.downloadStatus.musicBrainz.recording.find(status => status.mbid === mbid);
                    if (status) {
                        const result = await status.datawaitfunc;
                        if (result.status === "error") {
                            console.log("情報取得関数でエラー。");
                            option?.errorGet?.("3-2");
                            result.reject.errorCode.forEach(code => { option?.errorGet?.(code); });
                            return;
                        }
                        return { info: result.resolve }
                    } else {
                        function downloadStatusDelete(JSONManager: JSONManager) {
                            const inde = JSONManager.downloadStatus.musicBrainz.recording.findIndex(status => status.mbid === mbid);
                            if (inde !== -1) JSONManager.downloadStatus.musicBrainz.recording.splice(inde, 1);
                        }
                        const status: {
                            mbid: string;
                            datawaitfunc: Promise<statusErrorCodeDbmgrFormat<MusicBrainzRecordingInfo>>;
                        } = {
                            mbid, datawaitfunc: musicBrainzRecordingInfoGet(mbid)
                        }
                        this.JSONManager.downloadStatus.musicBrainz.recording.push(status);
                        status.datawaitfunc.then(data => {
                            if (!this.json.musicBrainzRecordingInfo) this.json.musicBrainzRecordingInfo = [];
                            if (data.status === "error") {
                                console.log("情報取得関数でエラー。");
                                option?.errorGet?.("3-2");
                                data.reject.errorCode.forEach(code => { option?.errorGet?.(code); });
                            }
                            if (data.status === "success") {
                                this.json.musicBrainzRecordingInfo.push(data.resolve);
                                this.JSONManager.rjsonf.saveJSON(this.json);
                            }
                            downloadStatusDelete(this.JSONManager);
                        });
                        const info = this.json.musicBrainzRecordingInfo.find(info => info.uuid === mbid);
                        if (info) return { info }
                        else {
                            const result = await status.datawaitfunc;
                            if (result.status === "error") {
                                console.log("情報取得関数でエラー。");
                                option?.errorGet?.("3-2");
                                result.reject.errorCode.forEach(code => { option?.errorGet?.(code); });
                                return;
                            }
                            return { info: result.resolve }
                        }
                    }
                }
            }
        })(this.JSON, this);
    }
    readonly musicBrainz;
    readonly userIcons;
}
