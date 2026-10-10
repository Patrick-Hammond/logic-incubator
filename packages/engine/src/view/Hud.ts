import {BitmapText, Container, Sprite, Texture} from "pixi.js";
import GameComponent from "@logic-incubator/lib/game/GameComponent";
import AssetFactory from "@logic-incubator/lib/loading/AssetFactory";
import UiLayer from "@logic-incubator/ui/UiLayer";
import UiIconRow from "@logic-incubator/ui/widgets/UiIconRow";
import UiInventoryGrid from "@logic-incubator/ui/widgets/UiInventoryGrid";
import UiItemSlot, {SlotItem} from "@logic-incubator/ui/widgets/UiItemSlot";
import UiPanel from "@logic-incubator/ui/widgets/UiPanel";
import UiProgressBar from "@logic-incubator/ui/widgets/UiProgressBar";
import {CreateText} from "@logic-incubator/ui/widgets/UiText";
import {GameHeight, HudWidth, PlayWidth} from "../Constants";
import type {PlayerSetup} from "../DungeonMain";
import {Gold} from "../level/entities/Gold";
import {Health} from "../level/entities/Health";
import {Inventory, InventorySize} from "../level/entities/Inventory";
import {HeldKey, KeyRing} from "../level/entities/Keys";
import {LightSpellState, LightSpellStatusOf} from "../level/entities/LightSpell";
import HudHeroRow, {FitScale, HeartTextures, HudHero, SpellStatusText, TextureOf} from "./HudHeroRow";

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
/** The skin's bar the light spell is shown with - blue, for magic. Without it in the skin there's just the text. */
const SpellBar = "mp";

/**
 * The right-hand HUD panel, built from the UI kit (`packages/ui`) in whatever skin the game has loaded. For one hero: a panel with the hearts at the top, the gold, the equipped
 * weapon, the inventory grid, the keys carried and - for a hero who has one - the light spell: whether it's ready, lit or recharging, with a bar and the seconds left. For a party
 * (see `RenderHeroes`): a row per hero - their hearts, weapon, gold, light spell and items (see `HudHeroRow`) - and the team's keys at the bottom. `Camera` reserves `PlayWidth`
 * of the canvas so gameplay never renders under it. It only shows things - nothing in it takes the pointer.
 *
 * Hearts are the game's own pictures if `PlayerSetup.hearts` gives them (and they are in the sprite sheet), the skin's otherwise.
 */
export default class Hud extends GameComponent {
    private layer!: UiLayer;
    private heartsTextures: HeartTextures | undefined;
    /** Everything the lone hero's panel shows, hidden while a party's rows show instead. */
    private solo!: Container;
    /** A party's rows and keys, made for the party's size (see `RenderHeroes`) - null for a lone hero. */
    private party: Container | null = null;
    private rows: HudHeroRow[] = [];
    private teamKeys: UiInventoryGrid | null = null;
    private shownTeamKeys = "";
    private teamKeyRing: KeyRing = {keys: []};
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

    private spellHeading!: BitmapText;
    private spellBar: UiProgressBar | null = null;
    private spellText!: BitmapText;
    private shownSpell = "";

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
        this.solo = new Container();
        this.layer.root.addChild(panel, this.solo);

        const goldY = 84;
        this.goldIcon = new Sprite(Texture.EMPTY);
        this.goldIcon.anchor.set(0.5);
        this.goldIcon.position.set(inner + GoldBox / 2, goldY + GoldBox / 2);
        this.goldText = CreateText(theme, "0", {colour: "text"});
        this.goldText.position.set(inner + GoldBox + 8, goldY + Math.round((GoldBox - this.goldText.textHeight) / 2));
        this.solo.addChild(this.goldIcon, this.goldText);

        const heading = (text: string, y: number) => {
            const label = CreateText(theme, text, {colour: "muted"});
            label.position.set(inner, y);
            this.solo.addChild(label);
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

        this.solo.addChild(this.weaponSlot, this.inventorySlots, this.keySlots);

        // Hidden until the player has a light spell (see `RenderSpell`).
        this.spellHeading = CreateText(theme, "SPELL", {colour: "muted"});
        this.spellHeading.position.set(inner, keysY + this.keySlots.GridHeight + 24);
        this.solo.addChild(this.spellHeading);
        let spellY = this.spellHeading.y + Math.ceil(this.spellHeading.textHeight) + LabelGap;
        if (theme.skin.bars[SpellBar]) {
            this.spellBar = new UiProgressBar(theme, SpellBar, this.keySlots.GridWidth, 1);
            this.spellBar.position.set(inner, spellY);
            this.solo.addChild(this.spellBar);
            spellY += this.spellBar.BarHeight + LabelGap;
        }
        this.spellText = CreateText(theme, "", {colour: "text"});
        this.spellText.position.set(inner, spellY);
        this.solo.addChild(this.spellText);
        this.ShowSpell(false);
    }

    /** The lone hero's panel: `spell` is their light spell - null hides that section, for a hero without one. */
    Render(health: Health, gold: Gold, weaponIcon: string, inventory: Inventory, keys: KeyRing, spell: LightSpellState | null = null): void {
        this.ShowParty(0);
        this.RenderHearts(health);
        this.RenderGold(gold);
        this.RenderWeapon(weaponIcon);
        this.RenderInventory(inventory);
        this.RenderKeys(keys);
        this.RenderSpell(spell);
    }

