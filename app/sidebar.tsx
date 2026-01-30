"use client";
import { useRouter } from "next/navigation";
import { positionSet } from "./func/positionSet.ts";

class TabManage {
    headerElement: HTMLElement;
    sidebarElement: HTMLElement | null;
    mainElement: HTMLElement | null;
    footerElement: HTMLElement;
    constructor() {
        this.headerElement = document.getElementsByTagName("header")[0];
        this.sidebarElement = document.getElementById("sidebar");
        this.mainElement = document.getElementById("main");
        this.footerElement = document.getElementsByTagName("footer")[0];
        if (this.headerElement && this.sidebarElement && this.mainElement && this.footerElement) {
            const sideBarViewChangeButton = this.headerElement.getElementsByClassName("sideBarViewChangeButton")[0];
            sideBarViewChangeButton.addEventListener("click", () => {
                if (!this.sidebarElement) return;
                if (this.sidebarElement.classList.contains("default")) this.sidebarElement.classList.remove("default"); else this.sidebarElement.classList.add("default");
                const activeSideBarButton = this.sidebarElement.getElementsByClassName("active")[0];
                if (activeSideBarButton) positionSet(activeSideBarButton, this.sidebarElement, 80);
            })
        }
        function getSideButtons(element: HTMLElement) {
            const tabList: { name: string, element: HTMLElement }[] = [];
            for (const childElement of element.getElementsByClassName("tabList"))
                childElement.classList.forEach(className => {
                    if (className.includes("tabName")) tabList.push({ name: className, element: childElement as HTMLElement });
                });
            return tabList;
        }
        if (this.sidebarElement && this.mainElement) {
            const sideBarTabList = getSideButtons(this.sidebarElement);
            const mainTabList = getSideButtons(this.mainElement);
            for (const sideBar of sideBarTabList) for (const mainTab of mainTabList) if (sideBar.name === mainTab.name)
                sideBar.element.addEventListener("click", () => { this.changeWindow(sideBar.element, mainTab.element); });
        }
    }
    private changeWindow(sideBar: HTMLElement, mainTab: HTMLElement) {
        if (this.sidebarElement && this.mainElement) {
            const activeSideBarButton = this.sidebarElement.getElementsByClassName("active")[0];
            const activeMainTab = this.mainElement.getElementsByClassName("active")[0];
            if (activeSideBarButton) activeSideBarButton.classList.remove("active");
            sideBar.classList.add("active");
            positionSet(sideBar, this.sidebarElement, 80);
            if (activeMainTab) activeMainTab.classList.remove("active");
            mainTab.classList.add("active");
        }
    }
}

function set(e: React.MouseEvent<HTMLElement, MouseEvent>) {
    const sideBar = document.getElementById("sidebar") as HTMLElement;
    const element = e.target as HTMLElement;
    let button: HTMLElement | undefined = element;
    for (let i = 0; i < 30; i++) {
        if (button == undefined) break;
        if (button.classList.contains("tabList")) break;
        button = element.parentElement || undefined;
        if (i > 20) button = undefined;
    }
    if (button == undefined) return;
    let name: string | undefined;
    button.classList.forEach((value, key, parent) => {
        if (value.startsWith("tabName-")) name = value.slice(8, value.length);
    });
    const oldActive = sideBar.getElementsByClassName("active")[0];
    if (oldActive) oldActive.classList.remove("active");
    button.classList.add("active");
};


export default function sidebar() {
    const router = useRouter();
    return (
        <section id="sidebar" className="default" onClick={set}>
            <div className="group">
                <div className="groupBody">
                    <div className="input tabList tabName-search" onClick={() => { router.push("/search") }}>
                        <div className="icon">
                            <span className="material-symbols-outlined">search</span>
                        </div>
                        <input type="text" placeholder="検索" />
                    </div>
                    <div className="button tabList tabName-dashboard active" onClick={() => { router.push("/") }}>
                        <div className="icon">
                            <span className="material-symbols-outlined">dashboard</span>
                        </div>
                        <div className="text">ダッシュボード</div>
                    </div>
                    <div className="button tabList tabName-recommend" onClick={() => { router.push("/recommend") }}>
                        <div className="icon">
                            <span className="material-symbols-outlined">kid_star</span>
                        </div>
                        <div className="text">おすすめ</div>
                    </div>
                    <div className="button tabList tabName-history" onClick={() => { router.push("/history") }}>
                        <div className="icon">
                            <span className="material-symbols-outlined">history</span>
                        </div>
                        <div className="text">ヒストリー</div>
                    </div>
                </div>
            </div>
            <div className="group">
                <div className="groupTitle">カテゴリ</div>
                <div className="groupBody">
                    <div className="button tabList tabName-album" onClick={() => { router.push("/album") }}>
                        <div className="icon">
                            <span className="material-symbols-outlined">library_books</span>
                        </div>
                        <div className="text">アルバム</div>
                    </div>
                    <div className="button tabList tabName-artist" onClick={() => { router.push("/artist") }}>
                        <div className="icon">
                            <span className="material-symbols-outlined">music_note</span>
                        </div>
                        <div className="text">アーティスト</div>
                    </div>
                    <div className="button tabList tabName-music" onClick={() => { router.push("/music") }}>
                        <div className="icon">
                            <span className="material-symbols-outlined">artist</span>
                        </div>
                        <div className="text">ミュージック</div>
                    </div>
                    <div className="button tabList tabName-genre" onClick={() => { router.push("/genre") }}>
                        <div className="icon">
                            <span className="material-symbols-outlined">category</span>
                        </div>
                        <div className="text">ジャンル</div>
                    </div>
                    <div className="button tabList tabName-file" onClick={() => { router.push("/file") }}>
                        <div className="icon">
                            <span className="material-symbols-outlined">description</span>
                        </div>
                        <div className="text">ファイル</div>
                    </div>
                </div>
            </div>
            <div className="group">
                <div className="groupTitle">プレイリスト</div>
                <div className="groupBody">
                </div>
            </div>
        </section>
    )
}
