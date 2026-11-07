import {Container, Texture} from "pixi.js";
import UiTheme from "@logic-incubator/ui/UiTheme";
import {SlotItem} from "@logic-incubator/ui/widgets/UiItemSlot";
import {InventorySize} from "../level/entities/Inventory";
import {LightSpellStatusOf} from "../level/entities/LightSpell";
import type Hero from "../sim/Hero";
import {TextureOf} from "./HudArt";
import HudHeader, {HudHeroInfo} from "./HudHeader";
import {HudPanel} from "./HudSection";
import HudSlotRow from "./HudSlotRow";

/** What the HUD shows of a hero - `Hero` has it all. */
export type HudHero = Pick<Hero, "Alive" | "Gone" | "Away" | "Health" | "Gold" | "Experience" | "EquippedWeapon" | "Inventory" | "Spell">;

/** A row's portrait, and how many times as big the hero is drawn in it. */
const Portrait = 52;
const PortraitScale = 3;
/** Room round a row's contents, inside its panel, and between its header and its slots. */
const Inset = 16;
const SlotsGap = 8;
const SlotSize = 36;
/** How solid the row of a hero who is down, away or gone is drawn. */
const FallenAlpha = 0.4;

/** The icon the HUD shows a light spell as - its own sprite if it names one, else `orb` (see `OrbTexture`). */
export type SpellIcon = (hero: HudHero) => Texture | null;

/**
 * One hero's row when a party plays (see `Hud.RenderHeroes`), on a panel of its own: their portrait, name, gold, hit
 * points and experience (a compact `HudHeader`), and under them a row of slots - their light spell (for a hero who has one) or their weapon,
 * then the items they carry. Dimmed, with DOWN, AWAY or LEFT after their name, once they've fallen or their player has
 * gone. `width` is the room it has. Redrawn only where something changed.
 */
export default class HudHeroRow extends Container {
    private readonly header: HudHeader;
    private readonly slots: HudSlotRow;
    private info: HudHeroInfo;
    private shownStatus = "";

    constructor(theme: UiTheme, index: number, width: number, private readonly spellIcon: SpellIcon, hearts?: Texture) {
        super();
        const inner = width - Inset * 2;
        const panel = HudPanel(theme, width, HudHeroRow.Height());
        this.header = new HudHeader(theme, {width: inner, portrait: Portrait, portraitScale: PortraitScale, compact: true}, hearts);
        this.header.position.set(Inset, Inset);
        this.slots = new HudSlotRow(theme, InventorySize + 1, SlotSize, inner);
        this.slots.position.set(Inset, Inset + Portrait + SlotsGap);
        this.slots.Select(0);
        this.addChild(panel, this.header, this.slots);
        this.info = {name: "PLAYER " + (index + 1), portrait: null, own: false};
        this.header.SetHero(this.info);
    }

    /** How tall a row is. */
    static Height(): number {
        return Inset + Portrait + SlotsGap + SlotSize + Inset - 4;
    }

    /** Who the row is for - see `Hud.SetHeroes`. */
    SetHero(info: HudHeroInfo): void {
        this.info = info;
        this.ShowHero();
    }

    Animate(seconds: number): void {
        this.header.Animate(seconds);
    }

    Render(hero: HudHero): void {
        this.header.Render(hero.Health, hero.Gold.amount, hero.Experience);
        const items: Array<SlotItem | null> = [];
        const keys: string[] = [];
        const spell = hero.Spell;
        if (spell) {
            const status = LightSpellStatusOf(spell);
            const icon = this.spellIcon(hero);
            const seconds = status.seconds > 0 ? String(Math.ceil(status.seconds)) : "";
            items.push(icon ? {texture: icon, label: seconds} : null);
            keys.push(status.state + seconds);
            this.slots.SetShade(0, status.state === "recharging" ? 1 - status.fill : 0);
        } else {
            const icon = TextureOf(hero.EquippedWeapon.icon);
            items.push(icon ? {texture: icon} : null);
            keys.push(hero.EquippedWeapon.icon);
        }
        // Packed from the left, after the spell or weapon.
        hero.Inventory.slots.forEach(slot => {
            const texture = slot && TextureOf(slot.sprite);
            if (slot && texture) {
                items.push({texture, count: slot.count});
                keys.push(slot.sprite + "x" + slot.count);
            }
        });
        this.slots.SetItems(items, keys);
        // Online, a player who has left, or whose connection has gone for now, says more than how their hero is.
        const status = hero.Gone ? "LEFT" : hero.Away ? "AWAY" : hero.Alive ? "" : "DOWN";
        if (status !== this.shownStatus) {
            this.shownStatus = status;
            this.alpha = status ? FallenAlpha : 1;
            this.ShowHero();
        }
    }

    destroy(options?: {children?: boolean; texture?: boolean; baseTexture?: boolean}): void {
        super.destroy({children: true, ...options});
    }

    private ShowHero(): void {
        const status = this.shownStatus ? "  " + this.shownStatus : "";
        this.header.SetHero({...this.info, name: this.info.name + status});
    }
}
