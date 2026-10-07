import {BitmapText, Sprite, Texture} from "pixi.js";
import GameComponent from "@logic-incubator/lib/game/GameComponent";
import AssetFactory from "@logic-incubator/lib/loading/AssetFactory";
import UiLayer from "@logic-incubator/ui/UiLayer";
import UiIconRow from "@logic-incubator/ui/widgets/UiIconRow";
import UiInventoryGrid from "@logic-incubator/ui/widgets/UiInventoryGrid";
import UiItemSlot, {SlotItem} from "@logic-incubator/ui/widgets/UiItemSlot";
import UiPanel from "@logic-incubator/ui/widgets/UiPanel";
import {CreateText} from "@logic-incubator/ui/widgets/UiText";
import {GameHeight, HudWidth, PlayWidth} from "../Constants";
import type {PlayerSetup} from "../DungeonMain";
import {Gold} from "../level/entities/Gold";
import {Health} from "../level/entities/Health";
import {Inventory, InventorySize} from "../level/entities/Inventory";
import {KeyRing} from "../level/entities/Keys";

/** The game's own hearts are small pixel art, drawn this many times as big. */
const HeartScale = 3;
const HeartGap = 6;
/** Room round everything in the panel, in UI pixels. */
const Margin = 20;
const LabelGap = 4;

const GoldIcon = "coin_anim";
/** The coin is shown at the largest whole-number size that fits this box. */
const GoldBox = 48;

const HalfHeartsPerHeart = 2;
const SlotColumns = 4;
/** Keys the panel has room to show - one id each, so a level would need more than this many locks to run out. */
const KeySlots = 8;

/**
 * The right-hand HUD panel, built from the UI kit (`packages/ui`) in whatever skin the game has loaded: a panel with the hearts at the top, the gold, the equipped weapon, the
 * inventory grid and the keys carried. `Camera` reserves `PlayWidth` of the canvas so gameplay never renders under it. It only shows things - nothing in it takes the pointer.
 *
 * Hearts are the game's own pictures if `PlayerSetup.hearts` gives them (and they are in the sprite sheet), the skin's otherwise.
 */
export default class Hud extends GameComponent {
    private layer!: UiLayer;
    private heartsTextures: {full: Texture; half: Texture; empty: Texture} | undefined;
    private hearts: UiIconRow | undefined;
    private shownHitPoints = -1;
    private shownMax = -1;

    private goldIcon!: Sprite;
    private goldText!: BitmapText;
    private shownGold = -1;

    private weaponSlot!: UiItemSlot;
    private shownWeaponIcon = "";

    private inventorySlots!: UiInventoryGrid;
    private shownInventory = "";
    private keySlots!: UiInventoryGrid;
    private shownKeys = "";

    constructor(private sprites?: PlayerSetup["hearts"]) {
        super();
    }

    protected OnInitialise(): void {
        const sprites = this.sprites;
        if (sprites) {
            const names = [sprites.full, sprites.half, sprites.empty];
            names.filter(name => !AssetFactory.inst.Has(name)).forEach(name => AssetFactory.inst.WarnMissing(name));
            if (names.every(name => AssetFactory.inst.Has(name))) {
                this.heartsTextures = {
                    full: AssetFactory.inst.CreateTexture(sprites.full),
                    half: AssetFactory.inst.CreateTexture(sprites.half),
                    empty: AssetFactory.inst.CreateTexture(sprites.empty)
                };
            }
        }

        this.layer = this.Attach(new UiLayer({input: false}));
        const theme = this.layer.Theme;
        const scale = theme.Scale;
        const left = PlayWidth / scale;
        const inner = left + Margin;

        const panel = new UiPanel(theme, "plain", HudWidth / scale, GameHeight / scale);
        panel.position.set(left, 0);
        this.layer.root.addChild(panel);

        const goldY = 84;
        this.goldIcon = new Sprite(Texture.EMPTY);
        this.goldIcon.anchor.set(0.5);
        this.goldIcon.position.set(inner + GoldBox / 2, goldY + GoldBox / 2);
        this.goldText = CreateText(theme, "0", {colour: "text"});
        this.goldText.position.set(inner + GoldBox + 8, goldY + Math.round((GoldBox - this.goldText.textHeight) / 2));
        this.layer.root.addChild(this.goldIcon, this.goldText);

        const heading = (text: string, y: number) => {
            const label = CreateText(theme, text, {colour: "muted"});
            label.position.set(inner, y);
            this.layer.root.addChild(label);
            return y + Math.ceil(label.textHeight) + LabelGap;
        };

        const weaponY = heading("WEAPON", 148);
        this.weaponSlot = new UiItemSlot(theme, "default");
        this.weaponSlot.position.set(inner, weaponY);

        const inventoryY = heading("INVENTORY", weaponY + this.weaponSlot.SlotSize + 24);
        this.inventorySlots = new UiInventoryGrid(theme, "default", SlotColumns, Math.ceil(InventorySize / SlotColumns));
        this.inventorySlots.position.set(inner, inventoryY);

        const keysY = heading("KEYS", inventoryY + this.inventorySlots.GridHeight + 24);
        this.keySlots = new UiInventoryGrid(theme, "default", SlotColumns, Math.ceil(KeySlots / SlotColumns));
        this.keySlots.position.set(inner, keysY);

        this.layer.root.addChild(this.weaponSlot, this.inventorySlots, this.keySlots);
    }

