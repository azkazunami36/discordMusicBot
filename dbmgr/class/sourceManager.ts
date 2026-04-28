import { statusErrorCodeDbmgrFormat } from "../../func/dbmgrErrorCodeParser.js";
import { MusicLibraryJSON, niconicoInfoData, SoundCloudInfoData, SourceInfo, TwitterInfoData, YouTubeInfoData } from "../interface.js";
import { niconicoInfo, niconicoInfoGet, SoundCloudInfo, soundcloudInfoGet, TwitterInfo, twitterInfoGet, YouTubeInfo, youtubeInfoGet } from "../worker/infoGetHelper.js";
import { niconicoSourceGet, soundcloudSourceGet, twitterSourceGet, youtubeSourceGet } from "../worker/sourceGetHelper.js";
import { JSONManager } from "./jsonManager.js";
import { ReadyJSONFuncs } from "./readyJSONFuncs.js";

/**
 * YouTubeやニコニコ動画、TwitterやSoundCloud、URLソース、保存した音楽ソースなどのデータを管理するクラスです。
 * 
 * ダウンロードを並列で行ったり、情報取得とソース取得の両方が終わるまで待ってくれたりもするシステムです。
 * 
 * 現時点で最も読むのが大変なコードです。
 */
export class SourceManager {
    private json: MusicLibraryJSON;
    /**
     * ダウンロードステータスです。
     * ここにはこれらの情報が一時的に記録されます。
     * - Promise関数(完了を追跡するため)
     * - info、source(Promiseが完了すると中身が入る)
     * - progress(進行状況が取得できる場合に滑らかに値が上昇する)
     * 
     * また、保存されるステータスタイプに「single」「multi」があります。
     * - single: １つのステータスにつき１つの情報と１つのソースの取得を追跡します。
     * - multi: 1つのステータスに１つの情報(複数のデータが１回で取得可能な場合)と複数のソースの取得を追跡します。
     */
    private downloadStatus: {
        youtube: DownloadStatusOfYouTube[];
        niconico: DownloadStatusOfniconico[];
        twitter: DownloadStatusOfTwitter[];
        soundcloud: DownloadStatusOfSoundCloud[];
    } = {
            youtube: [],
            niconico: [],
            twitter: [],
            soundcloud: []
        }
    jsonmanager: JSONManager;
    rjsonf: ReadyJSONFuncs;
    constructor(json: MusicLibraryJSON, rjsonf: ReadyJSONFuncs) {
        this.json = json;
        this.jsonmanager = new JSONManager(json, rjsonf);
        this.rjsonf = rjsonf;
    }
    /**
     * ダウンロードまたはソースの取得をキューを使用して低負荷になるようにする関数のVideoInfoがシングルの場合のものです。
     */
    private async getSingleBase<
        /**
         * タイプによって変わる、動画に関する情報の記述がされたものです。
         */
        VideoInfo,
        /**
         * VideoInfoをまとめたInfoDataの配列です。SourceInfoなども含まれたものです。
         */
        JsonInfo extends {
            id: string;
            videoInfo: VideoInfo;
            sourceInfo: SourceInfo;
            musicBrainz: {
                releaseUuid?: string;
                recordingUuid?: string;
            };
        }[],
        /**
         * このクラスで使用される専用のダウンロードステータスです。進捗を保持するために使用されます。
         */
        DownloadStats extends {
            id: string;
            info?: VideoInfo;
            source?: {
                filename: string;
                sourceInfo: {
                    duration?: number;
                    size: number;
                }
            };
            infowaitfunc: Promise<statusErrorCodeDbmgrFormat<VideoInfo>>;
            sourcewaitfunc: Promise<statusErrorCodeDbmgrFormat<{
                filename: string;
                sourceInfo: {
                    duration?: number;
                    size: number;
                }
            }>>;
            progress: number;
        }>(
            videoId: string,
            infodatas: JsonInfo,
            downloadStatus: DownloadStats[],
            fast: boolean,
            statusformat: () => DownloadStats,
            userIconUrl: (info: VideoInfo) => Promise<string | null>,
            /** オプションです。通常この関数で使用しなくていい設定をここに打ちます。 */
            option?: {
                errorGet?: (errorCode: string) => void;
            }
        ) {
        /** 要求された動画がキャッシュされた動画リストに存在するかを確認し取得を試みます。 */
        const info = infodatas.find(info => info.id === videoId);
        if (info) { // ここが存在する場合、100%情報とソースが揃っている状態です。
            return { info, userIconUrl: await userIconUrl(info.videoInfo) };
        } else {
            const status = downloadStatus.find(status => status.id === videoId);
            if (status === undefined) {
                const status = statusformat();
                downloadStatus.push(status);

                function downloadStatusDelete(this: SourceManager) {
                    const inde = downloadStatus.findIndex(status => status.id === videoId);
                    if (inde !== -1) downloadStatus.splice(inde, 1);
                }
                function register(this: SourceManager, status: DownloadStats) {
                    if (!status.info || !status.source) return;
                    infodatas.push({
                        id: videoId,
                        sourceInfo: { sourceGetTimestamp: Date.now(), infoGetTimestamp: Date.now(), filename: status.source.filename, duration: status.source.sourceInfo.duration, size: status.source.sourceInfo.size },
                        videoInfo: status.info,
                        musicBrainz: {}
                    });
                    downloadStatusDelete.bind(this)();
                    this.rjsonf.saveJSON(this.json);
                }
                status.infowaitfunc.then(info => {
                    if (downloadStatus.find(status => status.id === videoId) === undefined) return; // エラーなどで削除された場合
                    if (info.status === "error") {
                        console.log("情報取得関数でエラー。");
                        option?.errorGet?.("3-2");
                        info.reject.errorCode.forEach(code => { option?.errorGet?.(code); })
                        downloadStatusDelete.bind(this)();
                        return;
                    }
                    status.info = info.resolve;
                    register.bind(this)(status);
                })
                status.sourcewaitfunc.then(source => {
                    if (downloadStatus.find(status => status.id === videoId) === undefined) return; // エラーなどで削除された場合
                    if (source.status === "error") {
                        console.log("音声を取得できませんでした。");
                        option?.errorGet?.("3-3");
                        source.reject.errorCode.forEach(code => { option?.errorGet?.(code); })
                        downloadStatusDelete.bind(this)();
                        return;
                    }
                    status.source = source.resolve;
                    register.bind(this)(status);
                });
                return fast ? fastreturn.bind(this)(status) : normalreturn.bind(this)(status);
            } else {
                return fast ? fastreturn.bind(this)(status) : normalreturn.bind(this)(status);
            }
            async function fastreturn(this: SourceManager, status: DownloadStats): Promise<{
                info: {
                    id: string;
                    videoInfo: VideoInfo;
                    sourceInfo: SourceInfo | undefined;
                    musicBrainz: {
                        releaseUuid?: string;
                        recordingUuid?: string;
                    };
                }
                userIconUrl: string | null;
                progress?: number;
            } | undefined> {
                const info = infodatas.find(info => info.id === videoId);
                if (info) return { info, userIconUrl: await userIconUrl(info.videoInfo) }
                else {
                    const result = await status.infowaitfunc;
                    if (result.status === "error") {
                        option?.errorGet?.("3-2");
                        result.reject.errorCode.forEach(code => { option?.errorGet?.(code); })
                        return;
                    }
                    return { info: { id: videoId, videoInfo: result.resolve, sourceInfo: undefined, musicBrainz: {} }, userIconUrl: await userIconUrl(result.resolve), progress: status.progress }
                }
            }
            async function normalreturn(this: SourceManager, status: DownloadStats): Promise<{
                info: {
                    id: string;
                    videoInfo: VideoInfo;
                    sourceInfo: SourceInfo;
                    musicBrainz: {
                        releaseUuid?: string;
                        recordingUuid?: string;
                    };
                };
                progress?: number;
            } | undefined> {
                await Promise.allSettled([status.infowaitfunc, status.sourcewaitfunc]);
                const info = infodatas.find(info => info.id === videoId);
                if (info) {
                    return { info }
                } else {
                    option?.errorGet?.("3-1");
                }
            }
        }
    }
    private async getMultiBase<VideoInfo,
        JsonInfo extends {
            id: string;
            videoInfos: VideoInfo[];
            sourceInfos: SourceInfo[];
            musicBrainzs: {
                releaseUuid?: string;
                recordingUuid?: string;
            }[];
        }[],
        DownloadStats extends {
            id: string;
            infos: VideoInfo[];
            sources: {
                number: number;
                source: {
                    filename: string;
                    sourceInfo: {
                        duration?: number;
                        size: number;
                    }
                } | null;
            }[];
            infowaitfuncs: Promise<statusErrorCodeDbmgrFormat<VideoInfo[]>>;
            sourcewaitfuncs: {
                number: number;
                func: Promise<statusErrorCodeDbmgrFormat<{
                    filename: string;
                    sourceInfo: {
                        duration?: number;
                        size: number;
                    }
                }>>; progress: number;
            }[];
        }>(
            videoId: string,
            infodatas: JsonInfo,
            downloadStatus: DownloadStats[],
            fast: boolean,
            statusformat: () => DownloadStats,
            sourceformat: (itemNumber: number) => {
                number: number; func: Promise<statusErrorCodeDbmgrFormat<{
                    filename: string;
                    sourceInfo: {
                        duration?: number;
                        size: number;
                    }
                }>>; progress: number;
            },
            userIconUrl: (info: VideoInfo) => Promise<{ id: string; url: string | null } | undefined>,
            option?: {
                errorGet?: (errorCode: string) => void;
            }
        ) {
        const info = infodatas.find(info => info.id === videoId);
        if (info) { // ここが存在する場合、100%情報とソースが揃っている状態です。
            return { info, usericonUrls: (await Promise.allSettled(info.videoInfos.map(info => userIconUrl(info)))).map(result => result.status === "fulfilled" ? result.value : undefined) };
        } else {
            const status = downloadStatus.find(status => status.id === videoId);
            if (status === undefined) {
                const status = statusformat();
                downloadStatus.push(status);
                function downloadStatusDelete(this: SourceManager) {
                    const inde = downloadStatus.findIndex(status => status.id === videoId);
                    if (inde !== -1) downloadStatus.splice(inde, 1);
                }
                function register(this: SourceManager, status: DownloadStats) {
                    let valid = true;
                    /** ここでは取得されたソース情報の内容を巡回し、ソースと一致するものを検索します。もし一致しない場合、infodataに登録したり、ダウンロードステータスを削除したりしません。理由は、まだ実行中である可能性があるからです。もし実行が完了している場合、すべてが一致したり、エラーによってすでにダウンロードステータスが削除されています。 */
                    for (let i = 1; i <= status.infos.length; i++) if (status.sources.find(source => source.number === i) === undefined) valid = false;
                    if (!valid) return;
                    infodatas.push({
                        id: videoId,
                        videoInfos: status.infos,
                        sourceInfos: (() => {
                            const infodatas: { sourceGetTimestamp: number; infoGetTimestamp: number; filename: string; duration?: number; size: number; }[] = [];
                            for (const source of status.sources) {
                                if (source.source === null) continue;
                                infodatas.push({ sourceGetTimestamp: Date.now(), infoGetTimestamp: Date.now(), filename: source.source.filename, duration: source.source.sourceInfo.duration, size: source.source.sourceInfo.size });
                            }
                            return infodatas;
                        })(),
                        musicBrainzs: []
                    })
                    downloadStatusDelete.bind(this)();
                    this.rjsonf.saveJSON(this.json);
                }
                status.infowaitfuncs.then(infos => {
                    if (sourceformat === undefined) return downloadStatusDelete.bind(this)();
                    if (downloadStatus.find(status => status.id === videoId) === undefined) return; // エラーなどで削除された場合
                    if (infos.status === "error") {
                        console.log("情報取得関数でエラー。");
                        option?.errorGet?.("3-2");
                        infos.reject.errorCode.forEach(code => { option?.errorGet?.(code); })
                        downloadStatusDelete.bind(this)();
                        return;
                    }
                    status.infos = infos.resolve;
                    for (let i = 1; i <= infos.resolve.length; i++) {
                        const sourcewait = sourceformat(i);
                        status.sourcewaitfuncs.push(sourcewait);
                        sourcewait.func.then(source => {
                            if (downloadStatus.find(status => status.id === videoId) === undefined) return; // エラーなどで削除された場合
                            if (source.status === "error") {
                                console.log("動画取得関数でエラー。しかし取得は続行されます。");
                                option?.errorGet?.("3-4");
                                source.reject.errorCode.forEach(code => { option?.errorGet?.(code); });
                                status.sources.push({ number: sourcewait.number, source: null });
                                register.bind(this)(status);
                                return;
                            }
                            status.sources.push({ number: sourcewait.number, source: source.resolve });
                            register.bind(this)(status);
                        }).catch(e => {
                        })
                    }
                })
                return fastreturn.bind(this)(status);
            } else {
                return fastreturn.bind(this)(status);
            }
            async function fastreturn(this: SourceManager, status: DownloadStats): Promise<{
                info: {
                    id: string;
                    videoInfos: VideoInfo[];
                    sourceInfos: (SourceInfo | null)[];
                    musicBrainzs: {
                        releaseUuid?: string;
                        recordingUuid?: string;
                    }[];
                };
                usericonUrls: ({ id: string, url: string | null } | undefined)[]
                progress?: number;
            } | undefined> {
                if (fast) {
                    const info = infodatas.find(info => info.id === videoId);
                    if (info) return { info, usericonUrls: (await Promise.allSettled(info.videoInfos.map(info => userIconUrl(info)))).map(result => result.status === "fulfilled" ? result.value : undefined) }
                    else {
                        const result = await status.infowaitfuncs;
                        if (result.status === "error") {
                            option?.errorGet?.("3-2");
                            result.reject.errorCode.forEach(code => { option?.errorGet?.(code); })
                            return;
                        }
                        return { info: { id: videoId, videoInfos: result.resolve, sourceInfos: [], musicBrainzs: [] }, usericonUrls: (await Promise.allSettled(result.resolve.map(info => userIconUrl(info)))).map(result => result.status === "fulfilled" ? result.value : undefined), progress: (status.sourcewaitfuncs.map(waitfuncs => waitfuncs.progress).reduce((pre, cur) => pre + cur, 0) / status.sourcewaitfuncs.length) }
                    }
                }
                await status.infowaitfuncs;
                await Promise.allSettled(status.sourcewaitfuncs.map(waitfunc => waitfunc.func));
                const info = infodatas.find(info => info.id === videoId);
                if (info) {
                    return { info, usericonUrls: (await Promise.allSettled(info.videoInfos.map(info => userIconUrl(info)))).map(result => result.status === "fulfilled" ? result.value : undefined) }
                } else {
                    option?.errorGet?.("3-1");
                }
            }
        }
    }

