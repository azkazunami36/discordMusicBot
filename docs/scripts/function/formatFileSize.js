export function formatFileSize(size) {
    if (size >= 1e9) {
        return (size / 1e9).toFixed(1) + ' GB';
    }
    else if (size >= 1e6) {
        return (size / 1e6).toFixed(1) + ' MB';
    }
    else if (size >= 1e3) {
        return (size / 1e3).toFixed(1) + ' KB';
    }
    else {
        return size + ' B';
    }
}
