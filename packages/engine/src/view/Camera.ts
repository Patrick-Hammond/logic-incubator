
import {ICameraControl} from "@logic-incubator/lib/game/display/CameraControl";
import GameComponent from "@logic-incubator/lib/game/GameComponent";
import { Rectangle } from "@logic-incubator/lib/math/Geometry";
import { Lerp, Sign } from "@logic-incubator/lib/math/Utils";
import { GameHeight, PlayWidth, Scenes, TileSize } from "../Constants";
import { CAMERA_MOVED } from "../Events";
import { StepZoom, ZoomState } from "../level/Depth";
import ZoomJump from "./helpers/ZoomLevels";

/** Share of the way the party's zoom closes on its target each 60th of a second - smooth, but quick enough to keep up with heroes running apart. */
const PartyZoomFollow = 0.06;

export class Camera extends GameComponent {
    get ViewRect(): Rectangle {
        return this.viewRect;
    }
    get Scale(): number {
        return this.scale;
    }
    get ScaledTileSize(): number {
        return this.scaledTileSize;
    }
    get Zoom(): number {
        return this.zoom;
    }
    /**
     * Visible tile span of the player's own z band, which always renders 1:1.
     * Bands above/below the player scale relative to it, so the ground the player
     * stands on never changes size - stepping up makes the level you left recede.
     */
    get BaseViewWidth(): number {
        return this.baseViewWidth;
    }
    get BaseViewHeight(): number {
        return this.baseViewHeight;
    }
    /** The height the player is currently standing on; the fully-opaque, 1:1 render band. */
    get CurrentZ(): number {
        return this.currentZ;
    }
    /**
     * Height-driven zoom (see `UpdateZoom`) times the zoom level's (see `SetZoomLevel`), or the party's (see
     * `ZoomForParty`) where that's further out - what `TileMapView`/`EntityRenderer` should scale their render by,
     * instead of calling `CameraZoom(CurrentZ)` themselves.
     */
    get EffectiveZoom(): number {
        return this.zoomState.value * Math.min(this.levelZoom.Value, this.partyZoom);
    }
    /**
     * The zoom for the party's spread, from `MaxLevelZoom` (one hero, or a party close together) down to `MinPartyZoom` -
     * see `ZoomForParty`. It holds the view out only where it's further out than the zoom level.
     */
    get PartyZoom(): number {
        return this.partyZoom;
    }
    /** The zoom level picked (see `SetZoomLevel`), from 0 - the usual - in: the one the camera is at, or on its way to. */
    get ZoomLevel(): number {
        return this.levelZoom.Level;
    }
    /** The zoom level's zoom right now, times the usual - between levels during a jump. */
    get LevelZoom(): number {
        return this.levelZoom.Value;
    }
    /** The zooms the levels have, times the usual, from level 0 (key 1) - see `new Camera`. */
    get ZoomLevels(): ReadonlyArray<number> {
        return this.levelZoom.Levels;
    }
    /** The closest of `ZoomLevels` - what to ask `PartyFrame.PartyZoom` for at `most`. */
    get MaxLevelZoom(): number {
        return this.levelZoom.Max;
    }

    private viewRect: Rectangle;
    private scale: number;
    private scaledTileSize: number;
    private zoom: number = 2;

    private baseViewWidth: number = 0;
    private baseViewHeight: number = 0;
    private currentZ: number = 0;
    private zoomState: ZoomState = { value: 1, z: 0 };
    private zHeldTime: number = 0;
    private levelZoom: ZoomJump;
    private partyZoom: number;

    /** `zoomLevels`: what each zoom level is, times the usual, from level 0 (see `ZoomLevels.UsableZoomLevels`); left out, `DefaultZoomLevels`. */
    constructor(private cameraControl?: ICameraControl, zoomLevels?: ReadonlyArray<number>) {
        super();
        this.levelZoom = new ZoomJump(zoomLevels);
        // As close as it goes, so it holds nothing back until a party spreads.
        this.partyZoom = this.levelZoom.Max;
    }

