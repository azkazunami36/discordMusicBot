import { ipcRenderer } from "electron";
import { PitchShift } from "tone";

import { Download, Upload } from "./interface.js";

const context = new AudioContext();

const player: {
    [id: string]: {
        sources: {
            id: string;
            source: AudioBufferSourceNode;
            audioBuffer: AudioBuffer;
            gain: GainNode;
            pitchShift: PitchShift;
            /** AudioContextから見てこの素材の始まった位置です。 */
            playStartPoint: number;
            /** AudioContextから見てこの素材の止まった位置です。 */
            playStopPoint: number;
            /** この素材の再生開始位置です。 */
            playtime: number;
            playStarted: boolean;
            ended: boolean;
        }[];
        output: GainNode;
        dest: MediaStreamAudioDestinationNode;
        recorder: MediaRecorder;
        /**
         * チャンク送信の順序を保証するための直列化チェーン
         */
        sendChain: Promise<void>;
        stopping?: boolean;
        finalDataDone?: Promise<void>;
        _resolveFinal?: () => void;
    }
} = {};

function cleanUp(id: string) {
    try { player[id].recorder.stop(); } catch { }
    try { player[id].output.disconnect(); } catch { }
    for (const source of player[id].sources) {
        try { source.source.disconnect(); } catch { }
    }
    try { player[id].dest.stream.getTracks().forEach(t => t.stop()); } catch { }

    player[id].recorder.ondataavailable = null!;
    player[id].recorder.onstop = null!;
    player[id].recorder.onerror = null!;

    delete player[id];
}

function createSource(fileId: string, playerId: string, audioBuffer: AudioBuffer) {
    const source = context.createBufferSource();
    source.buffer = audioBuffer;
    const gain = context.createGain();
    const pitchShift = new PitchShift();
    source.connect(pitchShift.input as unknown as AudioNode);
    pitchShift.connect(gain);
    gain.connect(player[playerId].output);
    player[playerId].sources.push({
        id: fileId,
        source,
        audioBuffer,
        gain,
        pitchShift,
        playStartPoint: 0,
        playStopPoint: 0,
        playtime: 0,
        ended: false,
        playStarted: false
    });
    source.onended = () => {
        const sourceIndexNum = player[playerId].sources.findIndex(src => src.id === fileId);
        const source = player[playerId].sources[sourceIndexNum];
        if (source && !source.ended) {
            source.ended = true;
            source.playStopPoint = context.currentTime;
            ipcRenderer.send("sourceEnded-" + playerId + "-" + fileId);
        }
    };
}

function removeSource(fileId: string, playerId: string) {
    const sourceIndexNum = player[playerId].sources.findIndex(src => src.id === fileId);
    try { player[playerId].sources[sourceIndexNum].source.stop(); } catch { }
    try { player[playerId].sources[sourceIndexNum].source.disconnect(); } catch { }
    try { player[playerId].sources[sourceIndexNum].gain.disconnect(); } catch { }
    try { player[playerId].sources[sourceIndexNum].pitchShift.disconnect(); } catch { }

    try { (player[playerId].sources[sourceIndexNum].pitchShift as any).dispose?.(); } catch { }

    player[playerId].sources.splice(sourceIndexNum, 1);
}

