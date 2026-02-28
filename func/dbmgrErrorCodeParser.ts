const このエラーコードのみでは原因特定不可能 = "設計上このエラーコードのみでは原因の特定が不可能です。他のエラーコードを参考にしてください(通常このエラーコードが含まれている場合、他の参考になるエラーコードが含まれている場合が多い。しかし、他の参考になるエラーコードがない場合にこのエラーコードがメインで利用される場合がある)。";

export interface rejectDbmgrErrorCodeFormat {
    /** エラーコードです。不明な場合は0番台、そうでない場合は適切なエラーコードを入れてください。 */
    errorCode: string[];
    /** 生のエラーメッセージです。入れなくても構いません。 */
    message: string;
}
export type statusErrorCodeDbmgrFormat<T> = {
    status: "success",
    resolve: T
} | {
    status: "error",
    reject: rejectDbmgrErrorCodeFormat
}

/**
 * - 0番台: defaultに渡される不明なエラー。ログを要チェック。
 * - 1番台: GET内AudioResponse
 * - 2番台: GET
 * - 3番台: SourceManagerのGet関数内
 * - 4番台: このエラーコード検証プロセス内部でのエラー。
 */
export function dbmgrErrorCodeParser(errorCode: string): {
    title: string;
    description: string;
    devDescription: string;
} {
    switch (errorCode) {
        case "1-1": return {
            title: "情報または音声の取得に失敗",
            description: "音声や情報を取得できなかったか、存在しない番号の動画を選択しています。",
            devDescription: "SourceInfo関数が取得できませんでした。SourceManagerが音声や情報を取得できなかったか、存在しない番号の動画を選択しています。" + このエラーコードのみでは原因特定不可能
        }
        case "1-2": return {
            title: "botの所有する音声にアクセス失敗",
            description: "通常なら存在するはずの音声データが存在しませんでした。放置すると修復される可能性がありますが、取得元にデータが存在しなかったり、どこにも音声データの元がない場合、このエラーは解消することができません。",
            devDescription: "SourceManagerの指定するパス先にデータが存在しませんでした。通常致命的です。理由は、音声データが何らかの理由で削除されているか、パスが変更されている、JSONと情報が一致しないためです。これの解消方法は手動でデータを捜索するか、現在のフォルダの設置状況や権限状況などのチェックを行う必要があります。"
        }
        case "2-1": return {
            title: "有効な情報を含むJSONデータの返答に失敗",
            description: "JSONをリクエストされましたが、正しくJSONを返すことができませんでした。原因は不明です。",
            devDescription: "GET関数内でJSONを返答しようとしましたが、返答するためのJSONに不備がありました。原因は多岐にわたります。" + このエラーコードのみでは原因特定不可能
        }
        case "2-2": return {
            title: "未実装のリクエスト",
            description: "この要求はまだ実装されていないためエラーです。",
            devDescription: "GETの未実装コードにアクセスされました。"
        }
        case "2-3": return {
            title: "正しくないURLまたは文字列",
            description: "解析を試みましたが、何もソースを得られませんでした。",
            devDescription: "URLや文字列の解析をする関数は何も見つけることなく返答したため、処理が中断されました。"
        }
        case "2-4": return {
            title: "URLの解析に失敗",
            description: "URLを解析しましたが、IDを取得することができませんでした。",
            devDescription: "URLが正しくないようです。または非対応なURLが入力されました。もしかすると対応する必要のあるURLかもしれません。"
        }
        case "3-1": return {
            title: "このソースは存在しません",
            description: "このソースは取得することができないソースのようです。",
            devDescription: "現在エラー作成中段階であり、具体的なエラー内容が不明です。" + このエラーコードのみでは原因特定不可能
        }
        case "3-2": return {
            title: "情報の取得に失敗",
            description: "情報の取得中にエラーが発生しました。原因は不明です。",
            devDescription: "情報の取得に失敗しました。" + このエラーコードのみでは原因特定不可能
        }
        case "3-3": return {
            title: "音声の取得に失敗",
            description: "音声の取得中にエラーが発生しました。原因は不明です。",
            devDescription: "音声の取得に失敗しました。" + このエラーコードのみでは原因特定不可能
        }
        case "3-4": return {
            title: "音声の取得に失敗",
            description: "音声の取得中にエラーが発生しました。原因は不明です。",
            devDescription: "マルチ音声取得関数内で音声の取得に失敗しました。非対応ソースなどが含まれている可能性があり、重大ではない可能性もあります。" + このエラーコードのみでは原因特定不可能
        }
        case "ytdlp-1": return {
            title: "利用できないコンテンツ",
            description: "この動画は利用できません。他のURLをお試しください。",
            devDescription: "利用できない動画IDにアクセスされました。対処の必要はありません。"
        }
        case "ytdlp-2": return {
            title: "ytdlpシステムの内部警告",
            description: "このエラーは無視することができます。",
            devDescription: "ytdlpが外部javascriptランタイムを求めていますが、見つけることができませんでした。インストールの際はDenoがおすすめです。https://github.com/yt-dlp/yt-dlp/wiki/EJS にアクセスするとヒントを得ることができます。致命的なエラーではありません。"
        }
        case "ytdlp-3": return {
            title: "ytdlpシステムの不具合",
            description: "何らかの理由でytdlpシステムは終了しました。",
            devDescription: "ytdlpが情報を返すことなく終了しました。" + このエラーコードのみでは原因特定不可能
        }
        case "ytdlp-4": return {
            title: "ytdlpシステムのソース取得エラー",
            description: "ytdlpがソースをダウンロードできませんでした。",
            devDescription: "ytdlpがダウンロードしたと思われるソースをbot内で見つけることができず、返答ができません。" + このエラーコードのみでは原因特定不可能
        }
        case "ytdlp-10": return {
            title: "ytdlpシステムがbot検知ブロック",
            description: "ytdlpがbot検知され、ブロックされました。音声取得ができない可能性があります。時間を置くと解決する恐れがあります。",
            devDescription: "botでないことを証明するためにCookieが必要です。再試行システムがある場合は解決できますが、そうでない場合はこのまま情報取得に失敗する恐れがあります。場合によってはシステム側で取得を一時的にキューに移動するなどして、アクセスを冷ます必要があります。"
        }
        case "ytdlp-12": return {
            title: "音声が存在しないコンテンツ",
            description: "このポストには音声が存在しません。",
            devDescription: "yt-dlpは動画の存在しないTwitterコンテンツをダウンロードしようとしました。"
        }
        case "ffmpeg-1": return {
            title: "非対応の音声",
            description: "無効な動画でダウンロードに失敗したか、音声の含まれていない動画などが指定されたおそれがあります。",
            devDescription: "FFmpegが動画を変換できませんでした。まれにロジックミスの可能性もあるので、目を通しておくべきかもしれません。"
        }
        default: return {
            title: "不明なエラー",
            description: "特定の不可能なエラーコード「" + ((errorCode.length >= 10) ? errorCode.slice(0, 10) + "..." : errorCode) + "」が渡されました。予想外のエラーや内部エラーである可能性が高いです。",
            devDescription: "通常渡されるはずのないエラーコードを受け付けたということになります。または、エラーコードの実装ミスです。ログにヒントが載っている場合もあります。" + このエラーコードのみでは原因特定不可能
        }
    }
}

