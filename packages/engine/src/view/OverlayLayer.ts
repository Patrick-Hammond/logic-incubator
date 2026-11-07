import { BLEND_MODES, Buffer, Container, DRAW_MODES, Geometry, Program, Renderer, Shader, State, Texture, TYPES, UniformGroup } from "pixi.js";
import { OverlayBlend, OverlayBlends, OverlayCell, OverlayKinds } from "../level/Overlays";
import * as overlayFragmentSrc from "./overlay.frag";
import * as overlayVertexSrc from "./overlay.vert";
import type ReflectionCapture from "./ReflectionCapture";

/** Per corner: position (2), pattern position (2), cell corner (2), light (3), look (3), tint (3). */
const FloatsPerVertex = 15;
const FloatsPerQuad = FloatsPerVertex * 4;
/** As many quads as 16-bit indices reach - far more cells than are ever on screen. */
const MaxQuads = 16383;
/** Light for an overlay drawn unlit - in the editor, as its tiles are. */
const Unlit = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
/** How long `uTime` runs before it starts again, in seconds: an hour, short enough that `sin()` keeps its precision. */
const TimeWrap = 3600;

/** Each blend's own blending, premultiplied: what's drawn over the floor, added to it, multiplied into it, or screened over it. */
const BlendModes: { [B in OverlayBlend]: BLEND_MODES } = {
    normal: BLEND_MODES.NORMAL,
    add: BLEND_MODES.ADD,
    multiply: BLEND_MODES.MULTIPLY,
    screen: BLEND_MODES.SCREEN
};

/**
 * `overlay.frag` for the kind at `kind` in `OverlayKinds`: `KIND` defined under its first line, its precision, where pixi looks for that -
 * and `UNLIT` for one multiplied into the floor, which is lit already, so its colour darkens it as it is.
 */
function FragmentFor(kind: number, unlit: boolean): string {
    const source = overlayFragmentSrc as unknown as string;
    const firstLine = source.indexOf("\n") + 1;
    return source.slice(0, firstLine) + "#define KIND " + kind + "\n#define UNLIT " + (unlit ? 1 : 0) + "\n" + source.slice(firstLine);
}

/** One kind's quads with one blend this frame, gathered as they're added and laid out run by run at `End`. */
interface KindRun {
    data: Float32Array;
    quads: number;
    /** Where its quads start in the vertex buffer, once `End` has laid them out. */
    first: number;
}

/**
 * Draws floor overlays (see `Overlays`) - a quad per cell, refilled every frame between `Begin` and `End`, as a tile layer is -
 * with `overlay.frag`, which makes up the dirt, water, slime and the rest pixel by pixel from each cell's kind and where it is, edges
 * them where their patch ends, lights them as the floor (each corner's light, as a tile's) and, over water, a shiny floor or
 * anything else that reflects, mirrors what `reflections` drew this frame. Its cells are laid out in its own pixels, a cell
 * `tileSize` across, so scale it as the tiles it lies on. Each kind is drawn by a program of its own (see `overlay.frag`), made
 * the first time it's needed, and laid over the floor with its blend's own GPU blending (`OverlayBlend`): a draw call for each
 * kind and blend on screen.
 */
export default class OverlayLayer extends Container {
    /** What reflective overlays mirror: drawn earlier in the frame (see `ReflectionCapture`), or null for nothing - in the editor. */
    reflections: ReflectionCapture | null = null;
    /** Every run's quads together, run by run - what's handed to the GPU. */
    private data = new Float32Array(FloatsPerQuad * 64);
    /** A run for each kind and blend, at `kind * OverlayBlends.length + blend`. */
    private readonly runs: KindRun[] = [];
    private quads = 0;
    private reflective = 0;
    private readonly vertices: Buffer;
    private readonly indices: Buffer;
    private readonly geometry: Geometry;
    /** The uniforms, shared by every kind's program. */
    private readonly uniforms: UniformGroup;
    /** Each kind's programs, lit and unlit (see `FragmentFor`), at `kind * 2 + unlit` - made when they're first drawn. */
    private readonly shaders: Shader[] = [];
    /** How each blend is blended (see `BlendModes`), by its place in `OverlayBlends`. */
    private readonly states: State[] = OverlayBlends.map(blend => {
        const state = new State();
        state.blendMode = BlendModes[blend];
        return state;
    });
    /** How many quads `indices` has room for. */
    private indexedQuads = 0;

    constructor(private tileSize: number) {
        super();
        this.interactive = this.interactiveChildren = false;
        for (let i = 0; i < OverlayKinds.length * OverlayBlends.length; i++) {
            this.runs.push({ data: new Float32Array(FloatsPerQuad * 16), quads: 0, first: 0 });
        }
        this.vertices = new Buffer(this.data, false, false);
        this.indices = new Buffer(new Uint16Array(0), true, true);
        // In bytes.
        const stride = FloatsPerVertex * 4;
        this.geometry = new Geometry()
            .addAttribute("aVertexPosition", this.vertices, 2, false, TYPES.FLOAT, stride, 0)
            .addAttribute("aPattern", this.vertices, 2, false, TYPES.FLOAT, stride, 2 * 4)
            .addAttribute("aCell", this.vertices, 2, false, TYPES.FLOAT, stride, 4 * 4)
            .addAttribute("aLight", this.vertices, 3, false, TYPES.FLOAT, stride, 6 * 4)
            .addAttribute("aLook", this.vertices, 3, false, TYPES.FLOAT, stride, 9 * 4)
            .addAttribute("aTint", this.vertices, 3, false, TYPES.FLOAT, stride, 12 * 4)
            .addIndex(this.indices);
        this.uniforms = new UniformGroup({
            translationMatrix: new Float32Array(9),
            uScreen: new Float32Array(2),
            uReflection: Texture.WHITE,
            uReflect: 0,
            uPixel: new Float32Array(2),
            uTime: 0,
            uAlpha: 1,
            uTile: tileSize
        });
    }

