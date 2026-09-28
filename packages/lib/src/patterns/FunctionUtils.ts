// tslint:disable-next-line: ban-types
export function Memoize(fn: Function) {
    const cache = {};
    return (...args) => {
        const n = args[0]; // just taking one argument here
        if (n in cache) {
            // fetching from cache
            return cache[n];
        } else {
            // calculating result
            const result = fn(n);
            cache[n] = result;
            return result;
        }
    };
};

// tslint:disable-next-line: no-empty
export function NullFunction(): void {};