/**
 * エラーコードをメインとサブに分けます。メインはユーザーに影響を与えるエラーです。サブは原因の載っていない、しかしエラーの雰囲気を掴むために必要なエラーです。その他はユーザーに見せても参考にならない可能性が高いエラーです。しかしトラブルシューティングのためにユーザーに送信する必要があります。
 */
export function dbmgrErrorCodePriorityCheck(errorCodes: string[]): {
    main: string[];
    sub: string[];
    other: string[];
} {
    const main: string[] = [];
    const sub: string[] = [];
    const other: string[] = [];
    errorCodes.forEach(string => {
        const mainStr = ["1-2", "2-2", "ytdlp-1", "ytdlp-10", "ytdlp-8", "ffmpeg-1", "ytdlp-11"];
        const subStr = ["ytdlp-4", "3-3", "3-4", "1-1", "2-1", "3-1", "3-2", "ytdlp-5", "ytdlp-6", "ytdlp-7", "ytdlp-9", "5-1", "ytdlp-4"];
        if (mainStr.includes(string)) main.push(string);
        else if (subStr.includes(string)) sub.push(string)
        else other.push(string);
    });
    return { main, sub, other }
}

export function stringToErrorCode(string: string) {
    try {
        if (string.match(": Video unavailable"))
            return "ytdlp-1";

        if (string.match("No supported JavaScript runtime could be found. Only deno is enabled by default"))
            return "ytdlp-2";

        if (string.match("yt-dlpが予期しない理由で終了しました。終了コード:"))
            return "ytdlp-3";

        if (string.match("yt-dlpでダウンロードしたファイルを見つけられませんでした。"))
            return "ytdlp-4";

        if (string.match("Failed to download m3u8 information: HTTP Error 403: Forbidden"))
            return "ytdlp-5";

        if (string.match("Precondition check failed."))
            return "ytdlp-6";

        if (string.match("HTTP Error 400: Bad Request. Retrying"))
            return "ytdlp-7";

        if (string.match("HTTP Error 400: Bad Request"))
            return "ytdlp-8";

        if (string.match("No title found in player responses; falling back to title from initial data. Other metadata may also be missing"))
            return "ytdlp-9";

        if (string.match("Sign in to confirm you’re not a bot."))
            return "ytdlp-10";

        if (string.match("unable to download video data: HTTP Error 403: Forbidden"))
            return "ytdlp-11";

        if (string.match("No video could be found in this tweet"))
            return "ytdlp-12";

        if (string.match("Error: Status code 404"))
            return "5-1";

        if (string.match("FFmpegで変換を試みましたが、変換が完了したファイルが存在しませんでした。"))
            return "ffmpeg-1";

        console.log("よくわからない文字列: " + string);
        return "0";
    } catch (e) {
        console.log("エラーコードに変換する関数でエラー。", String(e));
        return "4-1";
    }
}
