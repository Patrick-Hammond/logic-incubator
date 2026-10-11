import { Container, Sprite } from "pixi.js";
import { SkillTreeSkin } from "../skin/Skin";
import UiTheme from "../UiTheme";
import { LinkRect, NodeRect, TreeNode, TreeSize, TreeSizes } from "./SkillTreeLayout";
import UiControl from "./UiControl";

export type SkillSpec = {
    id: string;
    /** Its cell on the tree's grid. */
    x: number;
    y: number;
    /** Its picture, a frame of the skin's bundle (`skill_health`); the locked look is the same name with `_locked` after it. */
    icon: string;
    /** The badge in its corner: a tier ("1" to "5") or "plus"; none when absent. */
    tier?: string;
    unlocked?: boolean;
};

export type RingSpec = { id: string; x: number; y: number; unlocked?: boolean };

export type SkillTreeSpec = {
    skills: SkillSpec[];
    /** Junctions where links meet or turn. */
    rings?: RingSpec[];
    /** Pairs of ids (skills or rings) in one row or column, joined by a straight link. */
    links: Array<[string, string]>;
};

/**
 * One skill on a tree: its picture (bright when unlocked, dark when locked), its tier badge, and a frame round it when it is the selected one. A press (or accept) emits `activate`,
 * which `UiSkillTree` turns into selecting it; the hovered skill shows a faint frame.
 */
export class UiSkillNode extends UiControl {
    private readonly picture = new Sprite();
    private readonly badge = new Sprite();
    private readonly frame: Sprite;
    private unlocked: boolean;
    private selected = false;

    constructor(private readonly theme: UiTheme, private readonly skin: SkillTreeSkin, readonly Spec: SkillSpec) {
        super();
        this.unlocked = !!Spec.unlocked;
        this.frame = new Sprite(theme.Texture(skin.selected));
        this.frame.position.set(-skin.selectedOutset, -skin.selectedOutset);
        this.badge.visible = !!Spec.tier;
        this.addChild(this.picture, this.badge, this.frame);
        this.SetHitSize(skin.nodeSize, skin.nodeSize);
        this.Redraw();
    }

    get Id(): string {
        return this.Spec.id;
    }

    get Unlocked(): boolean {
        return this.unlocked;
    }

    set Unlocked(unlocked: boolean) {
        if (this.unlocked !== unlocked) {
            this.unlocked = unlocked;
            this.Refresh();
        }
    }

    get Selected(): boolean {
        return this.selected;
    }

    set Selected(selected: boolean) {
        if (this.selected !== selected) {
            this.selected = selected;
            this.Refresh();
        }
    }

    protected Redraw(): void {
        if (!this.frame) {
            return;
        }
        const locked = this.unlocked ? "" : "_locked";
        this.picture.texture = this.theme.Texture(this.Spec.icon + locked);
        if (this.Spec.tier) {
            this.badge.texture = this.theme.Texture(this.skin.tierPrefix + this.Spec.tier + locked);
            const inset = this.skin.tierInset;
            this.badge.position.set(this.skin.nodeSize - inset - this.badge.texture.width, this.skin.nodeSize - inset - this.badge.texture.height);
        }
        const state = this.State;
        this.frame.visible = this.selected || state === "hover" || state === "pressed";
        this.frame.alpha = this.selected ? 1 : 0.45;
        this.picture.alpha = this.badge.alpha = state === "disabled" ? 0.5 : 1;
    }
}

/**
 * A skill tree: skills on a grid (see `SkillTreeLayout`), joined by straight links that may pass through junction rings, each lit when both its ends are unlocked. Pressing a skill
 * (or accept on it) selects it and emits `select` with its id; what selecting means (showing its description, a button to learn it) is the screen's. `SetUnlocked` changes a skill's
 * or a ring's state and relights its links. Register `Skills` with a `UiSystem` for the arrows and pad to move between them; a tree bigger than its room goes in a `UiScrollView`.
 */
export default class UiSkillTree extends Container {
    private readonly skin: SkillTreeSkin;
    private readonly sizes: TreeSizes;
    private readonly nodes = new Map<string, TreeNode & { unlocked: boolean }>();
    private readonly skills: UiSkillNode[] = [];
    private readonly rings = new Map<string, Sprite>();
    private readonly links: Array<{ from: string; to: string; sprite: Sprite; width: number; height: number }> = [];
    private selected = "";
    readonly TreeWidth: number;
    readonly TreeHeight: number;

