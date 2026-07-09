import Ffmpeg from "fluent-ffmpeg";

/**
 * FFprobeを実行します。
 * 
 * 注意！エラーが発生するとスローするため、必ずキャッチしてください。
 */
export async function ffprobe(file: string) {
    return new Promise<Ffmpeg.FfprobeData>((res, rej) => {
        Ffmpeg.ffprobe(file, (e, d) => {
            if (e) return rej(e);
            res(d);
        });
    })
}