    /** How many of this frame's cells mirror what's over them - none, and nothing need be drawn for them to mirror. */
    get ReflectiveCells(): number {
        return this.reflective;
    }

    /** Starts a frame's cells afresh. */
    Begin(): void {
        this.quads = 0;
        this.reflective = 0;
        this.runs.forEach(run => (run.quads = 0));
    }

    /**
     * A cell drawn with its top-left at `left`, `top` in this layer's pixels, lit by `light` - four corners' red, green and blue, top-left,
     * top-right, bottom-right, bottom-left, as `Lighting.CellCornerLight` gives them - or, for null, unlit.
     */
    Add(cell: OverlayCell, left: number, top: number, light: ArrayLike<number> | null): void {
        const run = this.runs[cell.kind * OverlayBlends.length + cell.blend];
        if (this.quads >= MaxQuads || !run || cell.alpha <= 0) {
            return;
        }
        if ((run.quads + 1) * FloatsPerQuad > run.data.length) {
            const grown = new Float32Array(Math.min(MaxQuads * FloatsPerQuad, run.data.length * 2));
            grown.set(run.data);
            run.data = grown;
        }
        const size = this.tileSize;
        const corners = light || Unlit;
        const cellX = cell.patternX * size;
        const cellY = cell.patternY * size;
        const r = ((cell.tint >> 16) & 0xff) / 255;
        const g = ((cell.tint >> 8) & 0xff) / 255;
        const b = (cell.tint & 0xff) / 255;
        const data = run.data;
        let i = run.quads * FloatsPerQuad;
        for (let corner = 0; corner < 4; corner++) {
            // Top-left, top-right, bottom-right, bottom-left.
            const dx = corner === 1 || corner === 2 ? size : 0;
            const dy = corner >= 2 ? size : 0;
            data[i++] = left + dx;
            data[i++] = top + dy;
            data[i++] = cellX + dx;
            data[i++] = cellY + dy;
            data[i++] = cellX;
            data[i++] = cellY;
            data[i++] = corners[corner * 3];
            data[i++] = corners[corner * 3 + 1];
            data[i++] = corners[corner * 3 + 2];
            data[i++] = cell.alpha;
            data[i++] = cell.reflectivity;
            data[i++] = cell.joins;
            data[i++] = r;
            data[i++] = g;
            data[i++] = b;
        }
        run.quads++;
        this.quads++;
        if (cell.reflectivity > 0) {
            this.reflective++;
        }
    }

    /** Hands the frame's cells to the GPU, run by run. */
    End(): void {
        if (!this.quads) {
            return;
        }
        if (this.quads * FloatsPerQuad > this.data.length) {
            let length = this.data.length;
            while (length < this.quads * FloatsPerQuad) {
                length *= 2;
            }
            this.data = new Float32Array(Math.min(MaxQuads * FloatsPerQuad, length));
        }
        let first = 0;
        this.runs.forEach(run => {
            run.first = first;
            this.data.set(run.data.subarray(0, run.quads * FloatsPerQuad), first * FloatsPerQuad);
            first += run.quads;
        });
        if (this.indexedQuads < this.quads) {
            const count = Math.min(MaxQuads, Math.max(this.quads, this.indexedQuads * 2, 64));
            this.indexedQuads = count;
            const indices = new Uint16Array(count * 6);
            for (let q = 0; q < count; q++) {
                const v = q * 4;
                indices.set([v, v + 1, v + 2, v, v + 2, v + 3], q * 6);
            }
            this.indices.update(indices);
        }
        this.vertices.update(this.data.subarray(0, this.quads * FloatsPerQuad));
    }

    protected _render(renderer: Renderer): void {
        if (!this.quads) {
            return;
        }
        renderer.batch.flush();
        const uniforms = this.uniforms.uniforms;
        const transform = this.worldTransform;
        uniforms.translationMatrix = transform.toArray(true);
        uniforms.uScreen[0] = renderer.screen.width;
        uniforms.uScreen[1] = renderer.screen.height;
        uniforms.uPixel[0] = transform.a / renderer.screen.width;
        uniforms.uPixel[1] = transform.d / renderer.screen.height;
        const mirrored = this.reflections && this.reflections.active ? this.reflections.Texture : null;
        uniforms.uReflection = mirrored || Texture.WHITE;
        uniforms.uReflect = mirrored ? 1 : 0;
        uniforms.uTime = (performance.now() / 1000) % TimeWrap;
        uniforms.uAlpha = this.worldAlpha;

        this.runs.forEach((run, index) => {
            if (!run.quads) {
                return;
            }
            const blend = index % OverlayBlends.length;
            const shader = this.ShaderFor(Math.floor(index / OverlayBlends.length), OverlayBlends[blend] === "multiply");
            renderer.state.set(this.states[blend]);
            renderer.shader.bind(shader, false);
            renderer.geometry.bind(this.geometry, shader);
            renderer.geometry.draw(DRAW_MODES.TRIANGLES, run.quads * 6, run.first * 6);
        });
    }

    private ShaderFor(kind: number, unlit: boolean): Shader {
        const index = kind * 2 + (unlit ? 1 : 0);
        if (!this.shaders[index]) {
            this.shaders[index] = new Shader(Program.from(overlayVertexSrc as unknown as string, FragmentFor(kind, unlit)), this.uniforms);
        }
        return this.shaders[index];
    }

    destroy(options?: { children?: boolean; texture?: boolean; baseTexture?: boolean }): void {
        this.geometry.destroy();
        super.destroy(options);
    }
}
