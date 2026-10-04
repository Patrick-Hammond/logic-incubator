/**
 * The sprite editor's side of the dev server's sprite API (packages/lib/scripts/assets/sprite-api.js): reading a sprite's
 * source PNGs and saving edited ones into the game's asset folders. The API only exists while `npm start` is running, so
 * `Available` is how the editor decides whether to offer editing at all. Plain `fetch` (injectable, so the tests need no
 * server) - no DOM.
 */

export const ApiPath = "/__sprite-api";

export type BundleInfo = {
    name: string;
    /** Folders under sprites/ - where a new sprite can go. */
    sheets: string[];
    /** Pre-packed atlases: no source frames, so nothing can be saved into them. */
    packedSheets: string[];
    /** Every asset name in the bundle (of any kind), for spotting a clash before saving. */
    names: string[];
};

export type SpriteInfo = {
    bundle: string;
    name: string;
    kind: "sprite" | "animation";
    frames: number;
    sheet: string | null;
    dir: string | null;
    editable: boolean;
    /** Why it can't be edited, when it can't. */
    reason: string | null;
};

export type SaveRequest = {
    bundle: string;
    name: string;
    /** "overwrite" changes the sprite that's there; "create" makes a new one (and fails if the name is taken). */
    mode: "overwrite" | "create";
    /** Which folder under sprites/ a new sprite goes in. */
    sheet?: string;
    /** The palette tab a new tile is listed under. */
    category?: string;
    /** Another sprite whose tile properties (collision, light...) the new one starts with. */
    copyMetaFrom?: string;
    /** One PNG per frame. */
    frames: ReadonlyArray<Uint8Array>;
};

export type SaveResult = {
    ok: boolean;
    bundle: string;
    name: string;
    kind: "sprite" | "animation";
    frames: number;
    width: number;
    height: number;
    written: string[];
    removed: string[];
    /** False when the files already held exactly this - nothing to rebuild. */
    changed: boolean;
    notes: Array<{ level: string; message: string }>;
};

export class SpriteApiError extends Error {
    constructor(public status: number, message: string, public details?: string[]) {
        super(message);
        // The target is ES5, where a subclass of Error loses its prototype.
        Object.setPrototypeOf(this, SpriteApiError.prototype);
        this.name = "SpriteApiError";
    }
}

/** Binary as base64 text (btoa wants a string of one-byte characters, and a long one can't go through `apply` in one piece). */
export function ToBase64(bytes: Uint8Array): string {
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode.apply(null, Array.prototype.slice.call(bytes.subarray(i, i + 0x8000)));
    }
    return btoa(binary);
}

export class SpriteApi {
    private available: Promise<boolean> | null = null;

    constructor(private fetcher: typeof fetch = (input, init) => fetch(input, init), private base: string = ApiPath) {}

    /** Whether the dev server's sprite service answers - asked once, then remembered. False in a production build and when the server's elsewhere. */
    Available(): Promise<boolean> {
        if (!this.available) {
            this.available = this.List().then(
                () => true,
                () => false
            );
        }
        return this.available;
    }

    async List(): Promise<BundleInfo[]> {
        const response = await this.Request("/list");
        return (await response.json()).bundles;
    }

    async Describe(bundle: string, name: string): Promise<SpriteInfo> {
        const response = await this.Request(`/sprite?bundle=${encodeURIComponent(bundle)}&name=${encodeURIComponent(name)}`);
        return response.json();
    }

    async ReadFrame(bundle: string, name: string, index: number): Promise<Uint8Array> {
        const response = await this.Request(`/frame?bundle=${encodeURIComponent(bundle)}&name=${encodeURIComponent(name)}&index=${index}`);
        return new Uint8Array(await response.arrayBuffer());
    }

    /** A sprite's description and every frame's source PNG; refuses (with the reason) one that can't be edited. */
    async ReadSprite(bundle: string, name: string): Promise<{ info: SpriteInfo; frames: Uint8Array[] }> {
        const info = await this.Describe(bundle, name);
        if (!info.editable) {
            throw new SpriteApiError(422, `"${name}" can't be edited. ${info.reason || ""}`.trim());
        }
        const frames: Uint8Array[] = [];
        for (let i = 0; i < info.frames; i++) {
            frames.push(await this.ReadFrame(bundle, name, i));
        }
        return { info, frames };
    }

    async Save(request: SaveRequest): Promise<SaveResult> {
        const body = JSON.stringify({
            bundle: request.bundle,
            name: request.name,
            mode: request.mode,
            sheet: request.sheet,
            category: request.category,
            copyMetaFrom: request.copyMetaFrom,
            frames: request.frames.map(ToBase64)
        });
        const response = await this.Request("/save", { method: "POST", body, headers: { "Content-Type": "application/json" } });
        return response.json();
    }

    private async Request(path: string, init: { method?: string; body?: string; headers?: { [name: string]: string } } = {}): Promise<Response> {
        let response: Response;
        try {
            response = await this.fetcher(this.base + path, { ...init, headers: { "X-Sprite-Editor": "1", ...init.headers }, cache: "no-store" });
        } catch {
            throw new SpriteApiError(0, "Can't reach the dev server's sprite service - is `npm start` running?");
        }
        if (!response.ok) {
            let message = `${response.status} ${response.statusText}`.trim();
            let details: string[] | undefined;
            try {
                const body = await response.json();
                if (body && typeof body.error === "string") {
                    message = body.error;
                    details = body.details;
                }
            } catch {
                // Not JSON (a proxy's error page): the status line will do.
            }
            throw new SpriteApiError(response.status, message, details);
        }
        return response;
    }
}

/** The one the editor uses. */
export const SharedSpriteApi = new SpriteApi();
