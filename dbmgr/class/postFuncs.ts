import express from "express";
import { Server } from "http";

import { MusicLibraryJSON } from "../interface.js";
import { SourceManager } from "./sourceManager.js";

/**
 * Postリクエストの処理内容です。 
 */
export async function post(req: express.Request, res: express.Response, json: MusicLibraryJSON, sourcemanager: SourceManager, server: Server) {
    function error400() {
        res.status(400);
        res.end();
        return undefined;
    }
    const url = (() => {
        try {
            return new URL("http://localhost" + req.originalUrl);
        } catch { }
    })();
    if (!url) {
        console.log("URLとして判定されないURLがPOSTから送られました。", req.originalUrl)
        return error400();
    }
    const params = url.searchParams;
    const splitedPath: (string | undefined)[] = url.pathname.split("/");

}
