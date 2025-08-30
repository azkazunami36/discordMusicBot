import yts from "yt-search";
import fs from "fs";

/** VideoIDに記録されている情報をキャッシュし、読み込めるようにするものです。 */
export const videoCache = new class VideoMetaCache {
    constructor() {
        if (!fs.existsSync("cache.jsonl")) fs.writeFileSync("cache.jsonl", "");
    }
    async cacheGet(videoId: string) {
        const json: yts.VideoMetadataResult[] = [];
        String(fs.readFileSync("cache.jsonl")).split("\n").forEach(line => { if (line) json.push(JSON.parse(line)) });
        if (!json[0]) json.pop();
        const result = json.find(data => data.videoId == videoId);
        if (result) {
            return result;
        } else {
            try {
                const result = await yts({
                    videoId,
                    hl: "ja",
                    gl: "JP"
                });
                fs.appendFileSync("cache.jsonl", "\n" + JSON.stringify(result));
                return result;
            } catch (e) {
                return undefined;
            }
        }
    }
}
