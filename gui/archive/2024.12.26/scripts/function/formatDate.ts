interface FormatDateOptions {
    includeSeconds?: boolean;
    includeYear?: boolean;
}

export function formatDate(date: Date, options: FormatDateOptions = {}): string {
    const { includeSeconds = false, includeYear = true } = options;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const isToday = date >= today && date < tomorrow;
    const isYesterday = date >= yesterday && date < today;
    const isTomorrow = date >= tomorrow && date < new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate() + 1);

    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');

    let timeString = `${hours}:${minutes}`;
    if (includeSeconds) {
        timeString += `:${seconds}`;
    }

    if (isToday) {
        return `今日 ${timeString}`;
    } else if (isYesterday) {
        return `昨日 ${timeString}`;
    } else if (isTomorrow) {
        return `明日 ${timeString}`;
    } else {
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        const isDifferentYear = year !== now.getFullYear();
        const shouldIncludeYear = includeYear || isDifferentYear;
        const dateString = shouldIncludeYear ? `${year}/${month}/${day}` : `${month}/${day}`;
        return `${dateString} ${timeString}`;
    }
}
