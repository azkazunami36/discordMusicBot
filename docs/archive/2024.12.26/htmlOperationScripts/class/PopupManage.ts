export class PopupManage {
    popup: HTMLElement | null;
    popupList: {
        type: "full" | "window";
        element: HTMLElement;
        closed?: () => void;
    }[] = [];
    constructor() {
        this.popup = document.getElementById("popup");
        const popup = this.popup;
        if (popup) {
            const popupWindow = popup.getElementsByClassName("popupWindow")[0];
            if (popupWindow) {
                const closeButton = popupWindow.getElementsByClassName("closeButton")[0];
                closeButton.addEventListener("click", () => {
                    this.close();
                })
                const mainWindowList = popupWindow.getElementsByClassName("mainWindowList")[0];
                if (mainWindowList) for (const node of mainWindowList.childNodes) this.popupList.push({ type: "window", element: node as HTMLElement });
            }
            const popupFull = popup.getElementsByClassName("popupFull")[0];
            if (popupFull) {
                const closeButton = popupFull.getElementsByClassName("closeButton")[0];
                closeButton.addEventListener("click", () => {
                    this.close();
                })
                const mainWindowList = popupFull.getElementsByClassName("mainWindowList")[0];
                if (mainWindowList) for (const node of mainWindowList.childNodes) this.popupList.push({ type: "full", element: node as HTMLElement });
            }
        }
    }
    view(name: string, type: "window" | "full", closed?: () => void) {
        if (this.popup) {
            for (const viewPopup of this.popup.getElementsByClassName("viewPopup"))
                if (viewPopup.classList.contains("viewPopup")) viewPopup.classList.remove("viewPopup");
            let targetElement
            for (const popupData of this.popupList) {
                if (popupData.type === type && popupData.element.id === name) {
                    if (closed !== undefined) popupData.closed = closed;
                    targetElement = popupData.element;
                }
            }
            if (targetElement) {
                targetElement.classList.add("viewPopup");
                this.popup.classList.add(type + "Active");
            }
        }
    }
    close(name?: string, type?: "window" | "full") {
        if (this.popup?.classList.contains("windowActive")) this.popup.classList.remove("windowActive");
        if (this.popup?.classList.contains("fullActive")) this.popup.classList.remove("fullActive");
        if (name !== undefined && type !== undefined) for (const popupData of this.popupList) {
            if (popupData.type === type && popupData.element.id === name) {
                if (popupData.closed !== undefined) {
                    popupData.closed();
                    popupData.closed = undefined;
                }
            }
        } else for (const popupData of this.popupList) {
            if (popupData.closed !== undefined) {
                popupData.closed();
                popupData.closed = undefined;
            }
        }
    }
};
