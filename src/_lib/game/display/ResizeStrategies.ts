export interface IResizeStrategy {
    Resize(canvas: HTMLCanvasElement): void;
}

export function GetResizeStrategy(fit: "border" | "no border"): IResizeStrategy {
    return fit === "border" ? new BorderResizeStrategy() : new NoBorderResizeStrategy();
}

class BorderResizeStrategy implements IResizeStrategy {
    Resize(canvas: HTMLCanvasElement): void {
        let scaleX: number, scaleY: number, scale: number, center: string, margin: number;
        scaleX = window.innerWidth / canvas.offsetWidth;
        scaleY = window.innerHeight / canvas.offsetHeight;
        scale = Math.min(scaleX, scaleY);
        canvas.style.transformOrigin = "0 0";
        canvas.style.transform = "scale(" + scale + ")";
        if (canvas.offsetWidth > canvas.offsetHeight) {
            center = canvas.offsetWidth * scale < window.innerWidth ? "horizontally" : "vertically";
        } else {
            center = canvas.offsetHeight * scale < window.innerHeight ? "vertically" : "horizontally";
        };
        if (center === "horizontally") {
            margin = (window.innerWidth - canvas.offsetWidth * scale) / 2;
            canvas.style.marginTop = 0 + "px"; canvas.style.marginBottom = 0 + "px";
            canvas.style.marginLeft = margin + "px"; canvas.style.marginRight = margin + "px";
        };
        if (center === "vertically") {
            margin = (window.innerHeight - canvas.offsetHeight * scale) / 2;
            canvas.style.marginTop  = margin + "px"; canvas.style.marginBottom = margin + "px";
            canvas.style.marginLeft = 0      + "px"; canvas.style.marginRight  = 0      + "px";
        };
        canvas.style.paddingLeft = 0 + "px"; canvas.style.paddingRight  = 0 + "px";
        canvas.style.paddingTop  = 0 + "px"; canvas.style.paddingBottom = 0 + "px";
        canvas.style.display = "-webkit-inline-box";
    }
}

class NoBorderResizeStrategy implements IResizeStrategy {
    Resize(canvas: HTMLCanvasElement): void {
      // TO DO
    }
}