import {Sprite} from "pixi.js";
import GameComponent from "../../../_lib/game/GameComponent";
import AssetFactory from "../../../_lib/loading/AssetFactory";
import {GameWidth, Scenes} from "../../Constants";
import type {PlayerSetup} from "../DungeonMain";
import {Health} from "../level/entities/Health";

const HeartScale = 3;
const Margin = 16;
const Gap = 6;

/** The player's hearts, top-right of the screen (clear of the dev stats panel, top-left) - two hit points a heart, the last half-full on an odd count. */
export default class Hud extends GameComponent {
    private hearts: Sprite[] = [];
    private shownHitPoints = -1;
    private shownMax = -1;
    private usable: boolean;

    constructor(private sprites: PlayerSetup["hearts"]) {
        super();

        const names = [sprites.full, sprites.half, sprites.empty];
        names.filter(name => !AssetFactory.inst.Has(name)).forEach(name => AssetFactory.inst.WarnMissing(name));
        this.usable = names.every(name => AssetFactory.inst.Has(name));

        this.root.interactive = this.root.interactiveChildren = false;
        this.AddToScene(Scenes.GAME);
    }

    Render(health: Health): void {
        if (!this.usable || (health.hitPoints === this.shownHitPoints && health.max === this.shownMax)) {
            return;
        }
        this.shownHitPoints = health.hitPoints;
        this.shownMax = health.max;

        const count = Math.ceil(health.max / 2);
        while (this.hearts.length < count) {
            const heart = AssetFactory.inst.CreateSprite(this.sprites.full);
            heart.scale.set(HeartScale);
            this.root.addChild(heart);
            this.hearts.push(heart);
        }
        this.hearts.forEach((heart, i) => {
            heart.visible = i < count;
            heart.position.set(GameWidth - Margin - (count - i) * (heart.width + Gap) + Gap, Margin);
            const left = health.hitPoints - i * 2;
            const name = left >= 2 ? this.sprites.full : left === 1 ? this.sprites.half : this.sprites.empty;
            heart.texture = AssetFactory.inst.CreateTexture(name);
        });
    }
}
