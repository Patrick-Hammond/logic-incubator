import { Point } from "pixi.js";
import GameComponent from "@logic-incubator/lib/game/GameComponent";
import { Vec2Like } from "@logic-incubator/lib/math/Geometry";
import UiLayer from "@logic-incubator/ui/UiLayer";
import UiTooltip from "@logic-incubator/ui/widgets/UiTooltip";
import { GameHeight, PlayWidth, TileSize } from "../Constants";
import Level, { Talker } from "../level/Level";
import { DialogContext } from "../story/DialogScript";
import Shouter, { HasShouts, InEarshot, ShoutLines } from "../story/Shouts";
import { Camera } from "./Camera";
import { TileRect } from "./helpers/TilePlacement";

/** The skin's tooltip a shout is drawn in: a speech bubble, its tail pointing at the NPC. */
const BubbleVariant = "speech";

type Shout = { talker: Talker; shouter: Shouter; bubble: UiTooltip; lines: () => string[] };

/**
 * What the NPCs shout (see `Shouts`), in speech bubbles over them: while a hero played here is in earshot and the NPC is
 * in sight, a line from their script's `shout` part every so often, in the skin's `speech` tooltip pointing at their
 * sprite. `DungeonMain` gives it the level's NPCs as a level starts (`Begin`) - none in a game without talks - moves it
 * on every frame (`Render`) and hushes it as a talk starts (`Hush`). It only shows things - nothing in it takes the pointer.
 */
export default class ShoutView extends GameComponent {
    private layer!: UiLayer;
    private shouts: Shout[] = [];

    constructor(private readonly level: Level, private readonly camera: Camera) {
        super();
    }

    protected OnInitialise(): void {
        this.layer = this.Attach(new UiLayer({ input: false }));
    }

    protected OnDestroy(): void {
        this.shouts = [];
    }

    /** A level has started with these NPCs: the ones whose script has a `shout` part shout, saying what's true by `context`. */
    Begin(talkers: ReadonlyArray<Talker>, context: DialogContext): void {
        this.shouts.forEach(shout => shout.bubble.destroy());
        this.shouts = talkers.filter(talker => HasShouts(talker.script)).map(talker => {
            const bubble = new UiTooltip(this.layer.Theme, BubbleVariant);
            this.layer.root.addChild(bubble);
            return { talker, shouter: new Shouter(), bubble, lines: () => ShoutLines(talker.script, context) };
        });
    }

    /** Stops every shout now, and each NPC keeps quiet a while - as a talk starts. */
    Hush(): void {
        this.shouts.forEach(shout => {
            shout.shouter.Hush();
            shout.bubble.Hide();
        });
    }

    /** Moves the shouts on by `seconds` and draws them, with `hearers` the centres (in pixels) of the heroes who can hear them - the ones played here, still standing. */
    Render(seconds: number, hearers: ReadonlyArray<Vec2Like>): void {
        for (let i = 0; i < this.shouts.length; i++) {
            const shout = this.shouts[i];
            const { talker } = shout;
            const seen = this.level.IsCellVisible(talker.x, talker.y);
            const near = seen && hearers.some(centre => InEarshot(centre, talker, TileSize));
            const text = shout.shouter.Update(seconds, near, shout.lines);
            const at = text !== null && seen ? this.Place(talker) : null;
            if (text === null || !at) {
                shout.bubble.Hide();
                continue;
            }
            shout.bubble.ShowAt(at, { text }, this.Room());
            shout.bubble.alpha = shout.shouter.Fade;
        }
    }

    /** Where the NPC's sprite is drawn, in the layer's UI pixels - or null while it's off the play area, where a bubble would only cling to its edge. */
    private Place(talker: Talker): { x: number; y: number; width: number; height: number } | null {
        const camera = this.camera;
        const tile = talker.tile;
        // The figure, not the see-through room round it (a character's frame is taller than they are): the part the atlas
        // kept when it trimmed the sprite. One frame of an animation, the tile's own, so the bubble doesn't bob with it.
        const texture = tile ? tile.texture : null;
        const trim = texture ? texture.trim : null;
        const size = trim || (texture ? { width: texture.width, height: texture.height } : { width: TileSize, height: TileSize });
        const offset = tile ? tile.pixelOffset : { x: 0, y: 0 };
        const rect = TileRect(
            { centre: camera.ViewRect.center, baseWidth: camera.BaseViewWidth, baseHeight: camera.BaseViewHeight, scale: camera.Scale, zoom: camera.EffectiveZoom, currentZ: camera.CurrentZ },
            talker,
            this.level.HeightAt(talker.x, talker.y),
            size,
            trim ? { x: offset.x - trim.x, y: offset.y - trim.y } : offset
        );
        // From the camera's root, through the canvas, to this layer.
        const topLeft = this.layer.root.toLocal(camera.root.toGlobal(new Point(rect.x, rect.y)));
        const bottomRight = this.layer.root.toLocal(camera.root.toGlobal(new Point(rect.x + rect.width, rect.y + rect.height)));
        const room = this.Room();
        const middle = (topLeft.x + bottomRight.x) / 2;
        if (middle < room.x || middle > room.x + room.width || bottomRight.y < room.y || topLeft.y > room.y + room.height) {
            return null;
        }
        return { x: topLeft.x, y: topLeft.y, width: bottomRight.x - topLeft.x, height: bottomRight.y - topLeft.y };
    }

    /** The play area, in the layer's UI pixels - the bubbles stay in it. */
    private Room(): { x: number; y: number; width: number; height: number } {
        const scale = this.layer.Theme.Scale;
        return { x: 0, y: 0, width: PlayWidth / scale, height: GameHeight / scale };
    }
}