    Move(x: number, y: number): void {
        this.root.x += x;
        this.root.y += y;

        const rootX = Math.abs(this.root.x);
        if (rootX >= this.scaledTileSize) {
            const dir = Sign(this.root.x);
            const over = (rootX - (rootX | 0)) * dir;
            this.viewRect.Offset(-dir, 0);
            this.root.x = over;
            this.game.dispatcher.emit(CAMERA_MOVED);
        }

        const rootY = Math.abs(this.root.y);
        if (rootY >= this.scaledTileSize) {
            const dir = Sign(this.root.y);
            const over = (rootY - (rootY | 0)) * dir;
            this.viewRect.Offset(0, -dir);
            this.root.y = over;
            this.game.dispatcher.emit(CAMERA_MOVED);
        }
    }

    CenterOn(x: number, y: number): void {
        this.viewRect.Set(x - this.viewRect.width * 0.5, y - this.viewRect.height * 0.5, this.viewRect.width, this.viewRect.height);
        this.root.position.set(0, 0);
        this.game.dispatcher.emit(CAMERA_MOVED);
    }

    Follow(pixelX: number, pixelY: number, amount: number): void {
        this.viewRect.Set(
            Lerp(this.viewRect.x, pixelX / TileSize - this.viewRect.width * 0.5, amount),
            Lerp(this.viewRect.y, pixelY / TileSize - this.viewRect.height * 0.5, amount)
        );
        this.game.dispatcher.emit(CAMERA_MOVED);
    }

    /**
     * Record the height the player is standing on. The view window is NOT resized
     * - the player's band always draws 1:1 (see TileMapView), so the camera
     * effectively zooms out as the player climbs. `TileMapView` reads `CurrentZ`
     * on the next `CAMERA_MOVED` (emitted every frame by `Follow`).
     */
    SetZ(z: number): void {
        if (z !== this.currentZ) {
            this.currentZ = z;
            this.zHeldTime = 0;
        }
    }

    /**
     * Eases the party's zoom towards `target` (see `PartyFrame.PartyZoom`, asked with this `MaxLevelZoom` as its `most`) -
     * zooming out as heroes on a shared screen spread apart and back in as they gather, but never closer than the zoom
     * level - `frames` (60ths of a second) since the last display frame.
     */
    ZoomForParty(target: number, frames: number): void {
        this.partyZoom += (target - this.partyZoom) * (1 - Math.pow(1 - PartyZoomFollow, frames));
    }

    /**
     * Jumps to zoom level `level` (from 0: one of `ZoomLevels` - keys 1, 2, 3... in play) over
     * `ZoomJumpSeconds`, from wherever the zoom is now. It stays at that level, restarts and new levels too, until
     * another is picked.
     */
    SetZoomLevel(level: number): void {
        this.levelZoom.To(level);
    }

    /**
     * Advances `EffectiveZoom` by `dt` seconds. Call once per frame, after
     * `SetZ`: for `ZoomSettleDelay` seconds after the last z change, it tracks
     * height incrementally (so interrupting an in-progress ease-back never
     * causes a visible jump); after that, it eases back to a neutral 1:1 zoom
     * instead of staying pinned to height forever - see `StepZoom`. A jump to
     * another zoom level (see `SetZoomLevel`) moves on too.
     */
    UpdateZoom(dt: number): void {
        this.zoomState = StepZoom(this.zoomState, this.currentZ, this.zHeldTime, dt);
        this.zHeldTime += dt;
        this.levelZoom.Step(dt);
    }

     protected OnInitialise() {

        this.viewRect = new Rectangle(0, 0, Math.floor(PlayWidth / TileSize / this.Zoom), Math.floor(GameHeight / TileSize / this.Zoom));
        this.scale = Math.min(PlayWidth / this.viewRect.width / TileSize, GameHeight / this.viewRect.height / TileSize);
        this.scaledTileSize = TileSize * this.scale;

        this.baseViewWidth = this.viewRect.width;
        this.baseViewHeight = this.viewRect.height;

        if(this.cameraControl) {
            this.Tick(this.GetInput);
        }
    }

    private GetInput(): void {
        const n = this.cameraControl.Get().rotation;
        this.game.sceneManager.GetScene(Scenes.GAME).root.rotation += n.x * 0.1;
    }
}
