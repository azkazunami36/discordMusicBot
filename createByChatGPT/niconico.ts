export function parseNicoVideo(input: string): string | undefined {
    const VIDEO_ID_RE = /^(sm|nm|so)[1-9]\d*$/;

    if (VIDEO_ID_RE.test(input)) {
        return input;
    }

    let u: URL;
    try { u = new URL(input); } catch { return undefined; }

    const host = u.hostname.toLowerCase();
    const isNicoHost = /(^|\.)nicovideo\.jp$/.test(host) || host === "nico.ms";
    if (!isNicoHost) return undefined;

    if (host === "nico.ms") {
        const id = u.pathname.slice(1);
        if (VIDEO_ID_RE.test(id)) {
            return id;
        }
        return undefined;
    }

    const m = u.pathname.match(/^\/watch\/((?:sm|nm|so)[1-9]\d*)$/);
    if (m) {
        const id = m[1];
        return id;
    }

    return undefined;
}
