import {Graphics, Sprite, Text, Texture} from "pixi.js";
import GameComponent from "@logic-incubator/lib/game/GameComponent";
import AssetFactory from "@logic-incubator/lib/loading/AssetFactory";
import { GameHeight, GameWidth, PlayWidth, Scenes } from "../Constants";
import type {PlayerSetup} from "../DungeonMain";
import {Gold} from "../level/entities/Gold";
import {Health} from "../level/entities/Health";
import {Inventory, InventorySize} from "../level/entities/Inventory";

const HeartScale = 3;
const Margin = 16;
const Gap = 6;

const GoldIcon = "coin_anim";
const GoldY = 80;

const WeaponY = 140;
const WeaponBoxSize = 48;

const InventoryY = 220;
const SlotSize = 36;
const SlotGap = 8;
const SlotColumns = 4;

const TextStyle = { fontFamily: "Arial", fontSize: 14, fill: 0xffffff, stroke: 0x000000, strokeThickness: 3 };
const LabelStyle = { fontFamily: "Arial", fontSize: 12, fill: 0xcccccc, stroke: 0x000000, strokeThickness: 2 };

/**
 * The right-hand HUD panel: hearts (top-right, unchanged position), gold,
 * the equipped weapon and the inventory grid. `Camera` reserves `PlayWidth`
 * of the canvas so gameplay never renders under this panel.
 */
export default class Hud extends GameComponent {
    private hearts: Sprite[] = [];
    private shownHitPoints = -1;
    private shownMax = -1;
    private heartsUsable: boolean;

    private goldIcon: Sprite;
    private goldText: Text;
    private shownGold = -1;

    private weaponIcon: Sprite;
    private shownWeaponIcon = "";

    private slotIcons: Sprite[] = [];

    constructor(private sprites: PlayerSetup["hearts"]) {
        super();

        const names = [sprites.full, sprites.half, sprites.empty];
        names.filter(name => !AssetFactory.inst.Has(name)).forEach(name => AssetFactory.inst.WarnMissing(name));
        this.heartsUsable = names.every(name => AssetFactory.inst.Has(name));

        this.root.interactive = this.root.interactiveChildren = false;
        this.AddToScene(Scenes.GAME);

        this.DrawPanel();
        this.goldIcon = this.CreateIcon(PlayWidth + Margin, GoldY, WeaponBoxSize);
        this.goldText = this.CreateText(PlayWidth + Margin + WeaponBoxSize, GoldY + 8);
        this.CreateLabel("Weapon", PlayWidth + Margin, WeaponY - 18);
        this.CreateBox(PlayWidth + Margin, WeaponY, WeaponBoxSize);
        this.weaponIcon = this.CreateIcon(PlayWidth + Margin, WeaponY, WeaponBoxSize);
        this.CreateLabel("Inventory", PlayWidth + Margin, InventoryY - 18);
        for (let i = 0; i < InventorySize; i++) {
            const x = PlayWidth + Margin + (i % SlotColumns) * (SlotSize + SlotGap);
            const y = InventoryY + Math.floor(i / SlotColumns) * (SlotSize + SlotGap);
            this.CreateBox(x, y, SlotSize);
            this.slotIcons.push(this.CreateIcon(x, y, SlotSize));
        }
    }

    Render(health: Health, gold: Gold, weaponIcon: string, inventory: Inventory): void {
        this.RenderHearts(health);
        this.RenderGold(gold);
        this.RenderWeapon(weaponIcon);
        this.RenderInventory(inventory);
    }

    private DrawPanel(): void {
        const panel = new Graphics();
        panel.beginFill(0x000000, 0.55);
        panel.drawRect(PlayWidth, 0, GameWidth - PlayWidth, GameHeight);
        panel.endFill();
        panel.lineStyle(2, 0x444444);
        panel.moveTo(PlayWidth, 0);
        panel.lineTo(PlayWidth, GameHeight);
        this.root.addChild(panel);
    }

    private CreateBox(x: number, y: number, size: number): void {
        const box = new Graphics();
        box.lineStyle(2, 0x666666);
        box.drawRect(x, y, size, size);
        this.root.addChild(box);
    }

    /** A sprite centred within a `boxSize` square at `x, y` - texture/visibility/scale set later via `SetIcon`. */
    private CreateIcon(x: number, y: number, boxSize: number): Sprite {
        const icon = new Sprite(Texture.EMPTY);
        icon.anchor.set(0.5);
        icon.position.set(x + boxSize / 2, y + boxSize / 2);
        this.root.addChild(icon);
        return icon;
    }

    private CreateText(x: number, y: number): Text {
        const text = new Text("0", TextStyle);
        text.position.set(x, y);
        this.root.addChild(text);
        return text;
    }

    private CreateLabel(label: string, x: number, y: number): void {
        const text = new Text(label, LabelStyle);
        text.position.set(x, y);
        this.root.addChild(text);
    }

    /** Sets an icon's texture to `name`'s, sized to fit within `boxSize`; hides it if `name` is falsy or unknown. */
    private SetIcon(icon: Sprite, name: string | null, boxSize: number): void {
        if (!name || !AssetFactory.inst.Has(name)) {
            if (name) {
                AssetFactory.inst.WarnMissing(name);
            }
            icon.visible = false;
            return;
        }
        icon.texture = AssetFactory.inst.CreateTexture(name);
        icon.scale.set(Math.min(1, (boxSize - 6) / Math.max(icon.texture.width, icon.texture.height)));
        icon.visible = true;
    }

    private RenderHearts(health: Health): void {
        if (!this.heartsUsable || (health.hitPoints === this.shownHitPoints && health.max === this.shownMax)) {
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

    private RenderGold(gold: Gold): void {
        if (gold.amount === this.shownGold) {
            return;
        }
        this.shownGold = gold.amount;
        this.goldText.text = String(gold.amount);
        this.SetIcon(this.goldIcon, GoldIcon, WeaponBoxSize);
    }

    private RenderWeapon(weaponIcon: string): void {
        if (weaponIcon === this.shownWeaponIcon) {
            return;
        }
        this.shownWeaponIcon = weaponIcon;
        this.SetIcon(this.weaponIcon, weaponIcon, WeaponBoxSize);
    }

    private RenderInventory(inventory: Inventory): void {
        inventory.slots.forEach((item, i) => this.SetIcon(this.slotIcons[i], item, SlotSize));
    }
}
