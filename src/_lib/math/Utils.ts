export function Sign(val: number): number {
    return val > 0 ? 1 : val < 0 ? -1 : 0;
}

export function CeilN(val: number): number {
    return Math.ceil(Math.abs(val)) * Sign(val);
}

export function Lerp(start: number, end: number, amt: number) {
    return (1 - amt) * start + amt * end;
}

export function UpperLimit(val: number, limit: number): number {
    return Math.abs(val) > limit ? limit * Sign(val) : val;
}

export function LowerLimit(val: number, limit: number): number {
    return Math.abs(val) < limit ? 0 : val;
}

export function Truncate(n: number, digits: number): number {
  const factor = Math.pow(10, digits);
  return Math.round(n * factor) / factor;
}
