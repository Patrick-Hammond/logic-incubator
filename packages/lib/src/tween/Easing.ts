/** Maps normalized progress `t` (0..1) to eased progress. Back and Elastic overshoot outside 0..1 mid-curve, but every curve still starts exactly at 0 and ends exactly at 1. */
export type EasingFunction = (t: number) => number;

function bounceOut(t: number): number {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) {
        return n1 * t * t;
    } else if (t < 2 / d1) {
        return n1 * (t -= 1.5 / d1) * t + 0.75;
    } else if (t < 2.5 / d1) {
        return n1 * (t -= 2.25 / d1) * t + 0.9375;
    } else {
        return n1 * (t -= 2.625 / d1) * t + 0.984375;
    }
}

/** The standard easings.net curve families, each with `In`/`Out`/`InOut` variants. */
export const Easing = {
    Linear: (t: number): number => t,

    Quad: {
        In: (t: number): number => t * t,
        Out: (t: number): number => t * (2 - t),
        InOut: (t: number): number => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
    },

    Cubic: {
        In: (t: number): number => t * t * t,
        Out: (t: number): number => 1 - Math.pow(1 - t, 3),
        InOut: (t: number): number => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
    },

    Quart: {
        In: (t: number): number => t * t * t * t,
        Out: (t: number): number => 1 - Math.pow(1 - t, 4),
        InOut: (t: number): number => t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2,
    },

    Quint: {
        In: (t: number): number => t * t * t * t * t,
        Out: (t: number): number => 1 - Math.pow(1 - t, 5),
        InOut: (t: number): number => t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2,
    },

    Sine: {
        In: (t: number): number => 1 - Math.cos(t * Math.PI / 2),
        Out: (t: number): number => Math.sin(t * Math.PI / 2),
        InOut: (t: number): number => -(Math.cos(Math.PI * t) - 1) / 2,
    },

    Expo: {
        In: (t: number): number => t === 0 ? 0 : Math.pow(2, 10 * t - 10),
        Out: (t: number): number => t === 1 ? 1 : 1 - Math.pow(2, -10 * t),
        InOut: (t: number): number => {
            if (t === 0 || t === 1) return t;
            return t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2;
        },
    },

    Circ: {
        In: (t: number): number => 1 - Math.sqrt(1 - t * t),
        Out: (t: number): number => Math.sqrt(1 - Math.pow(t - 1, 2)),
        InOut: (t: number): number => t < 0.5
            ? (1 - Math.sqrt(1 - Math.pow(2 * t, 2))) / 2
            : (Math.sqrt(1 - Math.pow(-2 * t + 2, 2)) + 1) / 2,
    },

    Back: {
        In: (t: number): number => {
            const c1 = 1.70158;
            const c3 = c1 + 1;
            return c3 * t * t * t - c1 * t * t;
        },
        Out: (t: number): number => {
            const c1 = 1.70158;
            const c3 = c1 + 1;
            return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
        },
        InOut: (t: number): number => {
            const c1 = 1.70158;
            const c2 = c1 * 1.525;
            return t < 0.5
                ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
                : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2;
        },
    },

    Bounce: {
        In: (t: number): number => 1 - bounceOut(1 - t),
        Out: bounceOut,
        InOut: (t: number): number => t < 0.5
            ? (1 - bounceOut(1 - 2 * t)) / 2
            : (1 + bounceOut(2 * t - 1)) / 2,
    },

    Elastic: {
        In: (t: number): number => {
            if (t === 0 || t === 1) return t;
            const c4 = (2 * Math.PI) / 3;
            return -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * c4);
        },
        Out: (t: number): number => {
            if (t === 0 || t === 1) return t;
            const c4 = (2 * Math.PI) / 3;
            return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
        },
        InOut: (t: number): number => {
            if (t === 0 || t === 1) return t;
            const c5 = (2 * Math.PI) / 4.5;
            return t < 0.5
                ? -(Math.pow(2, 20 * t - 10) * Math.sin((20 * t - 11.125) * c5)) / 2
                : (Math.pow(2, -20 * t + 10) * Math.sin((20 * t - 11.125) * c5)) / 2 + 1;
        },
    },
};
