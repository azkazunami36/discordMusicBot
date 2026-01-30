export function naturalSort(a, b) {
    function chunkify(text) {
        const chunks = [];
        let index = 0, chunk = '', isCurrentChunkNumber = false;
        while (index < text.length) {
            const char = text[index];
            const isDigit = char >= '0' && char <= '9';
            if (isDigit !== isCurrentChunkNumber) {
                if (chunk)
                    chunks.push(isCurrentChunkNumber ? parseInt(chunk, 10) : chunk);
                chunk = '';
                isCurrentChunkNumber = isDigit;
            }
            chunk += char;
            index++;
        }
        if (chunk)
            chunks.push(isCurrentChunkNumber ? parseInt(chunk, 10) : chunk);
        return chunks;
    }
    const chunksA = chunkify(a);
    const chunksB = chunkify(b);
    for (let i = 0; i < Math.max(chunksA.length, chunksB.length); i++) {
        if (chunksA[i] === undefined)
            return -1;
        if (chunksB[i] === undefined)
            return 1;
        if (chunksA[i] !== chunksB[i]) {
            return chunksA[i] < chunksB[i] ? -1 : 1;
        }
    }
    return 0;
}
