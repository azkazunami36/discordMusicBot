export function progressBar(percent: number, length: number, full?: number) {
    const write = Math.trunc(((percent < (full !== undefined ? full : 100) ? percent : (full !== undefined ? full : 100)) / (full !== undefined ? full : 100)) * length);
    const black = length - write;
    return "=".repeat(write) + " ".repeat(black);
}
