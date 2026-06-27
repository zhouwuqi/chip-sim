// Undo/redo over serialized world snapshots. Cheap and robust: every
// structural change records the prior state; undo/redo swap whole snapshots.

const LIMIT = 100;

export class History {
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private last: string;

  constructor(initial: string) {
    this.last = initial;
  }

  /** Record that the world changed to `current` (no-op if unchanged). */
  record(current: string): void {
    if (current === this.last) return;
    this.undoStack.push(this.last);
    if (this.undoStack.length > LIMIT) this.undoStack.shift();
    this.redoStack = [];
    this.last = current;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Returns the state to restore, or null if nothing to undo. */
  undo(current: string): string | null {
    const prev = this.undoStack.pop();
    if (prev === undefined) return null;
    this.redoStack.push(current);
    this.last = prev;
    return prev;
  }

  redo(current: string): string | null {
    const next = this.redoStack.pop();
    if (next === undefined) return null;
    this.undoStack.push(current);
    this.last = next;
    return next;
  }
}
