/**
 * HistoryManager handles the undo and redo stacks for chat history.
 */
export class HistoryManager {
    constructor(maxDepth = 20) {
        this.undoStack = [];
        this.redoStack = [];
        this.maxDepth = maxDepth;
    }

    /**
     * Initializes the stacks from persisted data.
     * @param {Object} stacks - Object containing undo and redo arrays.
     */
    initialize({ undo, redo }) {
        this.undoStack = Array.isArray(undo) ? undo : [];
        this.redoStack = Array.isArray(redo) ? redo : [];
    }

    /**
     * Resets both undo and redo stacks.
     */
    clear() {
        this.undoStack = [];
        this.redoStack = [];
    }

    /**
     * Pushes a new snapshot to the undo stack.
     * @param {Array} state - The current chat history array.
     */
    push(state) {
        this.undoStack.push(structuredClone(state));
        if (this.undoStack.length > this.maxDepth) {
            this.undoStack.shift();
        }
        this.redoStack = []; // New actions invalidate the redo chain
    }

    /**
     * Returns the previous state and saves current to redo stack.
     */
    undo(currentState) {
        if (this.undoStack.length === 0) return null;
        
        this.redoStack.push(structuredClone(currentState));
        return this.undoStack.pop();
    }

    /**
     * Returns the next state and saves current to undo stack.
     */
    redo(currentState) {
        if (this.redoStack.length === 0) return null;
        
        this.undoStack.push(structuredClone(currentState));
        return this.redoStack.pop();
    }
}