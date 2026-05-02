/**
 * ToastService manages the lifecycle of notification toasts,
 * including automatic dismissal for non-persistent messages.
 */
export class ToastService {
    constructor(toastsArray) {
        this.toasts = toastsArray;
    }

    /**
     * Adds a new toast to the list.
     */
    add(message, type = 'info', isPersistent = false) {
        const id = Date.now();
        this.toasts.push({ id, message, type, isPersistent });

        if (!isPersistent) {
            setTimeout(() => this.remove(id), 3000);
        }
        return id;
    }

    /**
     * Removes a toast from the list by ID.
     */
    remove(id) {
        const index = this.toasts.findIndex(t => t.id === id);
        if (index !== -1) {
            this.toasts.splice(index, 1);
        }
    }
}