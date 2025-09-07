"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
// --- Worklet loader with watchdog ---
let workletLoaded = false;
let workletLoading;
/** 指定ミリ秒でタイムアウトするPromise */
function withTimeout(p, ms, tag = "task") {
    return new Promise((resolve, reject) => {
        const to = setTimeout(() => {
            console.warn(`[preload] ${tag} timeout after ${ms}ms`);
            reject(new Error(`${tag} timeout`));
        }, ms);
        p.then(v => { clearTimeout(to); resolve(v); }, e => { clearTimeout(to); reject(e); });
    });
}
/** AudioWorklet モジュールを必要時に読み込む。失敗時は false を返す（フォールバック動作用） */
async function ensureWorklet(context) {
    if (workletLoaded)
        return true;
    if (workletLoading)
        return workletLoading;
    console.time("[preload] addModule");
    workletLoading = (async () => {
        try {
            const url = new URL("./worklet/rubberband-processor.js", window.location.href).toString();
            console.log("[preload] try addModule:", url);
            await withTimeout(context.audioWorklet.addModule(url), 5000, "audioWorklet.addModule");
            workletLoaded = true;
            console.timeEnd("[preload] addModule");
            console.log("[preload] worklet module loaded OK");
            return true;
        }
        catch (err) {
            console.timeEnd("[preload] addModule");
            console.error("[preload] worklet module load FAILED:", err);
            workletLoaded = false;
            return false;
        }
        finally {
            workletLoading = undefined;
        }
    })();
    return workletLoading;
}
// IIFE
(async () => {
    const context = new AudioContext({ sampleRate: 48000 });
    console.log("[preload] AudioContext created (sr=48000)");
    // Worklet は遅延ロード（ensureWorklet）に変更
    const player = {};
    function cleanUp(id) {
        if (!player[id]) {
            console.log("[preload] cleanUp: already cleaned", id);
            return;
        }
        console.log("[preload] cleanUp:", id);
        try {
            player[id].recorder.stop();
        }
        catch { }
        try {
            player[id].output.disconnect();
        }
        catch { }
        for (const source of player[id].sources) {
            try {
                source.source.disconnect();
            }
            catch { }
        }
        try {
            player[id].dest.stream.getTracks().forEach(t => t.stop());
        }
        catch { }
        player[id].recorder.ondataavailable = null;
        player[id].recorder.onstop = null;
        player[id].recorder.onerror = null;
        delete player[id];
    }
    async function createSource(fileId, playerId, audioBuffer) {
        const source = context.createBufferSource();
        source.buffer = audioBuffer;
        const gain = context.createGain();
        let rubber = null;
        const ok = await ensureWorklet(context);
        if (ok) {
            rubber = new AudioWorkletNode(context, "rubberband-processor", {
                numberOfInputs: 1,
                numberOfOutputs: 1,
                outputChannelCount: [2],
                processorOptions: {
                    assetBase: new URL("./worklet/", window.location.href).toString()
                },
                parameterData: {
                    rate: 1.0,
                    pitch: 0.0,
                    wet: 1.0,
                }
            });
            console.log("[preload] AudioWorkletNode created", rubber);
            // Add listener for messages from the worklet
            rubber.port.onmessage = (msg) => {
                console.log("[worklet]", msg.data);
                electron_1.ipcRenderer.send("worklet-log-" + playerId + "-" + fileId, msg.data);
            };
            source.connect(rubber);
            console.log("[preload] source connected to rubber");
            rubber.connect(gain);
            console.log("[preload] rubber connected to gain");
        }
        else {
            console.warn("[preload] Worklet unavailable — falling back to direct path (no pitch/speed)");
            source.connect(gain);
        }
        gain.connect(player[playerId].output);
        console.log("[preload] gain connected to output");
        player[playerId].sources.push({
            id: fileId,
            source,
            audioBuffer,
            gain,
            rubber,
            playStartPoint: 0,
            playStopPoint: 0,
            playtime: 0,
            pitch: 0,
            speed: 1,
            ended: false,
            playStarted: false
        });
        source.onended = () => {
            const sourceIndexNum = player[playerId].sources.findIndex(src => src.id === fileId);
            const source = player[playerId].sources[sourceIndexNum];
            if (source && !source.ended) {
                source.ended = true;
                source.playStopPoint = context.currentTime;
                electron_1.ipcRenderer.send("sourceEnded-" + playerId + "-" + fileId);
            }
        };
    }
    function removeSource(fileId, playerId) {
        const sourceIndexNum = player[playerId].sources.findIndex(src => src.id === fileId);
        try {
            player[playerId].sources[sourceIndexNum].source.stop();
        }
        catch { }
        try {
            player[playerId].sources[sourceIndexNum].source.disconnect();
        }
        catch { }
        try {
            player[playerId].sources[sourceIndexNum].gain.disconnect();
        }
        catch { }
        try {
            player[playerId].sources[sourceIndexNum].rubber?.disconnect();
        }
        catch { }
        player[playerId].sources.splice(sourceIndexNum, 1);
    }
    window.addEventListener("DOMContentLoaded", () => {
        electron_1.ipcRenderer.on("post", async (ignore, { id, data }) => {
            console.log("[preload] post recv:", id, data?.type);
            /** 要求です。 */
            const request = data;
            /** 返信です。 */
            let response = { status: false };
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
                    const recorder = new MediaRecorder(dest.stream, { mimeType: "audio/webm", audioBitsPerSecond: 128000 });
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
                        if (!p)
                            return;
                        if (!event.data || event.data.size === 0)
                            return;
                        // 直列化：前の送信が終わってから次を処理する
                        p.sendChain = p.sendChain
                            .then(async () => {
                            const arrayBuffer = await event.data.arrayBuffer();
                            const chunk = Buffer.from(arrayBuffer);
                            electron_1.ipcRenderer.send("stream-" + request.playerId, chunk);
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
                            electron_1.ipcRenderer.send("stream-error-" + request.playerId, err);
                        });
                    };
                    player[request.playerId].recorder.onstart = () => console.log("[preload] recorder start", request.playerId);
                    player[request.playerId].recorder.onpause = () => console.log("[preload] recorder pause", request.playerId);
                    player[request.playerId].recorder.onresume = () => console.log("[preload] recorder resume", request.playerId);
                    player[request.playerId].recorder.onstop = () => {
                        const p = player[request.playerId];
                        if (!p)
                            return;
                        const waitFinal = p.finalDataDone ?? Promise.resolve();
                        Promise.all([p.sendChain, waitFinal])
                            .finally(() => {
                            electron_1.ipcRenderer.send("stream-end-" + request.playerId);
                            cleanUp(request.playerId);
                        });
                    };
                    player[request.playerId].recorder.onerror = (event) => {
                        electron_1.ipcRenderer.send("stream-error-" + request.playerId, event.error);
                        cleanUp(request.playerId);
                    };
                    try {
                        player[request.playerId].recorder.start(50);
                        console.log("[preload] recorder.start(50) called");
                    }
                    catch (e) {
                        console.error("[preload] recorder.start failed:", e);
                        response.error = e;
                        break;
                    }
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
                    p.stopping = true;
                    p.finalDataDone = new Promise((resolve) => { p._resolveFinal = resolve; });
                    p.recorder.stop(); // delete & cleanUpが動く。
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
                    await createSource(request.fileId, request.playerId, await context.decodeAudioData(request.buffer));
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
                    removeSource(request.fileId, request.playerId);
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
                        await createSource(request.fileId, request.playerId, audioBuffer);
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
                    if (request.volume)
                        player[request.playerId].sources[sourceIndexNum].gain.gain.value = request.volume;
                    if (request.speed !== undefined) {
                        const rb = player[request.playerId].sources[sourceIndexNum].rubber;
                        if (rb) {
                            rb.parameters.get("rate")?.setValueAtTime(request.speed, context.currentTime);
                        }
                        else {
                            console.warn("[preload] speed requested but worklet not loaded; ignoring");
                        }
                        player[request.playerId].sources[sourceIndexNum].speed = request.speed;
                    }
                    if (request.pitch !== undefined) {
                        const rb = player[request.playerId].sources[sourceIndexNum].rubber;
                        if (rb) {
                            rb.parameters.get("pitch")?.setValueAtTime(request.pitch, context.currentTime);
                        }
                        else {
                            console.warn("[preload] pitch requested but worklet not loaded; ignoring");
                        }
                        player[request.playerId].sources[sourceIndexNum].pitch = request.pitch;
                    }
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
                                (context.currentTime
                                    - player[request.playerId].sources[sourceIndexNum].playStartPoint
                                    + player[request.playerId].sources[sourceIndexNum].playtime)
                                    * player[request.playerId].sources[sourceIndexNum].speed
                                : 0)
                            : (player[request.playerId].sources[sourceIndexNum].playStartPoint !== 0 ?
                                (player[request.playerId].sources[sourceIndexNum].playStopPoint
                                    - player[request.playerId].sources[sourceIndexNum].playStartPoint
                                    + player[request.playerId].sources[sourceIndexNum].playtime)
                                    * player[request.playerId].sources[sourceIndexNum].speed
                                : 0),
                        pitch: player[request.playerId].sources[sourceIndexNum].pitch,
                        speed: player[request.playerId].sources[sourceIndexNum].speed,
                        status: true
                    };
                    break;
                }
                default: {
                    response.error = new Error("リクエストの種類を解釈できませんでした。");
                    break;
                }
            }
            electron_1.ipcRenderer.send("post-" + id, response);
        });
        electron_1.ipcRenderer.send("preload-ready");
    });
})();
