/**
 * The pixel maths behind the sprite editor's tools. A bitmap is a width, a height and one palette index per
 * pixel; the shape functions only work out which cells a line, rectangle or ellipse covers (so the tool can show
 * them before it paints them), and everything that changes a bitmap clips to its edges. Pure - no DOM - so it
 * runs under the plain node test runner (see Bitmap.test.ts).
 */

export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; width: number; height: number };
export type Bitmap = { width: number; height: number; data: Uint8Array };

export function CreateBitmap(width: number, height: number, fill = 0): Bitmap {
    const data = new Uint8Array(width * height);
    if (fill) {
        data.fill(fill);
    }
    return { width, height, data };
}

export function CloneBitmap(bitmap: Bitmap): Bitmap {
    return { width: bitmap.width, height: bitmap.height, data: bitmap.data.slice() };
}

export function InBounds(bitmap: Bitmap, x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < bitmap.width && y < bitmap.height;
}

/** The index at (x, y), or -1 outside the bitmap. */
export function GetPixel(bitmap: Bitmap, x: number, y: number): number {
    return InBounds(bitmap, x, y) ? bitmap.data[y * bitmap.width + x] : -1;
}

/** Sets a pixel; false if it's off the bitmap or already that value. */
export function SetPixel(bitmap: Bitmap, x: number, y: number, value: number): boolean {
    if (!InBounds(bitmap, x, y)) {
        return false;
    }
    const at = y * bitmap.width + x;
    if (bitmap.data[at] === value) {
        return false;
    }
    bitmap.data[at] = value;
    return true;
}

// ---------------------------------------------------------------------------------------------- shapes

/**
 * Every cell on the line from `a` to `b`, both ends included (Bresenham) - in order from `a`. The cells are the same
 * whichever end it's drawn from: Bresenham alone breaks ties differently each way, which would make a stroke look
 * different dragged one way than the other.
 */
export function LinePoints(a: Point, b: Point): Point[] {
    if (a.x > b.x || (a.x === b.x && a.y > b.y)) {
        return TraceLine(b, a).reverse();
    }
    return TraceLine(a, b);
}

function TraceLine(a: Point, b: Point): Point[] {
    const points: Point[] = [];
    let x = a.x;
    let y = a.y;
    const dx = Math.abs(b.x - a.x);
    const dy = -Math.abs(b.y - a.y);
    const sx = a.x < b.x ? 1 : -1;
    const sy = a.y < b.y ? 1 : -1;
    let err = dx + dy;
    for (;;) {
        points.push({ x, y });
        if (x === b.x && y === b.y) {
            break;
        }
        const e2 = 2 * err;
        if (e2 >= dy) {
            err += dy;
            x += sx;
        }
        if (e2 <= dx) {
            err += dx;
            y += sy;
        }
    }
    return points;
}

/** The cells of the rectangle with opposite corners `a` and `b` (either way round): its border, or all of it. */
export function RectPoints(a: Point, b: Point, filled: boolean): Point[] {
    const x0 = Math.min(a.x, b.x);
    const x1 = Math.max(a.x, b.x);
    const y0 = Math.min(a.y, b.y);
    const y1 = Math.max(a.y, b.y);
    const points: Point[] = [];
    for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
            if (filled || x === x0 || x === x1 || y === y0 || y === y1) {
                points.push({ x, y });
            }
        }
    }
    return points;
}

/**
 * The cells of the ellipse that fits the box with corners `a` and `b` (inclusive): its outline, or all of it. The
 * integer midpoint algorithm, so the result is exactly symmetric and touches all four sides of the box.
 */
export function EllipsePoints(a: Point, b: Point, filled: boolean): Point[] {
    let x0 = Math.min(a.x, b.x);
    let x1 = Math.max(a.x, b.x);
    let y0 = Math.min(a.y, b.y);
    let y1 = Math.max(a.y, b.y);
    const width = x1 - x0;
    const height = y1 - y0;
    const odd = height & 1;
    let dx = 4 * (1 - width) * height * height;
    let dy = 4 * (odd + 1) * width * width;
    let err = dx + dy + odd * width * width;

    const seen = new Set<number>();
    const outline: Point[] = [];
    const plot = (x: number, y: number) => {
        const key = (y + 100000) * 200000 + (x + 100000);
        if (!seen.has(key)) {
            seen.add(key);
            outline.push({ x, y });
        }
    };

    y0 += Math.floor((height + 1) / 2);
    y1 = y0 - odd;
    const stepA = 8 * width * width;
    const stepB = 8 * height * height;
    do {
        plot(x1, y0);
        plot(x0, y0);
        plot(x0, y1);
        plot(x1, y1);
        const e2 = 2 * err;
        if (e2 <= dy) {
            y0++;
            y1--;
            dy += stepA;
            err += dy;
        }
        if (e2 >= dx || 2 * err > dy) {
            x0++;
            x1--;
            dx += stepB;
            err += dx;
        }
    } while (x0 <= x1);
    // Narrow ellipses stop early: finish the tip.
    while (y0 - y1 <= height) {
        plot(x0 - 1, y0);
        plot(x1 + 1, y0++);
        plot(x0 - 1, y1);
        plot(x1 + 1, y1--);
    }
    if (!filled) {
        return outline;
    }
    // Filled: every cell between an outline cell's row-mates.
    const spans = new Map<number, { min: number; max: number }>();
    outline.forEach(p => {
        const span = spans.get(p.y);
        if (span) {
            span.min = Math.min(span.min, p.x);
            span.max = Math.max(span.max, p.x);
        } else {
            spans.set(p.y, { min: p.x, max: p.x });
        }
    });
    const points: Point[] = [];
    Array.from(spans.keys()).sort((p, q) => p - q).forEach(y => {
        const span = spans.get(y);
        for (let x = span.min; x <= span.max; x++) {
            points.push({ x, y });
        }
    });
    return points;
}