    /**
     * Every hero, in slot order, the fallen included: one gets the lone hero's panel (`Render`); a party gets a row
     * each and the team's keys - every key any of them carries, which open their doors for all (see `World`).
     */
    RenderHeroes(heroes: ReadonlyArray<HudHero & {Keys: KeyRing}>): void {
        if (heroes.length === 1) {
            const hero = heroes[0];
            this.Render(hero.Health, hero.Gold, hero.EquippedWeapon.icon, hero.Inventory, hero.Keys, hero.Spell);
            return;
        }
        this.ShowParty(heroes.length);
        heroes.forEach((hero, i) => this.rows[i].Render(hero));
        const held: HeldKey[] = [];
        heroes.forEach(hero => hero.Keys.keys.forEach(key => held.push(key)));
        this.teamKeyRing.keys = held;
        this.RenderTeamKeys(this.teamKeyRing);
    }

    /** Shows the party's rows for `count` heroes - made afresh when the count changes - or, for 0, the lone hero's panel. */
    private ShowParty(count: number): void {
        if (count === this.rows.length) {
            return;
        }
        if (this.party) {
            this.party.destroy({children: true});
            this.party = null;
            this.rows = [];
            this.teamKeys = null;
            this.shownTeamKeys = "";
        }
        this.solo.visible = count === 0;
        if (count === 0) {
            return;
        }
        const theme = this.layer.Theme;
        const scale = theme.Scale;
        const inner = PlayWidth / scale + Margin;
        const width = HudWidth / scale - Margin * 2;
        const bottom = GameHeight / scale - Margin;
        const party = this.party = new Container();
        this.layer.root.addChild(party);

        const keys = this.teamKeys = new UiInventoryGrid(theme, "default", SlotColumns, Math.ceil(KeySlots / SlotColumns));
        keys.position.set(inner, Math.round(bottom - keys.GridHeight));
        const heading = CreateText(theme, "KEYS", {colour: "muted"});
        heading.position.set(inner, Math.round(keys.y - LabelGap - heading.textHeight));
        party.addChild(heading, keys);

        const space = (heading.y - 24 - Margin) / count;
        const spacing = Math.max(HudHeroRow.Height(theme) + 12, Math.floor(space));
        for (let i = 0; i < count; i++) {
            const row = new HudHeroRow(theme, i, width, this.heartsTextures);
            row.position.set(inner, Margin + i * spacing);
            party.addChild(row);
            this.rows.push(row);
        }
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
            this.solo.addChild(this.hearts);
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
        const texture = TextureOf(GoldIcon);
        this.goldIcon.visible = !!texture;
        if (texture) {
            this.goldIcon.texture = texture;
            this.goldIcon.scale.set(FitScale(texture, GoldBox));
        }
    }

    private RenderWeapon(weaponIcon: string): void {
        if (weaponIcon === this.shownWeaponIcon) {
            return;
        }
        this.shownWeaponIcon = weaponIcon;
        const texture = TextureOf(weaponIcon);
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
        this.shownKeys = this.FillKeys(this.keySlots, keys, this.shownKeys);
    }

    private RenderTeamKeys(keys: KeyRing): void {
        if (this.teamKeys) {
            this.shownTeamKeys = this.FillKeys(this.teamKeys, keys, this.shownTeamKeys);
        }
    }

    /** Fills a keys grid with these keys, unless it already shows them (`shown`, what it last returned) - returns what it shows now. */
    private FillKeys(grid: UiInventoryGrid, keys: KeyRing, shown: string): string {
        // The id a door's lock has to match is the corner label, so the player can tell their keys apart.
        const held = keys.keys.slice(0, KeySlots);
        const signature = held.map(key => key.id + ":" + key.sprite).join("|");
        if (signature !== shown) {
            grid.SetItems(held.map(key => {
                const texture = TextureOf(key.sprite);
                // A key the sprite sheet has no picture for still shows its id.
                return {texture: texture || Texture.EMPTY, label: String(key.id)};
            }));
        }
        return signature;
    }

    private RenderSpell(spell: LightSpellState | null): void {
        if (!spell) {
            if (this.shownSpell) {
                this.shownSpell = "";
                this.ShowSpell(false);
            }
            return;
        }
        const status = LightSpellStatusOf(spell);
        const text = SpellStatusText(spell);
        // Redrawn only when the text or the bar (to a pixel's worth or so) changes.
        const signature = text + "|" + Math.round(status.fill * 200);
        if (signature === this.shownSpell) {
            return;
        }
        if (!this.shownSpell) {
            this.ShowSpell(true);
        }
        this.shownSpell = signature;
        this.spellText.text = text;
        if (this.spellBar) {
            this.spellBar.Value = status.fill;
        }
    }

    private ShowSpell(visible: boolean): void {
        this.spellHeading.visible = this.spellText.visible = visible;
        if (this.spellBar) {
            this.spellBar.visible = visible;
        }
    }

    private ItemOf(name: string | null): SlotItem | null {
        const texture = TextureOf(name);
        return texture ? {texture} : null;
    }
}
