export async function serverRequest(query) {
    const url = window.location.origin + ":38671?" + new URLSearchParams(query);
    const init = {};
    init.method = "POST";
    const res = await fetch(url, init);
    return await res.text();
}
