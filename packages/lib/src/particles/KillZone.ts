/** What a particle's container's `worldTransform` is, as far as `IsOutside` needs it: where the container's space lands in the stage's. */
export interface Transform2D {
    a: number;
    b: number;
    c: number;
    d: number;
    tx: number;
    ty: number;
}

/** A rectangle, as pixi's `Rectangle` is. */
export interface Area {
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * Whether the point (`x`, `y`) - a particle's position, in its container's space - is outside `area`, which is in the stage's (global)
 * space: the point is taken to the stage through `transform`, the container's `worldTransform`. The area's edges count as inside.
 *
 * In the stage's space so that one area serves emitters whose containers are placed or scaled differently, and so that "bigger than
 * the screen" means what it says.
 */
export function IsOutside(transform: Transform2D, x: number, y: number, area: Area): boolean {
    const globalX = transform.a * x + transform.c * y + transform.tx;
    const globalY = transform.b * x + transform.d * y + transform.ty;
    return globalX < area.x || globalY < area.y || globalX > area.x + area.width || globalY > area.y + area.height;
}

/**
 * How far through its curves a particle is, 0 to 1: its age over its lifetime, held at 1 once it is older - which a particle can be
 * when it lives on until it leaves a kill area, rather than dying of age.
 */
export function CurveProgress(age: number, oneOverLife: number): number {
    const progress = age * oneOverLife;
    return progress > 1 ? 1 : progress;
}
