/**
 * Simple Event Bus for application-level communication.
 */
export class EventBus extends EventTarget {
    emit(type, detail = {}) {
        this.dispatchEvent(new CustomEvent(type, { detail }));
    }

    on(type, callback) {
        const wrapper = (e) => callback(e.detail);
        this.addEventListener(type, wrapper);
        // Return unsubscribe function
        return () => this.removeEventListener(type, wrapper);
    }
}

export const bus = new EventBus();