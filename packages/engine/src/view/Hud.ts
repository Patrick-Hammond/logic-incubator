import {BitmapText, Container, Graphics, Texture} from "pixi.js";
import GameComponent from "@logic-incubator/lib/game/GameComponent";
import AssetFactory from "@logic-incubator/lib/loading/AssetFactory";
import UiLayer from "@logic-incubator/ui/UiLayer";
import UiItemSlot, {SlotItem} from "@logic-incubator/ui/widgets/UiItemSlot";
import {CreateText} from "@logic-incubator/ui/widgets/UiText";
import {GameHeight, HudWidth, PlayWidth} from "../Constants";
import type {PlayerSetup} from "../DungeonMain";
import {QUEST_UPDATED} from "../Events";
import {Inventory, InventorySize, SlotsUsed} from "../level/entities/Inventory";
import {HeldKey, KeyRing} from "../level/entities/Keys";
import {LightSpellStatusOf} from "../level/entities/LightSpell";
import type QuestLog from "../story/Quests";
import type {QuestState} from "../story/Quests";
import {OrbTexture, TextureOf} from "./HudArt";
import HudHeader, {HudHeroInfo} from "./HudHeader";
import HudHeroRow, {HudHero} from "./HudHeroRow";
import HudJournal from "./HudJournal";
import {HudSlots, OutOf, WeaponName} from "./HudModel";
import HudSection, {HudPanel, SectionInset} from "./HudSection";
import HudSlotRow from "./HudSlotRow";

/** Room round the panels, and between them, in UI pixels. */
const Margin = 6;
/** Room round a panel's contents. */
const Inset = SectionInset;
/** The lone hero's portrait, and how many times as big they're drawn in it. */
const Portrait = 64;
const PortraitScale = 3;
/** Room between the weapon's slot and its name and damage. */
const WeaponGap = 12;
const SlotSize = 52;
/** Under the inventory: the keys carried, each in a small slot with its id in the corner. */
const KeySize = 32;
const KeyGap = 4;
const KeysGap = 8;
/** Room under a section's contents, inside its panel. */
const Bottom = 14;

export type {HudHero, HudHeroInfo};

/** Who each hero is, for the HUD (see `Hud.SetHeroes`). */
export type HudHeroSlot = {
    /** Their player's name, online - what heads their part of the HUD (the portrait shows who they play). */
    name?: string;
    /** The character they play - what heads their part of the HUD when there's no name. */
    character?: string;
    /** Their portrait: an animation (or sprite) name - their idle animation. */
    portrait?: string;
    /** The player at this machine, among others who aren't - see `HudHeroInfo.own`. */
    own: boolean;
};

/**
 * The HUD down the right of the screen, built from the UI kit (`packages/ui`) in whatever skin the game has loaded, on
 * the skin's dark panels. For one hero: their portrait, name, gold and hit points; their spells - the light spell, for a
 * hero who has one - or their weapon, its name and damage; their inventory and keys; and the quest journal
 * (see `HudJournal`). For a party (see `RenderHeroes`): a row per hero (see `HudHeroRow`), the team's keys, and the
 * journal under them. `Camera` reserves `PlayWidth` of the canvas so gameplay never renders under it. It only shows
 * things - nothing in it takes the pointer.
 *
 * The hit point bar's heart is the game's own full heart if `PlayerSetup.hearts` gives one (and it's in the sprite sheet), the skin's otherwise.
 */
export default class Hud extends GameComponent {
    private layer!: UiLayer;
    private panelWidth = 0;
    private heart: Texture | undefined;
    private heroes: ReadonlyArray<HudHeroInfo> = [];
    private followed: string | null = null;
    private readonly orbs = new Map<number, Texture>();

    /** The lone hero's panels, hidden while a party's rows show instead. */
    private solo!: Container;
    private header!: HudHeader;
    private spells!: HudSection;
    private spellSlots!: HudSlotRow;
    private weapon!: HudSection;
    private weaponSlot!: HudSlotRow;
    private weaponName!: BitmapText;
    private weaponDamage!: BitmapText;
    private shownWeapon = "";
    private inventory!: HudSection;
    private inventorySlots!: HudSlotRow;
    private keys!: Container;
    private shownKeys = "";
    private soloJournal!: HudJournal;

