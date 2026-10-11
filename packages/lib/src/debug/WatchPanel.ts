import type { Cancel } from "../game/Timing";

/** How often the panel reads its watches again, in milliseconds. */
const RefreshMs = 250;

type Watch = { title: string; read: () => ReadonlyArray<string>; body: HTMLElement };

/** The one panel on the page, while anything is watched. */
let panel: { root: HTMLElement; watches: Watch[]; timer: ReturnType<typeof setInterval> } | undefined;

/**
 * Shows `read`'s lines, under `title`, in a small box over the top-left corner of the page, read again four times a
 * second - for keeping an eye on numbers while the game runs (a connection's round trip, say). One box serves the
 * page: each watch is a section of it. Development only - see `DebugTools.Watch`. Returns what takes it away again
 * (the last one out removes the box).
 */
export function OpenWatch(title: string, read: () => ReadonlyArray<string>): Cancel {
    if (typeof document === "undefined") {
        return () => undefined;
    }
    if (!panel) {
        const root = document.createElement("div");
        root.className = "dbg-watch";
        Object.assign(root.style, {
            position: "fixed",
            left: "8px",
            top: "8px",
            zIndex: "10000",
            padding: "6px 8px",
            background: "rgba(10, 8, 20, 0.75)",
            color: "#e8e8ff",
            font: "11px/1.35 ui-monospace, Consolas, monospace",
            whiteSpace: "pre",
            pointerEvents: "none",
            borderRadius: "3px"
        });
        document.body.appendChild(root);
        const open = { root, watches: [] as Watch[], timer: setInterval(Refresh, RefreshMs) };
        panel = open;
    }
    const section = document.createElement("div");
    const heading = document.createElement("div");
    heading.textContent = title;
    heading.style.color = "#ffd866";
    const body = document.createElement("div");
    section.appendChild(heading);
    section.appendChild(body);
    panel.root.appendChild(section);
    const watch: Watch = { title, read, body };
    panel.watches.push(watch);
    Refresh();

    let closed = false;
    return () => {
        if (closed || !panel) {
            return;
        }
        closed = true;
        panel.watches = panel.watches.filter(other => other !== watch);
        section.remove();
        if (!panel.watches.length) {
            clearInterval(panel.timer);
            panel.root.remove();
            panel = undefined;
        }
    };
}

function Refresh(): void {
    if (!panel) {
        return;
    }
    panel.watches.forEach(watch => {
        let text: string;
        try {
            text = watch.read().join("\n");
        } catch (error) {
            text = "(" + (error as Error).message + ")";
        }
        if (watch.body.textContent !== text) {
            watch.body.textContent = text;
        }
    });
}
