import {Vec2Like} from "../math/Geometry";

export interface ISearchGraph<T> {
    data: T[][];
    GetAdjacent(node: SearchNode): SearchNode[];
}

export abstract class SearchNode {
    parent: SearchNode;
    position: Vec2Like;
    visited: boolean = false;

    abstract CheckValid(): boolean;
};

export function GetPath<T extends SearchNode>(node: T, pathInOut: Vec2Like[] = []): Vec2Like[] {
    if(node) {
        pathInOut.push(node.position);
        if(node.parent) {
            GetPath(node.parent, pathInOut);
        }
    }
    return pathInOut;
}

export function FindShortestPath<T extends SearchNode>(graph: ISearchGraph<T>, start: Vec2Like, end: Vec2Like): Vec2Like[] {

    return GetPath(BredthFirstSearch(graph, start, end)).reverse();
}

export function FindClosestNode<T extends SearchNode>(graph: ISearchGraph<T>, position: Vec2Like, nodes: T[]): T {

    let shortest = Number.MAX_VALUE;
    const closest = nodes.find(node => {
        const path = GetPath(BredthFirstSearch(graph, position, node.position));
        shortest = Math.min(path.length, shortest);
        return path.length === shortest;
    });
    return closest;
}

export function BredthFirstSearch<T extends SearchNode>(graph: ISearchGraph<T>, start: Vec2Like, end: Vec2Like): SearchNode {

    // reset graph
    graph.data.forEach(t => t.forEach(node => {
        node.parent = null;
        node.visited = false;
    }));

    const queue: SearchNode[] = [];
    const begin = graph.data[start.y][start.x];
    begin.visited = true;
    queue.push(begin);

    const target = graph.data[end.y][end.x];

    while (queue.length) {
        const current = queue.shift();
        if(current.position.x === target.position.x && current.position.y === target.position.y) {
            return current;
        }
        const edges = graph.GetAdjacent(current);
        edges.forEach(edge => {
            if (edge.CheckValid() && !edge.visited) {
                edge.visited = true;
                edge.parent = current;
                queue.push(edge)
            }
        });
    }

    return null;
}