    /** A party's rows, keys and journal, made for the party's size (see `RenderHeroes`) - null for a lone hero. */
    private party: Container | null = null;
    private rows: HudHeroRow[] = [];
    private partyKeys: Container | null = null;
    private partyJournal: HudJournal | null = null;
    private shownPartyKeys = "";
    private readonly teamKeys: KeyRing = {keys: []};

    constructor(private sprites?: PlayerSetup["hearts"]) {
        super();
    }

    protected OnInitialise(): void {
        const sprites = this.sprites;
        if (sprites) {
            if (AssetFactory.inst.Has(sprites.full)) {
                this.heart = AssetFactory.inst.CreateTexture(sprites.full);
            } else {
                AssetFactory.inst.WarnMissing(sprites.full);
            }
        }
        this.layer = this.Attach(new UiLayer({input: false}));
        const theme = this.layer.Theme;
        const scale = theme.Scale;
        const left = PlayWidth / scale;
        const width = HudWidth / scale;
        const height = GameHeight / scale;
        const backdrop = new Graphics().beginFill(theme.Colour("ink")).drawRect(left, 0, width, height).endFill();
        this.solo = new Container();
        this.solo.position.set(left + Margin, Margin);
        this.layer.root.addChild(backdrop, this.solo);

        const panelWidth = this.panelWidth = width - Margin * 2;
        const inner = panelWidth - Inset * 2;
        this.header = new HudHeader(theme, {width: inner, portrait: Portrait, portraitScale: PortraitScale, compact: false}, this.heart);
        this.header.position.set(Inset, Inset);
        const headerPanel = HudPanel(theme, panelWidth, Inset + this.header.HeaderHeight + Inset + 4);
        headerPanel.addChild(this.header);

        // A hero with a light spell has their spells here; one without, their weapon - both made, one shown (see `RenderSolo`).
        const contentTop = HudSection.ContentTop(theme);
        let y = headerPanel.PanelHeight + Margin;
        const actionHeight = contentTop + SlotSize + Bottom;
        this.spells = new HudSection(theme, "ACTIVE SPELL", panelWidth, actionHeight);
        this.spellSlots = new HudSlotRow(theme, HudSlots, SlotSize, inner);
        this.spellSlots.Select(0);
        this.spells.content.addChild(this.spellSlots);
        this.weapon = new HudSection(theme, "EQUIPPED WEAPON", panelWidth, actionHeight);
        this.weaponSlot = new HudSlotRow(theme, 1, SlotSize, SlotSize);
        this.weaponSlot.Select(0);
        this.weaponName = CreateText(theme, "", {font: "heading", colour: "text"});
        this.weaponDamage = CreateText(theme, "", {colour: "muted"});
        this.weaponName.position.set(SlotSize + WeaponGap, 6);
        this.weaponDamage.position.set(SlotSize + WeaponGap, 6 + theme.FontSize("heading") + 4);
        this.weapon.content.addChild(this.weaponSlot, this.weaponName, this.weaponDamage);
        this.spells.y = this.weapon.y = y;
        this.spells.visible = false;
        y += actionHeight + Margin;

        this.inventory = new HudSection(theme, "INVENTORY", panelWidth, contentTop + SlotSize + KeysGap + KeySize + Bottom);
        this.inventory.y = y;
        this.inventorySlots = new HudSlotRow(theme, InventorySize, SlotSize, inner);
        this.keys = new Container();
        this.keys.y = SlotSize + KeysGap;
        this.inventory.content.addChild(this.inventorySlots, this.keys);
        y += this.inventory.SectionHeight + Margin;

        this.soloJournal = new HudJournal(theme, panelWidth, height - Margin - y);
        this.soloJournal.y = y;
        this.solo.addChild(headerPanel, this.spells, this.weapon, this.inventory, this.soloJournal);

        this.Tick(() => this.Animate(this.game.ticker.deltaMS / 1000));
        this.Listen(this.game.dispatcher, QUEST_UPDATED, (id: string, state: QuestState) => {
            // The quest followed is the last one given or moved on.
            if (state === "active") {
                this.followed = id;
            }
        });
        this.Own(() => {
            this.orbs.forEach(texture => texture.destroy(true));
            this.orbs.clear();
        });
    }

