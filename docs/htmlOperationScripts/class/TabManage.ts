import { positionMath } from "../../scripts/function/PositionMath.js";

export class TabManage {
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
                if (activeSideBarButton) positionMath(activeSideBarButton, this.sidebarElement, 80);
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
            positionMath(sideBar, this.sidebarElement, 80);
            if (activeMainTab) activeMainTab.classList.remove("active");
            mainTab.classList.add("active");
        }
    }
}
