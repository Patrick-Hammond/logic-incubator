export class Queue<T> {

    private items: T[] = [];

    Add(item: T) {
        this.items.push(item);
    }

    Pop(): T {
        return this.items.shift();
    }

    isEmpty(): boolean {
        return this.items.length === 0;
    }
}