    /**
     * Who each hero is, by slot: what heads their part of the HUD - their player's name online, the character's name
     * otherwise, PLAYER n without either - and their portrait. Kept until changed.
     */
    SetHeroes(heroes: ReadonlyArray<HudHeroSlot>): void {
        this.heroes = heroes.map((hero, i) => ({
            name: hero.name || hero.character || "PLAYER " + (i + 1),
            portrait: hero.portrait || null,
            own: hero.own
        }));
        if (this.heroes[0]) {
            this.header.SetHero(this.heroes[0]);
        }
        this.rows.forEach((row, i) => this.heroes[i] && row.SetHero(this.heroes[i]));
    }

    /** A level has started: the journal follows its first quest under way until another is given or moved on. */
    BeginQuests(): void {
        this.followed = null;
    }

    /** Every hero, in slot order, the fallen included: one gets the lone hero's panels; a party gets a row each and the team's keys - every key any of them carries, which open their doors for all (see `World`). */
    RenderHeroes(heroes: ReadonlyArray<HudHero & {Keys: KeyRing}>): void {
        if (heroes.length === 1) {
            this.ShowParty(0);
            this.RenderSolo(heroes[0]);
            return;
        }
        this.ShowParty(heroes.length);
        heroes.forEach((hero, i) => this.rows[i].Render(hero));
        const held: HeldKey[] = [];
        heroes.forEach(hero => hero.Keys.keys.forEach(key => held.push(key)));
        this.teamKeys.keys = held;
        if (this.partyKeys) {
            this.shownPartyKeys = this.FillKeys(this.partyKeys, this.teamKeys, this.shownPartyKeys, this.panelWidth - Inset - this.partyKeys.x);
        }
    }

    /** The level's quests, in the journal. */
    RenderQuests(log: QuestLog): void {
        (this.partyJournal || this.soloJournal).Render(log, this.followed);
    }

    private RenderSolo(hero: HudHero & {Keys: KeyRing}): void {
        this.header.Render(hero.Health, hero.Gold.amount, hero.Experience);
        this.spells.visible = !!hero.Spell;
        this.weapon.visible = !hero.Spell;
        if (hero.Spell) {
            this.RenderSpells(hero);
        } else {
            this.RenderWeapon(hero);
        }
        this.RenderInventory(hero.Inventory);
        this.shownKeys = this.FillKeys(this.keys, hero.Keys, this.shownKeys, this.panelWidth - Inset * 2);
    }

    /** The light spell in the first slot, picked out - with the seconds it has left to burn, or shaded while it recharges. The rest wait for spells to come. */
    private RenderSpells(hero: HudHero): void {
        const spell = hero.Spell;
        if (!spell) {
            return;
        }
        const status = LightSpellStatusOf(spell);
        const icon = this.SpellIcon(hero);
        const seconds = status.seconds > 0 ? String(Math.ceil(status.seconds)) : "";
        this.spellSlots.SetItems([icon ? {texture: icon, label: seconds} : null], [status.state + seconds]);
        this.spellSlots.SetShade(0, status.state === "recharging" ? 1 - status.fill : 0);
    }

    /** The one weapon they carry: its icon, picked out, and beside it its name and the damage its shots do. */
    private RenderWeapon(hero: HudHero): void {
        const weapon = hero.EquippedWeapon;
        const signature = weapon.icon + "|" + (weapon.name || "") + "|" + weapon.shot.damage;
        if (signature === this.shownWeapon) {
            return;
        }
        this.shownWeapon = signature;
        this.weaponSlot.SetItems([this.ItemOf(weapon.icon)], [weapon.icon]);
        this.weaponName.text = WeaponName(weapon);
        this.weaponDamage.text = "DAMAGE " + weapon.shot.damage;
    }

