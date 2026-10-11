/**
 * Where a skill tree's pieces go: skills and junction rings sit in the middle of cells on a grid, and a link runs straight (across or down) from the edge of one to the edge of the
 * next - touching a skill, and a pixel or so short of a ring. Positions are in pixels from the tree's top-left. Pure.
 */

export type TreeNode = {
    id: string;
    /** The node's cell on the grid. */
    x: number;
    y: number;
    /** A junction ring rather than a skill. */
    ring?: boolean;
};

export type TreeSizes = {
    /** The grid's pitch. */
    cell: number;
    /** A skill's width and height, and a ring's. */
    nodeSize: number;
    ringSize: number;
    /** Between a ring and a link that meets it. */
    ringGap: number;
    /** A link's thickness. */
    thickness: number;
};

export type Rect = { x: number; y: number; width: number; height: number };

/** The middle of a node's cell. */
export function NodeCentre(node: TreeNode, cell: number): { x: number; y: number } {
    return { x: node.x * cell + cell / 2, y: node.y * cell + cell / 2 };
}

/** Where a node is drawn: a box of its size round the middle of its cell, on whole pixels. */
export function NodeRect(node: TreeNode, sizes: TreeSizes): Rect {
    const size = node.ring ? sizes.ringSize : sizes.nodeSize;
    const centre = NodeCentre(node, sizes.cell);
    return { x: Math.round(centre.x - size / 2), y: Math.round(centre.y - size / 2), width: size, height: size };
}

/** The link between two nodes in the same row or column: from the edge of the one to the edge of the other (less the gap at a ring). Throws for nodes on neither. */
export function LinkRect(a: TreeNode, b: TreeNode, sizes: TreeSizes): Rect {
    if (a.x !== b.x && a.y !== b.y) {
        throw new Error(`Skills "${a.id}" and "${b.id}" are joined but aren't in one row or column: put a ring at the corner and join through it.`);
    }
    const [first, second] = a.x < b.x || a.y < b.y ? [a, b] : [b, a];
    const one = NodeRect(first, sizes);
    const two = NodeRect(second, sizes);
    const gapAfter = first.ring ? sizes.ringGap : 0;
    const gapBefore = second.ring ? sizes.ringGap : 0;
    const across = sizes.thickness;
    if (a.y === b.y) {
        const x = one.x + one.width + gapAfter;
        const y = Math.round(NodeCentre(first, sizes.cell).y - across / 2);
        return { x, y, width: Math.max(0, two.x - gapBefore - x), height: across };
    }
    const y = one.y + one.height + gapAfter;
    const x = Math.round(NodeCentre(first, sizes.cell).x - across / 2);
    return { x, y, width: across, height: Math.max(0, two.y - gapBefore - y) };
}

/** The size of the box every node fits in, from the top-left of the grid. */
export function TreeSize(nodes: ReadonlyArray<TreeNode>, sizes: TreeSizes): { width: number; height: number } {
    let width = 0;
    let height = 0;
    nodes.forEach(node => {
        const rect = NodeRect(node, sizes);
        width = Math.max(width, rect.x + rect.width);
        height = Math.max(height, rect.y + rect.height);
    });
    return { width, height };
}
