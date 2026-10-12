/** Bounded chronological log; insertion never shifts thousands of retained events. */
export class EventLog<T> {
  private entries: T[] = [];
  private start = 0;
  dropped = 0;
  constructor(readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new RangeError('Invalid log capacity');
  }
  push(entry: T) {
    if (this.entries.length < this.capacity) this.entries.push(entry);
    else {
      this.entries[this.start] = entry;
      this.start = (this.start + 1) % this.capacity;
      this.dropped++;
    }
  }
  toArray(): T[] {
    return [...this.entries.slice(this.start), ...this.entries.slice(0, this.start)];
  }
  clear() {
    this.entries = [];
    this.start = 0;
    this.dropped = 0;
  }
}
