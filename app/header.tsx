"use client";

function sideBarOpen() {
    const sideBar = document.getElementById("sidebar") as HTMLElement;
    if (sideBar.classList.contains("default")) sideBar.classList.remove("default"); else sideBar.classList.add("default");
}

export default function header() {
    return (
        <header>
            <div className="button sideBarViewChangeButton" onClick={sideBarOpen} >
                <div className="text">
                    <span className="material-symbols-outlined">view_sidebar</span>
                </div>
            </div>
        </header>
    );
}
