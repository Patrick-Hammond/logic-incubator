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

export function FindShortestPath<T extends SearchNode>(graph: ISearchGraph<T>, start: Vec2Like, end: Vec2Like): Vec2Like[] {

    const path: Vec2Like[] = [];
    const getPath = (t: SearchNode) => {
        if(t) {
            path.push(t.position);
            if(t.parent) {
                getPath(t.parent);
            }
        }
    }

    getPath(BredthFirstSearch(graph, start, end));
    return path.reverse();
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