    private RenderInventory(inventory: Inventory): void {
        const items: Array<SlotItem | null> = [];
        const keys: string[] = [];
        inventory.slots.forEach(slot => {
            items.push(slot ? this.ItemOf(slot.sprite, slot.count) : null);
            keys.push(slot ? slot.sprite + "x" + slot.count : "");
        });
        this.inventorySlots.SetItems(items, keys);
        this.inventory.SetNote(OutOf(SlotsUsed(inventory), inventory.slots.length));
    }

    /** Shows a party's rows for `count` heroes - made afresh when the count changes - or, for 0, the lone hero's panels. */
    private ShowParty(count: number): void {
        if (count === this.rows.length) {
            return;
        }
        if (this.party) {
            this.party.destroy();
            this.party = this.partyKeys = this.partyJournal = null;
            this.rows = [];
            this.shownPartyKeys = "";
        }
        this.solo.visible = count === 0;
        if (count === 0) {
            return;
        }
        const theme = this.layer.Theme;
        const scale = theme.Scale;
        const width = HudWidth / scale - Margin * 2;
        const party = this.party = new Container();
        party.position.set(PlayWidth / scale + Margin, Margin);
        this.layer.root.addChild(party);

        let y = 0;
        for (let i = 0; i < count; i++) {
            const row = new HudHeroRow(theme, i, width, hero => this.SpellIcon(hero), this.heart);
            if (this.heroes[i]) {
                row.SetHero(this.heroes[i]);
            }
            row.y = y;
            y += HudHeroRow.Height() + Margin;
            party.addChild(row);
            this.rows.push(row);
        }

        // The team's keys, on a strip of their own.
        const strip = HudPanel(theme, width, Inset + KeySize + Inset - 4);
        strip.y = y;
        const label = CreateText(theme, "KEYS", {font: "heading", colour: "muted"});
        label.position.set(Inset, Math.round((strip.height - label.textHeight) / 2));
        const keys = this.partyKeys = new Container();
        keys.position.set(Inset + Math.ceil(label.textWidth) + 12, Math.round((strip.height - KeySize) / 2));
        strip.addChild(label, keys);
        party.addChild(strip);
        y += strip.height + Margin;

        const journal = this.partyJournal = new HudJournal(theme, width, GameHeight / scale - Margin * 2 - y);
        journal.y = y;
        party.addChild(journal);
    }

    /**
     * Fills `strip` with a small slot for each key - its sprite, its id in the corner - as many as fit `width`, unless it
     * already shows them (`shown`, what it last returned); returns what it shows now.
     */
    private FillKeys(strip: Container, keys: KeyRing, shown: string, width: number): string {
        const signature = keys.keys.map(key => key.id + ":" + key.sprite).join("|");
        if (signature === shown) {
            return shown;
        }
        strip.removeChildren().forEach(child => (child as Container).destroy({children: true}));
        const theme = this.layer.Theme;
        const room = Math.floor((width + KeyGap) / (KeySize + KeyGap));
        keys.keys.slice(0, room).forEach((key, i) => {
            const slot = new UiItemSlot(theme, "default", KeySize);
            const texture = TextureOf(key.sprite);
            // A key the sprite sheet has no picture for still shows its id - the lock it opens.
            slot.SetItem({texture: texture || Texture.EMPTY, label: String(key.id)});
            slot.interactive = slot.interactiveChildren = false;
            slot.x = i * (KeySize + KeyGap);
            strip.addChild(slot);
        });
        return signature;
    }

    private Animate(seconds: number): void {
        if (this.solo.visible) {
            this.header.Animate(seconds);
        }
        this.rows.forEach(row => row.Animate(seconds));
    }

    /** A hero's light spell's icon: its own sprite, or an orb in its light's tint (made once per tint). */
    private SpellIcon(hero: HudHero): Texture | null {
        const spell = hero.Spell;
        if (!spell) {
            return null;
        }
        if (spell.spell.icon) {
            return TextureOf(spell.spell.icon);
        }
        const tint = spell.spell.light.tint;
        let orb = this.orbs.get(tint);
        if (!orb) {
            orb = OrbTexture(this.game.renderer, tint);
            this.orbs.set(tint, orb);
        }
        return orb;
    }

    private ItemOf(name: string | null, count?: number): SlotItem | null {
        const texture = TextureOf(name);
        return texture ? {texture, count} : null;
    }
}
