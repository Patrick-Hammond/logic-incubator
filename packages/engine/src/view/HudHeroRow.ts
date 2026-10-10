import {BitmapText, Container, Sprite, Texture} from "pixi.js";
import AssetFactory from "@logic-incubator/lib/loading/AssetFactory";
import UiTheme from "@logic-incubator/ui/UiTheme";
import UiIconRow from "@logic-incubator/ui/widgets/UiIconRow";
import UiItemSlot from "@logic-incubator/ui/widgets/UiItemSlot";
import UiProgressBar from "@logic-incubator/ui/widgets/UiProgressBar";
import {CreateText} from "@logic-incubator/ui/widgets/UiText";
import {InventorySize} from "../level/entities/Inventory";
import {LightSpellState, LightSpellStatusOf} from "../level/entities/LightSpell";
import type Hero from "../sim/Hero";

/** What a HUD row shows of a hero - `Hero` has it all. */
export type HudHero = Pick<Hero, "Alive" | "Health" | "Gold" | "EquippedWeapon" | "Inventory" | "Spell">;

/** The hearts' pictures, if the game has its own (see `PlayerSetup.hearts`). */
export type HeartTextures = {full: Texture; half: Texture; empty: Texture};

const HalfHeartsPerHeart = 2;
/** A row's hearts are smaller than the lone hero's panel's - drawn this many times as big. */
const HeartScale = 2;
const HeartGap = 4;
const GoldIcon = "coin_anim";
/** The coin and each item are shown at the largest whole-number size that fits these boxes. */
const GoldBox = 28;
const ItemBox = 24;
const ItemGap = 4;
/** The skin's bar the light spell is shown with - see `Hud`. */
const SpellBar = "mp";
const SpellBarWidth = 110;
const Gap = 10;
/** How solid a fallen hero's row is drawn. */
const FallenAlpha = 0.4;

/** What a light spell's state reads as: READY, or LIT / RECHARGING and the seconds left. */
export function SpellStatusText(spell: LightSpellState): string {
    const status = LightSpellStatusOf(spell);
    const seconds = Math.ceil(status.seconds);
    const words = {ready: "READY", lit: "LIT", recharging: "RECHARGING"};
    return words[status.state] + (seconds > 0 ? " " + seconds : "");
}

/** The largest whole-number scale that fits a picture into a `box`-sized square - a fraction for one bigger than it. */
export function FitScale(texture: Texture, box: number): number {
    const longest = Math.max(texture.width, texture.height);
    return longest > box ? 1 / Math.ceil(longest / box) : Math.max(1, Math.floor(box / longest));
}

/** The picture for a sprite name, or null (with a warning, once per name) if the sprite sheet hasn't it. */
export function TextureOf(name: string | null): Texture | null {
    if (!name) {
        return null;
    }
    if (!AssetFactory.inst.Has(name)) {
        AssetFactory.inst.WarnMissing(name);
        return null;
    }
    return AssetFactory.inst.CreateTexture(name);
}

/**
 * One hero's row in the HUD panel when a party plays (see `Hud.RenderHeroes`): who they are and their hearts, their
 * weapon, gold and light spell, and the items they carry - dimmed once they've fallen. `rowWidth` is the room it has.
 * Redrawn only where something changed.
 */
export default class HudHeroRow extends Container {
    private heading: BitmapText;
    private hearts: UiIconRow | null = null;
    private weapon: UiItemSlot;
    private goldIcon: Sprite;
    private goldText: BitmapText;
    private spellBar: UiProgressBar | null = null;
    private spellText: BitmapText;
    private items: Sprite[] = [];
    private shown = {hearts: "", gold: -1, weapon: "", items: "", spell: "", alive: true};

    constructor(private theme: UiTheme, private index: number, private rowWidth: number, private heartTextures: HeartTextures | undefined) {
        super();
        this.heading = CreateText(theme, "PLAYER " + (index + 1), {colour: "muted"});
        this.addChild(this.heading);

        const top = Math.ceil(this.heading.textHeight) + Gap;
        this.weapon = new UiItemSlot(theme, "default");
        this.weapon.position.set(0, top);
        this.addChild(this.weapon);

        const besideWeapon = this.weapon.SlotSize + Gap;
        this.goldIcon = new Sprite(Texture.EMPTY);
        this.goldIcon.anchor.set(0.5);
        this.goldIcon.position.set(besideWeapon + GoldBox / 2, top + GoldBox / 2);
        this.goldText = CreateText(theme, "0", {colour: "text"});
        this.goldText.position.set(besideWeapon + GoldBox + 6, Math.round(top + (GoldBox - this.goldText.textHeight) / 2));
        this.addChild(this.goldIcon, this.goldText);

        const spellY = top + GoldBox + 4;
        let spellX = besideWeapon;
        if (theme.skin.bars[SpellBar]) {
            this.spellBar = new UiProgressBar(theme, SpellBar, SpellBarWidth, 1);
            this.spellBar.position.set(spellX, spellY);
            this.addChild(this.spellBar);
            spellX += SpellBarWidth + 8;
        }
        this.spellText = CreateText(theme, "", {colour: "text"});
        this.spellText.position.set(spellX, spellY);
        this.addChild(this.spellText);
        this.ShowSpell(false);

        const itemsY = top + this.weapon.SlotSize + 6;
        for (let i = 0; i < InventorySize; i++) {
            const item = new Sprite(Texture.EMPTY);
            item.anchor.set(0.5);
            item.position.set(i * (ItemBox + ItemGap) + ItemBox / 2, itemsY + ItemBox / 2);
            item.visible = false;
            this.items.push(item);
            this.addChild(item);
        }
    }

