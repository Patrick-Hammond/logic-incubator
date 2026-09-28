/**
 * Enumerates objects of the same type and for each numeric property
 * calls the given calc function
 *
 * @template T
 * @param {T[]} a
 * @param {(propName: string, values: number[]) => number} calc
 * @returns {T}
 */
function EnumerateTypes<T extends { [P in keyof T]: number }>(a: T[], calc: (propName: string, values: number[]) => number): T {
    const result: { [prop: string]: number } = {};
    for (const prop in a[0]) {
        if (a[0].hasOwnProperty(prop) && typeof a[0][prop] === "number") {
            const vals = a.map(v => v[prop]);
            result[prop] = calc(prop, vals);
        }
    }
    return result as T;
}

/**
 * ARITHMETIC METHODS
 */
export function AddTypes<T extends { [P in keyof T]: number }>(...values: T[]): T {
    return EnumerateTypes(values, Add);
}

export function SubtractTypes<T extends { [P in keyof T]: number }>(...values: T[]): T {
    return EnumerateTypes(values, Subtract);
}

export function MultiplyTypes<T extends { [P in keyof T]: number }>(...values: T[]): T {
    return EnumerateTypes(values, Multiply);
}

/**
 * OPERATORS
 */
function Add(propName: string, values: number[]): number {
    return values.reduce((prev, curr) => prev + curr);
}

function Subtract(propName: string, values: number[]): number {
    return values.reduce((prev, curr) => prev - curr);
}

function Multiply(propName: string, values: number[]): number {
    return values.reduce((prev, curr) => prev * curr);
}
