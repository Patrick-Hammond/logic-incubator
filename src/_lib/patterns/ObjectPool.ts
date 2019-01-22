export default class ObjectPool<T> {

    private pool: T[] = [];
    private popped: T[] = [];

    constructor(initialSize: number, private ctor: () => T, private reset?: (item: T) => void) {
        while(this.pool.length < initialSize) {
            this.pool.push(this.ctor());
        }
    }

    get Popped(): T[] {
        return this.popped;
    }

    Get(): T {
        const item = this.pool.length === 0 ? this.ctor() : this.pool.pop();
        this.popped.push(item);
        return item;
    }

    Put(item: T): void {
        const poppedIndex = this.popped.indexOf(item);
        if(poppedIndex > -1) {
            this.popped.splice(poppedIndex, 1);
        }
        this.pool.push(item);
    }

    RestoreAll(): void {
        if(this.reset) {
            this.popped.forEach(this.reset);
        }
        this.pool.push(...this.popped);
        this.popped = [];
    }
}
