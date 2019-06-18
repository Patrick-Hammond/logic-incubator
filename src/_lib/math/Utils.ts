export function Sign(val:number):number {
    return val > 0 ? 1 : -1;
}

export function Lerp (start:number, end:number, amt:number) {
    return (1 - amt) * start + amt * end;
}