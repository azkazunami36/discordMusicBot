import { POSTData } from "../interfaces/POSTData.js";

export async function serverRequest(query: POSTData): Promise<string> {  
    const url = window.location.origin + ":38671?" + new URLSearchParams(query);
    const init: RequestInit = {};
    init.method = "POST";
    const res = await fetch(url, init);
    return await res.text();
}