    /**
     * YouTubeの情報やソースの状況を取得します。
     * 
     * 引数2番目にtrueを入れると、ソースが取得されていなくても返答をします。falseや空にするとソースが取得されるまで待機することになります。
     */
    async getYouTube(videoId: string, fast?: boolean, option?: { errorGet?: (errorCode: string) => void }) {
        const infodatas = this.json.youtube;
        const downloadStatus = this.downloadStatus.youtube;
        return await this.getSingleBase<YouTubeInfo, YouTubeInfoData[], DownloadStatusOfYouTube>(videoId, infodatas, downloadStatus, fast || false, () => {
            return {
                id: videoId,
                type: "single",
                infowaitfunc: youtubeInfoGet(videoId),
                sourcewaitfunc: youtubeSourceGet(videoId, progress => {
                    const status = downloadStatus.find(status => status.id === videoId);
                    if (status) status.progress = progress;
                }),
                progress: 0
            }
        }, async info => (await this.jsonmanager.userIcons.getYouTube.bind(this.jsonmanager.userIcons)(info.channelId)).info, {
            errorGet(errorCode) {
                option?.errorGet?.(errorCode)
            },
        })
    }
    /**
     * ニコニコ動画の情報やソースの状況を取得します。
     * 
     * 引数2番目にtrueを入れると、ソースが取得されていなくても返答をします。falseや空にするとソースが取得されるまで待機することになります。
     */
    async getniconico(id: string, fast?: boolean, option?: { errorGet?: (errorCode: string) => void }) {
        const infodatas = this.json.niconico;
        const downloadStatus = this.downloadStatus.niconico;
        return await this.getSingleBase<niconicoInfo, niconicoInfoData[], DownloadStatusOfniconico>(id, infodatas, downloadStatus, fast || false, () => {
            return {
                id: id,
                type: "single",
                infowaitfunc: niconicoInfoGet(id),
                sourcewaitfunc: niconicoSourceGet(id, progress => {
                    const status = downloadStatus.find(status => status.id === id);
                    if (status) status.progress = progress;
                }),
                progress: 0
            }
        }, async info => {
            if (info.channelId) return (await this.jsonmanager.userIcons.getniconico.bind(this.jsonmanager.userIcons)(info.channelId)).info
            if (info.channelName) return (await this.jsonmanager.userIcons.getniconico.bind(this.jsonmanager.userIcons)(info.channelName)).info
            return null
        }, {
            errorGet(errorCode) {
                option?.errorGet?.(errorCode)
            },
        })
    }
    /**
     * SoundCloudの情報やソースの状況を取得します。
     * 
     * 引数2番目にtrueを入れると、ソースが取得されていなくても返答をします。falseや空にするとソースが取得されるまで待機することになります。
     */
    async getSoundCloud(id: string, fast?: boolean, option?: { errorGet?: (errorCode: string) => void }) {
        const infodatas = this.json.soundcloud;
        const downloadStatus = this.downloadStatus.soundcloud;
        return await this.getSingleBase<SoundCloudInfo, SoundCloudInfoData[], DownloadStatusOfSoundCloud>(id, infodatas, downloadStatus, fast || false, () => {
            return {
                id: id,
                type: "single",
                infowaitfunc: soundcloudInfoGet(id),
                sourcewaitfunc: soundcloudSourceGet(id, progress => {
                    const status = downloadStatus.find(status => status.id === id);
                    if (status) status.progress = progress;
                }),
                progress: 0
            }
        }, async info => (await this.jsonmanager.userIcons.getSoundCloud.bind(this.jsonmanager.userIcons)(info.userId)).info, {
            errorGet(errorCode) {
                option?.errorGet?.(errorCode)
            },
        })
    }
    /**
     * Twitterの情報やソースの状況を取得します。
     * 
     * 引数2番目にtrueを入れると、ソースが取得されていなくても返答をします。falseや空にするとソースが取得されるまで待機することになります。
     */
    async getTwitter(id: string, fast?: boolean, option?: { errorGet?: (errorCode: string) => void }) {
        const infodatas = this.json.twitter;
        const downloadStatus = this.downloadStatus.twitter;
        return await this.getMultiBase<TwitterInfo, TwitterInfoData[], DownloadStatusOfTwitter>(id,
            infodatas,
            downloadStatus,
            fast || false,
            () => {
                return {
                    id: id,
                    type: "multi",
                    infos: [],
                    sources: [],
                    infowaitfuncs: twitterInfoGet(id),
                    sourcewaitfuncs: []
                }
            },
            itemNumber => {
                return {
                    number: itemNumber,
                    func: twitterSourceGet(id, itemNumber, progress => {
                        const status = downloadStatus.find(status => status.id === id);
                        if (status) {
                            const waitfunc = status.sourcewaitfuncs.find(waitfunc => waitfunc.number === itemNumber);
                            if (waitfunc) waitfunc.progress = progress
                        }
                    }),
                    progress: 0
                }
            }, async info => {
                if (info.userId) return { id: info.userId, url: (await this.jsonmanager.userIcons.getTwitter.bind(this.jsonmanager.userIcons)(info.userNumId, { userId: info.userId })).info };
                return undefined;
            }, {
            errorGet(errorCode) {
                option?.errorGet?.(errorCode)
            },
        });
    }
}

