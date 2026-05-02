/**
 * EventService manages global DOM event listeners and dispatches actions to the main app instance.
 */
export class EventService {
    constructor(bus) {
        this.bus = bus;
        this._resizeTimeout = null;

        // Bind event handlers to this instance to ensure correct `this` context
        this.handleDocumentClick = this.handleDocumentClick.bind(this);
        this.handleDocumentKeydown = this.handleDocumentKeydown.bind(this);
        this.handleWindowResize = this.handleWindowResize.bind(this);
        this.handleBeforeInstallPrompt = this.handleBeforeInstallPrompt.bind(this);
        this.handleAppInstalled = this.handleAppInstalled.bind(this);
        this.handleContrastChange = this.handleContrastChange.bind(this);
        this.handleExternalLog = this.handleExternalLog.bind(this);

        this._shortcuts = {
            'b': () => this.bus.emit('app:toggle-compact'),
            's': () => this.bus.emit('backup:export-zip'),
            'o': () => this.bus.emit('backup:trigger-restore'),
            '/': () => this.bus.emit('ui:toggle-modal', { name: 'kb', label: 'Znalostní báze' }),
            'h': () => this.bus.emit('ui:toggle-modal', { name: 'history', label: 'Časová osa' }),
            'z': (e) => this.bus.emit(e.shiftKey ? 'chat:redo' : 'chat:undo'),
            'y': () => this.bus.emit('chat:redo')
        };
    }

    setupGlobalEventListeners() {
        window.addEventListener('click', this.handleDocumentClick);
        window.addEventListener('keydown', this.handleDocumentKeydown);
        window.addEventListener('resize', this.handleWindowResize);
        window.addEventListener('nevimto-log', this.handleExternalLog);
        window.addEventListener('beforeinstallprompt', this.handleBeforeInstallPrompt);
        window.addEventListener('appinstalled', this.handleAppInstalled);

        // Listen for system contrast preference changes
        const contrastQuery = window.matchMedia('(prefers-contrast: more)');
        contrastQuery.addEventListener('change', this.handleContrastChange);
        
        this.bus.emit('ui:autoresize');
    }

    removeGlobalEventListeners() {
        window.removeEventListener('click', this.handleDocumentClick);
        window.removeEventListener('keydown', this.handleDocumentKeydown);
        window.removeEventListener('resize', this.handleWindowResize);
        window.removeEventListener('nevimto-log', this.handleExternalLog);
        window.removeEventListener('beforeinstallprompt', this.handleBeforeInstallPrompt);
        window.removeEventListener('appinstalled', this.handleAppInstalled);

        const contrastQuery = window.matchMedia('(prefers-contrast: more)');
        contrastQuery.removeEventListener('change', this.handleContrastChange);
    }

    async handleDocumentClick(e) {
        const target = e.target;

        if (target.closest('.code-copy-btn')) {
            const copyBtn = target.closest('.code-copy-btn');
            const text = copyBtn.closest('.code-block-container').querySelector('code').innerText;
            this.bus.emit('ui:copy-to-clipboard', { text, target: copyBtn });
        } else if (target.closest('.code-download-btn')) {
            const downloadBtn = target.closest('.code-download-btn');
            const container = downloadBtn.closest('.code-block-container');
            const codeText = container.querySelector('code').innerText;
            const lang = container.getAttribute('data-lang') || 'txt';
            this.bus.emit('ui:download-code', { code: codeText, lang });
        } else if (target.closest('.kb-link')) {
            this.bus.emit('kb:link-clicked', { event: e });
        }
    }

    handleDocumentKeydown(e) {
        if (e.ctrlKey || e.metaKey) {
            const key = e.key.toLowerCase();
            const handler = this._shortcuts[key];
            if (handler) {
                e.preventDefault();
                handler(e);
            }
        }
    }

    handleWindowResize() {
        if (this._resizeTimeout) clearTimeout(this._resizeTimeout);
        this._resizeTimeout = setTimeout(() => {
            if (this.app.$refs.inputTextArea) this.app.autoResize();
        }, 150);
    }

    handleBeforeInstallPrompt(e) { e.preventDefault(); this.app.deferredPrompt = e; }
    handleAppInstalled() { this.app.deferredPrompt = null; this.app.isPwaInstalled = true; this.app.addToast('Aplikace byla úspěšně nainstalována', 'success'); }
    handleContrastChange() { if (this.app.settingsToggles.theme === 'system') this.app.settingsService.applyTheme('system'); }
    handleExternalLog(e) { this.app._handleExternalLog(e); }
}