
import {ICameraControl} from "../../../_lib/game/display/CameraControl";
import GameComponent from "../../../_lib/game/GameComponent";
import { Rectangle } from "../../../_lib/math/Geometry";
import { Lerp, Sign } from "../../../_lib/math/Utils";
import { GameHeight, GameWidth, Scenes, TileSize } from "../../Constants";
import { CAMERA_MOVED } from ".././Events";

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

    private viewRect: Rectangle;
    private scale: number;
    private scaledTileSize: number;
    private zoom: number = 2;

    private baseViewWidth: number = 0;
    private baseViewHeight: number = 0;
    private currentZ: number = 0;

    constructor(private cameraControl?: ICameraControl) {
        super();
        this.AddToScene(Scenes.GAME);
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
        this.currentZ = z;
    }

     protected OnInitialise() {

        this.viewRect = new Rectangle(0, 0, Math.floor(GameWidth / TileSize / this.Zoom), Math.floor(GameHeight / TileSize / this.Zoom));
        this.scale = Math.min(GameWidth / this.viewRect.width / TileSize, GameHeight / this.viewRect.height / TileSize);
        this.scaledTileSize = TileSize * this.scale;

        this.baseViewWidth = this.viewRect.width;
        this.baseViewHeight = this.viewRect.height;

        if(this.cameraControl) {
            this.game.ticker.add(this.GetInput, this);
        }
    }

    private GetInput(): void {
        const n = this.cameraControl.Get().rotation;
        this.game.sceneManager.GetScene(Scenes.GAME).root.rotation += n.x * 0.1;
    }
}