    Render(health: Health, gold: Gold, weaponIcon: string, inventory: Inventory, keys: KeyRing): void {
        this.RenderHearts(health);
        this.RenderGold(gold);
        this.RenderWeapon(weaponIcon);
        this.RenderInventory(inventory);
        this.RenderKeys(keys);
    }

    /** The picture for a sprite name, or null (with a warning, once per name) if the sprite sheet hasn't it. */
    private TextureOf(name: string | null): Texture | null {
        if (!name) {
            return null;
        }
        if (!AssetFactory.inst.Has(name)) {
            AssetFactory.inst.WarnMissing(name);
            return null;
        }
        return AssetFactory.inst.CreateTexture(name);
    }

    private RenderHearts(health: Health): void {
        if (health.hitPoints === this.shownHitPoints && health.max === this.shownMax) {
            return;
        }
        const count = Math.ceil(health.max / HalfHeartsPerHeart);
        if (!this.hearts || count !== Math.ceil(this.shownMax / HalfHeartsPerHeart)) {
            // The maximum changed (or this is the first look): a row of the right length, at the panel's top-right.
            if (this.hearts) {
                this.hearts.destroy();
            }
            const options = this.heartsTextures ? {textures: this.heartsTextures, scale: HeartScale, gap: HeartGap} : {};
            this.hearts = new UiIconRow(this.layer.Theme, "hearts", count, options);
            const scale = this.layer.Theme.Scale;
            this.hearts.position.set(Math.round((PlayWidth + HudWidth) / scale - Margin - this.hearts.RowWidth), Margin);
            this.layer.root.addChild(this.hearts);
        }
        this.shownHitPoints = health.hitPoints;
        this.shownMax = health.max;
        // Half-hearts: a heart is two of them, so three of six shows a full heart and a half one.
        this.hearts.SetValue(health.hitPoints, count * HalfHeartsPerHeart);
    }

    private RenderGold(gold: Gold): void {
        if (gold.amount === this.shownGold) {
            return;
        }
        this.shownGold = gold.amount;
        this.goldText.text = String(gold.amount);
        const texture = this.TextureOf(GoldIcon);
        this.goldIcon.visible = !!texture;
        if (texture) {
            this.goldIcon.texture = texture;
            const longest = Math.max(texture.width, texture.height);
            this.goldIcon.scale.set(longest > GoldBox ? 1 / Math.ceil(longest / GoldBox) : Math.max(1, Math.floor(GoldBox / longest)));
        }
    }

    private RenderWeapon(weaponIcon: string): void {
        if (weaponIcon === this.shownWeaponIcon) {
            return;
        }
        this.shownWeaponIcon = weaponIcon;
        const texture = this.TextureOf(weaponIcon);
        this.weaponSlot.SetItem(texture ? {texture} : null);
    }

    private RenderInventory(inventory: Inventory): void {
        const names = inventory.slots.join("|");
        if (names === this.shownInventory) {
            return;
        }
        this.shownInventory = names;
        this.inventorySlots.SetItems(inventory.slots.map(name => this.ItemOf(name)));
    }

    private RenderKeys(keys: KeyRing): void {
        // The id a door's lock has to match is the corner label, so the player can tell their keys apart.
        const held = keys.keys.slice(0, KeySlots);
        const signature = held.map(key => key.id + ":" + key.sprite).join("|");
        if (signature === this.shownKeys) {
            return;
        }
        this.shownKeys = signature;
        this.keySlots.SetItems(held.map(key => {
            const texture = this.TextureOf(key.sprite);
            // A key the sprite sheet has no picture for still shows its id.
            return {texture: texture || Texture.EMPTY, label: String(key.id)};
        }));
    }

    private ItemOf(name: string | null): SlotItem | null {
        const texture = this.TextureOf(name);
        return texture ? {texture} : null;
    }
}