// ---------------------------------------------------------------------------------------------- brushes

export type BrushShape = "square" | "round";

export const MaxBrushSize = 32;

/** The cells a brush of `size` covers around its centre cell - a square, or a disc (corners off from size 4). */
export function BrushOffsets(size: number, shape: BrushShape): Point[] {
    const n = Math.max(1, Math.min(MaxBrushSize, Math.round(size)));
    const start = -Math.floor((n - 1) / 2);
    const centre = (n - 1) / 2 + start;
    const radius = n / 2;
    const offsets: Point[] = [];
    for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
            const ox = start + x;
            const oy = start + y;
            if (shape === "square" || (ox - centre) * (ox - centre) + (oy - centre) * (oy - centre) <= radius * radius) {
                offsets.push({ x: ox, y: oy });
            }
        }
    }
    return offsets;
}

export type Mirror = { x: boolean; y: boolean };

/** Paints `value` with the brush at each of `points`, and at their mirror images across the bitmap's centre lines. True if anything changed. */
export function PlotPoints(bitmap: Bitmap, points: ReadonlyArray<Point>, brush: ReadonlyArray<Point>, value: number, mirror: Mirror = { x: false, y: false }): boolean {
    let changed = false;
    const stamp = (cx: number, cy: number) => {
        brush.forEach(o => {
            if (SetPixel(bitmap, cx + o.x, cy + o.y, value)) {
                changed = true;
            }
        });
    };
    points.forEach(p => {
        stamp(p.x, p.y);
        if (mirror.x) {
            stamp(bitmap.width - 1 - p.x, p.y);
        }
        if (mirror.y) {
            stamp(p.x, bitmap.height - 1 - p.y);
        }
        if (mirror.x && mirror.y) {
            stamp(bitmap.width - 1 - p.x, bitmap.height - 1 - p.y);
        }
    });
    return changed;
}

/**
 * Fills with `value` from (x, y): the connected run of the same index (4-way), or - with `everywhere` - every pixel
 * that shares it. Returns how many pixels changed.
 */
export function FloodFill(bitmap: Bitmap, x: number, y: number, value: number, everywhere = false): number {
    const target = GetPixel(bitmap, x, y);
    if (target < 0 || target === value) {
        return 0;
    }
    const { width, height, data } = bitmap;
    let count = 0;
    if (everywhere) {
        for (let i = 0; i < data.length; i++) {
            if (data[i] === target) {
                data[i] = value;
                count++;
            }
        }
        return count;
    }
    const stack: number[] = [x, y];
    while (stack.length) {
        const py = stack.pop();
        const px = stack.pop();
        if (data[py * width + px] !== target) {
            continue;
        }
        let left = px;
        while (left > 0 && data[py * width + left - 1] === target) {
            left--;
        }
        let right = px;
        while (right < width - 1 && data[py * width + right + 1] === target) {
            right++;
        }
        for (let i = left; i <= right; i++) {
            data[py * width + i] = value;
            count++;
        }
        [py - 1, py + 1].forEach(ny => {
            if (ny < 0 || ny >= height) {
                return;
            }
            let inRun = false;
            for (let i = left; i <= right; i++) {
                const matches = data[ny * width + i] === target;
                if (matches && !inRun) {
                    stack.push(i, ny);
                }
                inRun = matches;
            }
        });
    }
    return count;
}

// ---------------------------------------------------------------------------------------------- regions

/** `rect` cut down to what's inside the bitmap (zero-sized if none of it is). */
export function ClipRect(bitmap: Bitmap, rect: Rect): Rect {
    const x0 = Math.max(0, rect.x);
    const y0 = Math.max(0, rect.y);
    const x1 = Math.min(bitmap.width, rect.x + rect.width);
    const y1 = Math.min(bitmap.height, rect.y + rect.height);
    return { x: x0, y: y0, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0) };
}

