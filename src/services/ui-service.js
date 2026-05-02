/**
 * UIService manages the state of views and modals, 
 * including transitions and confirmation dialogs.
 */
export class UIService {
    /**
     * @param {EventBus} bus - Application event bus.
     * @param {Object} config - APP_CONFIG.
     * @param {Object} state - Getters for active UI state.
     */
    constructor(bus, config, state) {
        this.bus = bus;
        this.config = config;
        this.state = state;
    }

    /**
     * Navigates to a specific view.
     */
    switchView(view) {
        if (this.state.activeView() === view) return;
        this.bus.emit('view:change', { view });
    }

    /**
     * Opens a specific modal with optional data.
     */
    openModal(name, data = null) {
        // Defensive: If trying to open a View as a Modal, switch view instead
        if (Object.values(this.config.VIEWS).includes(name)) {
            return this.switchView(name);
        }
        this.bus.emit('modal:open', { name, data });
    }

    /**
     * Closes the active modal and resets modal-related state.
     */
    closeModal() {
        this.bus.emit('modal:close');
    }

    /**
     * Toggles a modal or view.
     */
    toggleModal(name, label) {
        const isView = Object.values(this.config.VIEWS).includes(name);
        const isOpen = isView ? this.state.activeView() === name : this.state.activeModal() === name;

        if (isView) this.switchView(isOpen ? this.config.VIEWS.CHAT : name);
        else isOpen ? this.closeModal() : this.openModal(name);

        if (label) this.bus.emit('toast', { msg: `${label} ${isOpen ? 'zavřena' : 'otevřena'}`, type: 'info' });
    }

    /**
     * Triggers a standardized confirmation dialog.
     */
    triggerConfirm(title, message, onConfirm, options = {}) {
        const opts = (options && typeof options === 'object' && !Array.isArray(options)) ? options : { diff: options };
        
        this.openModal('confirm', { 
            title, 
            message, 
            onConfirm, 
            confirmLabel: opts.confirmLabel || 'POTVRDIT',
            cancelLabel: opts.cancelLabel || 'ZRUŠIT',
            secondaryAction: opts.secondaryAction || null,
            secondaryLabel: opts.secondaryLabel || null,
            diff: opts.diff || null 
        });
    }

    /**
     * Helper to wrap state changes in the View Transition API if available.
     */
    withViewTransition(callback) {
        if (document.startViewTransition) return document.startViewTransition(callback);
        return callback();
    }

    /**
     * Utility to copy text to clipboard with UI feedback.
     */
    async copyToClipboard(text, targetEl) {
        try {
            await navigator.clipboard.writeText(text);
            if (targetEl) {
                const icon = targetEl.querySelector('.material-symbols-outlined') || targetEl;
                const original = icon.innerText;
                icon.innerText = 'check';
                targetEl.classList.add('copied');
                setTimeout(() => {
                    if (icon) icon.innerText = original;
                    targetEl.classList.remove('copied');
                }, 2000);
            }
        } catch (err) {
            this.bus.emit('toast', { msg: 'Kopírování selhalo', type: 'error' });
        }
    }

    /**
     * Resizes a textarea based on its content.
     * @param {Event|HTMLElement} eventOrEl 
     */
    autoResize(eventOrEl) {
        const el = (eventOrEl instanceof Event) ? eventOrEl.target : eventOrEl;
        if (!(el instanceof HTMLTextAreaElement)) return;
        el.style.height = 'auto';
        el.style.height = el.scrollHeight + 'px';
    }

    /**
     * Utility to trigger a browser file download.
     */
    downloadFile(content, fileName, contentType) {
        const a = document.createElement("a");
        const file = new Blob([content], { type: contentType });
        a.href = URL.createObjectURL(file);
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(a.href);
    }

    /**
     * Formats and downloads a code snippet with the appropriate extension.
     */
    downloadCodeSnippet(codeText, lang) {
        const extMap = {
            javascript: 'js', python: 'py', html: 'html', css: 'css', 
            json: 'json', markdown: 'md', typescript: 'ts', java: 'java', 
            cpp: 'cpp', csharp: 'cs', php: 'php', sql: 'sql', shell: 'sh', bash: 'sh'
        };
        const ext = extMap[lang?.toLowerCase()] || lang || 'txt';
        this.downloadFile(codeText, `snippet-${Date.now()}.${ext}`, 'text/plain');
    }

    /**
     * Downloads an individual chat message as markdown.
     */
    downloadMessage(content, index) {
        const date = new Date().toISOString().split('T')[0];
        this.downloadFile(content, `msg-${index + 1}-${date}.md`, "text/markdown");
    }

    /**
     * Triggers a click on a hidden input element.
     */
    triggerInputClick(el) {
        if (el) el.click();
    }

    /**
     * Scrolls a container to the bottom.
     */
    scrollToBottom(container) {
        if (!container) return;
        requestAnimationFrame(() => {
            container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
        });
    }
}