    constructor(private readonly theme: UiTheme, variant: string, spec: SkillTreeSpec) {
        super();
        const skin = theme.skin.skillTrees && theme.skin.skillTrees[variant];
        if (!skin) {
            throw new Error(`The "${theme.skin.name}" skin has no skill tree "${variant}".`);
        }
        this.skin = skin;
        this.sizes = { cell: skin.cell, nodeSize: skin.nodeSize, ringSize: theme.Texture(skin.rings.locked).width, ringGap: skin.ringGap, thickness: skin.linkThickness };

        (spec.rings || []).forEach(ring => this.nodes.set(ring.id, { id: ring.id, x: ring.x, y: ring.y, ring: true, unlocked: !!ring.unlocked }));
        spec.skills.forEach(skill => this.nodes.set(skill.id, { id: skill.id, x: skill.x, y: skill.y, unlocked: !!skill.unlocked }));

        // Links first, so the skills and rings are drawn over their ends.
        spec.links.forEach(([from, to]) => {
            const a = this.Node(from);
            const b = this.Node(to);
            const rect = LinkRect(a, b, this.sizes);
            const sprite = new Sprite(theme.Texture(skin.links.locked));
            sprite.position.set(rect.x, rect.y);
            this.links.push({ from, to, sprite, width: rect.width, height: rect.height });
            this.addChild(sprite);
        });
        (spec.rings || []).forEach(ring => {
            const rect = NodeRect(this.Node(ring.id), this.sizes);
            const sprite = new Sprite();
            sprite.position.set(rect.x, rect.y);
            this.rings.set(ring.id, sprite);
            this.addChild(sprite);
        });
        spec.skills.forEach(skillSpec => {
            const node = new UiSkillNode(theme, skin, skillSpec);
            const rect = NodeRect(this.Node(skillSpec.id), this.sizes);
            node.position.set(rect.x, rect.y);
            node.on("activate", () => this.Choose(skillSpec.id, true));
            this.skills.push(node);
            this.addChild(node);
        });
        const size = TreeSize(Array.from(this.nodes.values()), this.sizes);
        this.TreeWidth = size.width;
        this.TreeHeight = size.height;
        this.Relight();
    }

    get Skills(): ReadonlyArray<UiSkillNode> {
        return this.skills;
    }

    /** The selected skill's id, or "" for none. */
    get Selected(): string {
        return this.selected;
    }

    /** Selects a skill (or none, for "") without emitting `select`. */
    Select(id: string): void {
        this.Choose(id, false);
    }

    IsUnlocked(id: string): boolean {
        return this.Node(id).unlocked;
    }

    /** Unlocks (or locks) a skill or a ring, and relights the links. */
    SetUnlocked(id: string, unlocked: boolean): void {
        this.Node(id).unlocked = unlocked;
        const skill = this.skills.find(node => node.Id === id);
        if (skill) skill.Unlocked = unlocked;
        this.Relight();
    }

    private Node(id: string): TreeNode & { unlocked: boolean } {
        const node = this.nodes.get(id);
        if (!node) {
            throw new Error(`The skill tree has no skill or ring "${id}".`);
        }
        return node;
    }

    private Choose(id: string, notify: boolean): void {
        this.selected = id;
        this.skills.forEach(node => (node.Selected = node.Id === id));
        if (notify) this.emit("select", id);
    }

    private Relight(): void {
        const art = (lit: boolean, pair: { locked: string; unlocked: string }) => this.theme.Texture(lit ? pair.unlocked : pair.locked);
        this.rings.forEach((sprite, id) => (sprite.texture = art(this.Node(id).unlocked, this.skin.rings)));
        this.links.forEach(link => {
            link.sprite.texture = art(this.Node(link.from).unlocked && this.Node(link.to).unlocked, this.skin.links);
            // The link's picture is a swatch, stretched to the link.
            link.sprite.width = link.width;
            link.sprite.height = link.height;
        });
    }

    destroy(options?: { children?: boolean; texture?: boolean; baseTexture?: boolean }): void {
        super.destroy({ children: true, ...options });
    }
}
