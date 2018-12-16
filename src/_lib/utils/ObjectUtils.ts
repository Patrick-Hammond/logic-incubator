export function Add(propName: string, values: number[]): number {
    return values.reduce((prev, curr) => prev + curr);
}

export function Subtract(propName: string, values: number[]): number {
    return values.reduce((prev, curr) => prev - curr);
}

export function Multiply(propName: string, values: number[]): number {
    return values.reduce((prev, curr) => prev * curr);
}

export function Enumerate<T extends {[ P in keyof T ]: number}>(a: T[], calc: (propName: string, values: number[]) => number): T {
    let result: {[ prop: string ]: number} = {};
    for(const prop in a[ 0 ]) {
        let vals = a.map(v => v[ prop ]);
        result[ prop ] = calc(prop, vals);
    }
    return result as T;
}