    /** How tall a row is, laid out as the constructor does - what `Hud` spaces them by at the least. */
    static Height(theme: UiTheme): number {
        const heading = CreateText(theme, "PLAYER 1", {colour: "muted"});
        const slot = new UiItemSlot(theme, "default");
        const height = Math.ceil(heading.textHeight) + Gap + slot.SlotSize + 6 + ItemBox;
        heading.destroy();
        slot.destroy();
        return height;
    }

    Render(hero: HudHero): void {
        this.RenderHearts(hero);
        this.RenderGold(hero.Gold.amount);
        this.RenderWeapon(hero.EquippedWeapon.icon);
        this.RenderItems(hero.Inventory.slots);
        this.RenderSpell(hero.Spell);
        if (hero.Alive !== this.shown.alive) {
            this.shown.alive = hero.Alive;
            this.alpha = hero.Alive ? 1 : FallenAlpha;
            this.heading.text = "PLAYER " + (this.index + 1) + (hero.Alive ? "" : "  DOWN");
        }
    }

    destroy(options?: {children?: boolean; texture?: boolean; baseTexture?: boolean}): void {
        super.destroy({children: true, ...options});
    }

    private RenderHearts(hero: HudHero): void {
        const health = hero.Health;
        const signature = health.hitPoints + "/" + health.max;
        if (signature === this.shown.hearts) {
            return;
        }
        this.shown.hearts = signature;
        const count = Math.ceil(health.max / HalfHeartsPerHeart);
        if (!this.hearts || this.hearts.Count !== count) {
            if (this.hearts) {
                this.hearts.destroy();
            }
            const options = this.heartTextures ? {textures: this.heartTextures, scale: HeartScale, gap: HeartGap} : {};
            this.hearts = new UiIconRow(this.theme, "hearts", count, options);
            this.hearts.position.set(Math.round(this.rowWidth - this.hearts.RowWidth), 0);
            this.addChild(this.hearts);
        }
        this.hearts.SetValue(health.hitPoints, count * HalfHeartsPerHeart);
    }

    private RenderGold(amount: number): void {
        if (amount === this.shown.gold) {
            return;
        }
        this.shown.gold = amount;
        this.goldText.text = String(amount);
        const texture = TextureOf(GoldIcon);
        this.goldIcon.visible = !!texture;
        if (texture) {
            this.goldIcon.texture = texture;
            this.goldIcon.scale.set(FitScale(texture, GoldBox));
        }
    }

    private RenderWeapon(icon: string): void {
        if (icon === this.shown.weapon) {
            return;
        }
        this.shown.weapon = icon;
        const texture = TextureOf(icon);
        this.weapon.SetItem(texture ? {texture} : null);
    }

    private RenderItems(slots: ReadonlyArray<string | null>): void {
        const signature = slots.join("|");
        if (signature === this.shown.items) {
            return;
        }
        this.shown.items = signature;
        // Packed from the left, gaps in the inventory left out - there's no room for empty slots here.
        const textures = slots.map(name => TextureOf(name)).filter(texture => !!texture);
        this.items.forEach((item, i) => {
            const texture = textures[i];
            item.visible = !!texture;
            if (texture) {
                item.texture = texture;
                item.scale.set(FitScale(texture, ItemBox));
            }
        });
    }

    private RenderSpell(spell: LightSpellState | null): void {
        if (!spell) {
            if (this.shown.spell) {
                this.shown.spell = "";
                this.ShowSpell(false);
            }
            return;
        }
        const text = SpellStatusText(spell);
        const fill = LightSpellStatusOf(spell).fill;
        const signature = text + "|" + Math.round(fill * 200);
        if (signature === this.shown.spell) {
            return;
        }
        if (!this.shown.spell) {
            this.ShowSpell(true);
        }
        this.shown.spell = signature;
        this.spellText.text = text;
        if (this.spellBar) {
            this.spellBar.Value = fill;
        }
    }

    private ShowSpell(visible: boolean): void {
        this.spellText.visible = visible;
        if (this.spellBar) {
            this.spellBar.visible = visible;
        }
    }
}
