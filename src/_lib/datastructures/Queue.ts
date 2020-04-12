export class Queue<T> {

    private queue: T[] = [];

    constructor(private capacity: number) {}

    static Create<U>(capacity: number = Number.MAX_VALUE): Queue<U> {
        return new Queue<U>(capacity);
    }

    Queue(item: T): Queue<T> {
        this.queue.push(item);

        while(this.queue.length > this.capacity) {
            this.queue.shift()
        }

        return this;
    }

    Dequeue(): T {
        return this.queue.shift();
    }

    Count(): number {
        return this.queue.length;
    }

    Read(): T[] {
        return this.queue;
    }
}