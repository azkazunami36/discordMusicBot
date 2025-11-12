export class ActiveElement {
    private activeElement: HTMLElement | null = null;
    constructor() {
        addEventListener("click", e => { if (e.target) this.activeElement = e.target as HTMLElement; });
    }
    activeElementGet() { return this.activeElement; };
}
