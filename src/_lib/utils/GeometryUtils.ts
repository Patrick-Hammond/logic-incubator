export function SubtractPoints(point1: {x: number, y: number}, point2: {x: number, y: number}): {x: number, y: number} {
    return {x: point1.x - point2.x, y: point1.y - point2.y};
}

export function AddPoints(point1: {x: number, y: number}, point2: {x: number, y: number}): {x: number, y: number} {
    return {x: point1.x + point2.x, y: point1.y + point2.y};
}