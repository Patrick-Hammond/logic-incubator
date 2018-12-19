function Add(propName: string, values: number[]): number {
    return values.reduce((prev, curr) => prev + curr);
}

function Subtract(propName: string, values: number[]): number {
    return values.reduce((prev, curr) => prev - curr);
}

function Multiply(propName: string, values: number[]): number {
    return values.reduce((prev, curr) => prev * curr);
}

function EnumerateTypes<T extends {[ P in keyof T ]: number}>(a: T[], calc: (propName: string, values: number[]) => number): T {
    let result: {[ prop: string ]: number} = {};
    for(const prop in a[ 0 ]) {
        if(a[ 0 ].hasOwnProperty(prop)) {
            let vals = a.map(v => v[ prop ]);
            result[ prop ] = calc(prop, vals);
        }
    }
    return result as T;
}

export function AddTypes<T>(...values): T {
    return EnumerateTypes(values, Add);
}

export function SubtractTypes<T>(...values): T {
    return EnumerateTypes(values, Subtract);
}

export function MultiplyTypes<T>(...values): T {
    return EnumerateTypes(values, Multiply);
}