window.addEventListener("DOMContentLoaded", () => {
    ipcRenderer.on("post", async (ignore, { id, data }) => {
        /** 要求です。 */
        const request: Upload = data;
        /** 返信です。 */
        let response: Download = { status: false };
        switch (request.type) {
            case "streamCreate": {
                if (!request.playerId) {
                    response.error = new Error("プレイヤーのIDが入力されていません。");
                    break;
                }
                if (player[request.playerId]) {
                    response.error = new Error("すでにこのIDは使用されています。ストリームを破棄すると利用が可能です。");
                    break;
                }
                const gain = context.createGain();
                const dest = context.createMediaStreamDestination();
                gain.connect(dest);
                const recorder = new MediaRecorder(dest.stream, { mimeType: "audio/ogg; codecs=opus" });
                player[request.playerId] = {
                    sources: [],
                    output: gain,
                    dest: dest,
                    recorder: recorder,
                    sendChain: Promise.resolve(),
                };
                response.status = true;
                break;
            }
            case "streamReady": {
                if (!request.playerId) {
                    response.error = new Error("プレイヤーのIDが入力されていません。");
                    break;
                }
                if (!player[request.playerId]) {
                    response.error = new Error("プレイヤーが見つかりませんでした。");
                    break;
                }
                player[request.playerId].recorder.ondataavailable = (event) => {
                    const p = player[request.playerId];
                    if (!p) return;
                    if (!event.data || event.data.size === 0) return;

                    // 直列化：前の送信が終わってから次を処理する
                    p.sendChain = p.sendChain
                        .then(async () => {
                            const arrayBuffer = await event.data.arrayBuffer();
                            const chunk = Buffer.from(arrayBuffer);
                            ipcRenderer.send("stream-" + request.playerId, chunk);
                        })
                        .finally(() => {
                            // 停止処理中なら、最後の data を送信し終えた合図を出す
                            if (p.stopping && p._resolveFinal) {
                                p._resolveFinal();
                                p._resolveFinal = undefined;
                            }
                        })
                        .catch((err) => {
                            // エラーは main 側へ通知（チェーンを切らさない）
                            ipcRenderer.send("stream-error-" + request.playerId, err);
                        });
                };
                player[request.playerId].recorder.onstop = () => {
                    const p = player[request.playerId];
                    if (!p) return;

                    const waitFinal = p.finalDataDone ?? Promise.resolve();
                    Promise.all([p.sendChain, waitFinal])
                        .finally(() => {
                            ipcRenderer.send("stream-end-" + request.playerId);
                            cleanUp(request.playerId);
                        });
                };
                player[request.playerId].recorder.onerror = (event) => {
                    ipcRenderer.send("stream-error-" + request.playerId, event.error);
                    cleanUp(request.playerId);
                }
                player[request.playerId].recorder.start(50);
                response.status = true;
                break;
            }
            case "streamEnd": {
                if (!request.playerId) {
                    response.error = new Error("プレイヤーのIDが入力されていません。");
                    break;
                }
                const p = player[request.playerId];
                if (!p) {
                    // すでに破棄済み＝停止済み
                    response.status = true;
                    break;
                }
                if (p.recorder.state === "inactive" || p.stopping) {
                    response.status = true;
                    break;
                }

                p.stopping = true;
                p.finalDataDone = new Promise<void>((resolve) => { p._resolveFinal = resolve; });
                p.recorder.stop();
                response.status = true;
                break;
            }
            case "sourceSet": {
                if (!request.playerId) {
                    response.error = new Error("プレイヤーのIDが入力されていません。");
                    break;
                }
                if (!player[request.playerId]) {
                    response.error = new Error("プレイヤーが見つかりませんでした。");
                    break;
                }
                if (!request.fileId) {
                    response.error = new Error("ファイルのIDが入力されていません。");
                    break;
                }
                if (!request.buffer) {
                    response.error = new Error("ファイルが存在しません。");
                    break;
                }
                if (player[request.playerId].sources.find(source => source.id === request.fileId)) {
                    response.error = new Error("すでにファイルがセットされています。");
                    break;
                }
                createSource(request.fileId, request.playerId, await context.decodeAudioData(request.buffer));
                response.status = true;
                break;
            }
            case "sourceRemove": {
                if (!request.playerId) {
                    response.error = new Error("プレイヤーのIDが入力されていません。");
                    break;
                }
                if (!player[request.playerId]) {
                    response.error = new Error("プレイヤーが見つかりませんでした。");
                    break;
                }
                if (!request.fileId) {
                    response.error = new Error("ファイルのIDが入力されていません。");
                    break;
                }
                if (!player[request.playerId].sources.find(source => source.id === request.fileId)) {
                    response.error = new Error("ファイルがセットされていません。");
                    break;
                }
                removeSource(request.fileId, request.playerId)
                response.status = true;
                break;
            }
            case "sourceConfig": {
                if (!request.playerId) {
                    response.error = new Error("プレイヤーのIDが入力されていません。");
                    break;
                }
                if (!player[request.playerId]) {
                    response.error = new Error("プレイヤーが見つかりませんでした。");
                    break;
                }
                if (!request.fileId) {
                    response.error = new Error("ファイルのIDが入力されていません。");
                    break;
                }
                if (!player[request.playerId].sources.find(source => source.id === request.fileId)) {
                    response.error = new Error("ファイルがセットされていません。");
                    break;
                }
                let sourceIndexNum = player[request.playerId].sources.findIndex(src => src.id === request.fileId);
                if (request.play === true && player[request.playerId].sources[sourceIndexNum].ended || request.playtime !== undefined) {
                    const audioBuffer = player[request.playerId].sources[sourceIndexNum].audioBuffer;
                    removeSource(request.fileId, request.playerId);
                    createSource(request.fileId, request.playerId, audioBuffer);
                    sourceIndexNum = player[request.playerId].sources.findIndex(src => src.id === request.fileId);
                }
                if (request.playtime !== undefined) {
                    player[request.playerId].sources[sourceIndexNum].playtime = request.playtime;
                }
                if (request.play === true && !player[request.playerId].sources[sourceIndexNum].playStarted || request.playtime !== undefined) {
                    player[request.playerId].sources[sourceIndexNum].source.start(0, player[request.playerId].sources[sourceIndexNum].playtime);
                    player[request.playerId].sources[sourceIndexNum].playStartPoint = context.currentTime;
                    player[request.playerId].sources[sourceIndexNum].playStarted = true;
                }
                if (!request.play) {
                    player[request.playerId].sources[sourceIndexNum].ended = true;
                    player[request.playerId].sources[sourceIndexNum].playStopPoint = context.currentTime;
                    player[request.playerId].sources[sourceIndexNum].source.stop(0);
                }
                if (request.volume) player[request.playerId].sources[sourceIndexNum].gain.gain.value = request.volume;
                if (request.speed) player[request.playerId].sources[sourceIndexNum].source.playbackRate.value = request.speed;
                if (request.pitch) player[request.playerId].sources[sourceIndexNum].pitchShift.pitch = request.pitch;
                response.status = true;
                break;
            }
            case "sourceStatus": {
                if (!request.playerId) {
                    response.error = new Error("プレイヤーのIDが入力されていません。");
                    break;
                }
                if (!player[request.playerId]) {
                    response.error = new Error("プレイヤーが見つかりませんでした。");
                    break;
                }
                if (!request.fileId) {
                    response.error = new Error("ファイルのIDが入力されていません。");
                    break;
                }
                if (!player[request.playerId].sources.find(source => source.id === request.fileId)) {
                    response.error = new Error("ファイルがセットされていません。");
                    break;
                }
                const sourceIndexNum = player[request.playerId].sources.findIndex(src => src.id === request.fileId);
                response = {
                    type: "sourceStatus",
                    playing: player[request.playerId].sources[sourceIndexNum].playStarted && !player[request.playerId].sources[sourceIndexNum].ended,
                    volume: player[request.playerId].sources[sourceIndexNum].gain.gain.value,
                    playtime: (player[request.playerId].sources[sourceIndexNum].playStarted && !player[request.playerId].sources[sourceIndexNum].ended) ?
                        (player[request.playerId].sources[sourceIndexNum].playStartPoint !== 0 ?
                            context.currentTime
                            - player[request.playerId].sources[sourceIndexNum].playStartPoint
                            + player[request.playerId].sources[sourceIndexNum].playtime
                            * player[request.playerId].sources[sourceIndexNum].source.playbackRate.value
                            : 0)
                        : (player[request.playerId].sources[sourceIndexNum].playStartPoint !== 0 ?
                            player[request.playerId].sources[sourceIndexNum].playStopPoint
                            - player[request.playerId].sources[sourceIndexNum].playStartPoint
                            + player[request.playerId].sources[sourceIndexNum].playtime
                            * player[request.playerId].sources[sourceIndexNum].source.playbackRate.value
                            : 0),
                    pitch: player[request.playerId].sources[sourceIndexNum].pitchShift.pitch,
                    speed: player[request.playerId].sources[sourceIndexNum].source.playbackRate.value,
                    status: true
                }
                break;
            }
            default: {
                response.error = new Error("リクエストの種類を解釈できませんでした。");
                break;
            }
        }
        ipcRenderer.send("post-" + id, response);
    });

    ipcRenderer.send("preload-ready");
});