interface DownloadStatusOfYouTube {
    id: string;
    type: "single";
    info?: YouTubeInfo;
    source?: {
        filename: string;
        sourceInfo: {
            duration?: number;
            size: number;
        }
    };
    infowaitfunc: Promise<statusErrorCodeDbmgrFormat<YouTubeInfo>>;
    sourcewaitfunc: Promise<statusErrorCodeDbmgrFormat<{
        filename: string;
        sourceInfo: {
            duration?: number;
            size: number;
        }
    }>>;
    progress: number;
}

interface DownloadStatusOfniconico {
    id: string;
    type: "single";
    info?: niconicoInfo;
    source?: {
        filename: string;
        sourceInfo: {
            duration?: number;
            size: number;
        }
    };
    infowaitfunc: Promise<statusErrorCodeDbmgrFormat<niconicoInfo>>;
    sourcewaitfunc: Promise<statusErrorCodeDbmgrFormat<{
        filename: string;
        sourceInfo: {
            duration?: number;
            size: number;
        }
    }>>;
    progress: number;
}

interface DownloadStatusOfTwitter {
    id: string;
    type: "multi";
    infos: TwitterInfo[];
    sources: {
        number: number;
        source: {
            filename: string;
            sourceInfo: {
                duration?: number;
                size: number;
            }
        };
    }[];
    infowaitfuncs: Promise<statusErrorCodeDbmgrFormat<TwitterInfo[]>>;
    sourcewaitfuncs: {
        number: number;
        func: Promise<statusErrorCodeDbmgrFormat<{
            filename: string;
            sourceInfo: {
                duration?: number;
                size: number;
            }
        }>>; progress: number;
    }[];
}

interface DownloadStatusOfSoundCloud {
    id: string;
    type: "single";
    info?: SoundCloudInfo;
    source?: {
        filename: string;
        sourceInfo: {
            duration?: number;
            size: number;
        }
    };
    infowaitfunc: Promise<statusErrorCodeDbmgrFormat<SoundCloudInfo>>;
    sourcewaitfunc: Promise<statusErrorCodeDbmgrFormat<{
        filename: string;
        sourceInfo: {
            duration?: number;
            size: number;
        }
    }>>;
    progress: number;
}