/** A copy of the pixels in `rect` (clipped to the bitmap). */
export function ReadRegion(bitmap: Bitmap, rect: Rect): Bitmap {
    const r = ClipRect(bitmap, rect);
    const out = CreateBitmap(r.width, r.height);
    for (let y = 0; y < r.height; y++) {
        for (let x = 0; x < r.width; x++) {
            out.data[y * r.width + x] = bitmap.data[(r.y + y) * bitmap.width + r.x + x];
        }
    }
    return out;
}

/** Sets every pixel in `rect` to `value`. */
export function FillRegion(bitmap: Bitmap, rect: Rect, value: number): void {
    const r = ClipRect(bitmap, rect);
    for (let y = r.y; y < r.y + r.height; y++) {
        for (let x = r.x; x < r.x + r.width; x++) {
            bitmap.data[y * bitmap.width + x] = value;
        }
    }
}

/** Draws `region` with its top-left at (x, y), clipped; pixels equal to `skip` (the transparent index, say) are left unwritten. */
export function WriteRegion(bitmap: Bitmap, region: Bitmap, x: number, y: number, skip = -1): void {
    for (let ry = 0; ry < region.height; ry++) {
        for (let rx = 0; rx < region.width; rx++) {
            const value = region.data[ry * region.width + rx];
            if (value !== skip) {
                SetPixel(bitmap, x + rx, y + ry, value);
            }
        }
    }
}

export function FlipHorizontal(source: Bitmap): Bitmap {
    const out = CreateBitmap(source.width, source.height);
    for (let y = 0; y < source.height; y++) {
        for (let x = 0; x < source.width; x++) {
            out.data[y * source.width + x] = source.data[y * source.width + (source.width - 1 - x)];
        }
    }
    return out;
}

export function FlipVertical(source: Bitmap): Bitmap {
    const out = CreateBitmap(source.width, source.height);
    for (let y = 0; y < source.height; y++) {
        out.data.set(source.data.subarray((source.height - 1 - y) * source.width, (source.height - y) * source.width), y * source.width);
    }
    return out;
}

/** Turned a quarter clockwise - its width and height swap. */
export function RotateClockwise(source: Bitmap): Bitmap {
    const out = CreateBitmap(source.height, source.width);
    for (let y = 0; y < source.height; y++) {
        for (let x = 0; x < source.width; x++) {
            out.data[x * out.width + (source.height - 1 - y)] = source.data[y * source.width + x];
        }
    }
    return out;
}

export function RotateCounterClockwise(source: Bitmap): Bitmap {
    const out = CreateBitmap(source.height, source.width);
    for (let y = 0; y < source.height; y++) {
        for (let x = 0; x < source.width; x++) {
            out.data[(source.width - 1 - x) * out.width + y] = source.data[y * source.width + x];
        }
    }
    return out;
}

/**
 * The bitmap on a new canvas of `width` x `height`, `fill` where it's new. The old picture sits at `anchorX` / `anchorY`
 * (0 = left / top, 0.5 = centred, 1 = right / bottom): a smaller canvas crops from the other side.
 */
export function ResizeBitmap(source: Bitmap, width: number, height: number, anchorX: number, anchorY: number, fill: number): Bitmap {
    const out = CreateBitmap(width, height, fill);
    const dx = Math.round((width - source.width) * anchorX);
    const dy = Math.round((height - source.height) * anchorY);
    for (let y = 0; y < source.height; y++) {
        for (let x = 0; x < source.width; x++) {
            SetPixel(out, x + dx, y + dy, source.data[y * source.width + x]);
        }
    }
    return out;
}

/** The bitmap slid by (dx, dy): what leaves one side comes back on the other if `wrap`, else the gap is `fill`. */
export function ShiftBitmap(source: Bitmap, dx: number, dy: number, wrap: boolean, fill: number): Bitmap {
    const out = CreateBitmap(source.width, source.height, fill);
    for (let y = 0; y < source.height; y++) {
        for (let x = 0; x < source.width; x++) {
            let nx = x + dx;
            let ny = y + dy;
            if (wrap) {
                nx = ((nx % source.width) + source.width) % source.width;
                ny = ((ny % source.height) + source.height) % source.height;
            }
            SetPixel(out, nx, ny, source.data[y * source.width + x]);
        }
    }
    return out;
}

/** How many pixels across all the bitmaps use each of `size` palette entries. */
export function CountUsage(bitmaps: ReadonlyArray<Bitmap>, size = 256): number[] {
    const counts: number[] = new Array(size).fill(0);
    bitmaps.forEach(b => {
        for (let i = 0; i < b.data.length; i++) {
            counts[b.data[i]]++;
        }
    });
    return counts;
}
