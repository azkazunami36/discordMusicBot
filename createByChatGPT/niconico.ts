export function parseNicoVideo(input: string): string | undefined {
    const VIDEO_ID_RE = /^(sm|nm|so)[1-9]\d*$/;

    // 1) 直接IDが来た場合は即返す
    if (VIDEO_ID_RE.test(input)) return input;

    // 2) URLでなければ終了
    let u: URL;
    try { u = new URL(input); } catch { return undefined; }

    const host = u.hostname.toLowerCase();

    // 3) ニコ動の正当なホストのみをホワイトリストで許可
    const validHosts = new Set([
        "nicovideo.jp",
        "www.nicovideo.jp",
        "sp.nicovideo.jp",
        "nico.ms",
    ]);
    if (!validHosts.has(host)) return undefined;

    // 4) nico.ms は "/{id}" 形式
    if (host === "nico.ms") {
        const id = u.pathname.slice(1);
        return VIDEO_ID_RE.test(id) ? id : undefined;
    }

    // 5) nicovideo.jp は "/watch/{id}" 形式
    const m = u.pathname.match(/^\/watch\/((?:sm|nm|so)[1-9]\d*)$/);
    return m ? m[1] : undefined;
}
