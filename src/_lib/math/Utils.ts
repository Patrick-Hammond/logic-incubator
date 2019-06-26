export function Sign(val:number):number {
    if(val === 0) {
        return 0;
    }
    return val > 0 ? 1 : -1;
}

export function CeilN(val:number):number {
    return Math.ceil(Math.abs(val)) * Sign(val);
}

export function Lerp (start:number, end:number, amt:number) {
    return (1 - amt) * start + amt * end;
}

export function Limit(val:number, limit:number):number {
    return Math.abs(val) > limit ? limit * Sign(val) : val;
}