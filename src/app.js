// src/app.js
import { 
    askAI, stopAI, models
} from './llm.js';
import { MessageService } from './services/message-service.js';
import { StorageService } from './services/storage-service.js';
import { ProfileService } from './services/profile-service.js';
import { BackupService } from './services/backup-service.js';
import { KnowledgeService } from './services/knowledge-service.js';
import { CommandService } from './services/command-service.js';
import { ToastService } from './services/toast-service.js';
import { UIService } from './services/ui-service.js';
import { ValidationService } from './services/validation-service.js';
import { EventService } from './services/event-service.js';
import { ModelService } from './services/model-service.js';
import { PwaService } from './services/pwa-service.js';
import { SettingsService } from './services/settings-service.js';
import { highlightText } from './utils/highlight.js'; // Import the new utility
import { SystemInfoService } from './services/system-info-service.js';
import { AttachmentService } from './services/attachment-service.js';
import { SnapshotService } from './services/snapshot-service.js';
import { ConversationService } from './services/conversation-service.js';
import { APP_CONFIG } from './config.js'; // Import APP_CONFIG
import { bus } from './utils/event-bus.js';
import { STORAGE_VALIDATORS } from './validation.js'; // Import STORAGE_VALIDATORS
import { MarkdownService } from './services/markdown-service.js';
import { logger } from './utils/logger.js';

// Import View Components
import LandingView from './views/LandingView.js';
import ChatView from './views/ChatView.js';
import SettingsView from './views/SettingsView.js';
import KbView from './views/KbView.js';
import HistoryView from './views/HistoryView.js';
import SystemModals from './views/SystemModals.js';

const { createApp } = Vue; // Vue app creation

createApp({
    components: {
        'landing-view': LandingView,
        'chat-view': ChatView,
        'settings-view': SettingsView,
        'kb-view': KbView,
        'history-view': HistoryView,
        'system-modals': SystemModals
    },
    data() {
        return {
            isPwaInstalled: false,
            chatInput: '',
            chatHistory: [],
            activeView: 'chat', // Initial view
            VIEWS: APP_CONFIG.VIEWS,
            models,
            isLoading: false, isSearching: false,
            isGuestMode: false, // New: Prevents persistence to DB and LocalStorage
            toasts: [],
            pendingAttachments: [],
            loadStatus: '', loadProgress: 0,
            isAborting: false,
            isTyping: false, // New flag for typing indicator
            settingsToggles: {
                contextMonitor: true,
                isCompactMode: false,
                theme: 'system',
                isDyslexic: false
            },
            maxChars: APP_CONFIG.LIMITS.MAX_CHARS,
            maxSystemPromptChars: APP_CONFIG.LIMITS.MAX_SYSTEM_PROMPT,
            maxContextChars: APP_CONFIG.LIMITS.MAX_CONTEXT,
            editingIndex: null,
            editBuffer: '',
            activeModal: null, // Unified state: 'settings', 'merge', 'recovery', 'compare', 'diagnostics', 'confirm', 'shortcuts', 'history', 'kb'
            activeSubMenu: null,
            isRestoreDryRun: false, globalSearch: '', selectedTags: [], isTagDropdownOpen: false,
            kbInput: '', kbImportance: 1, kbLocked: false,
            activeProfileId: null,
            contextProfiles: [],
            lastAutoSave: null,
            mergeSourceId: null,
            snapshots: [],
            systemLogs: [],
            debouncedLogSearchQuery: '',
            activeDownloads: [],
            logFilter: 'all', // 'all', 'info', 'warn', 'error'
            modalIsLoading: false, // New: Loading state for modal actions
            messageQueue: [], // Queue for messages sent while AI is busy
            messageService: null,
            storageService: null,
            profileService: null,
            backupService: null,
            knowledgeService: null,
            commandService: null,
            toastService: null,
            uiService: null,
            validationService: null,
            eventService: null,
            modelService: null,
            pwaService: null,
            systemInfoService: null,
            attachmentService: null,
            snapshotService: null,
            settingsService: null,
            conversationService: null,
            markdownService: null,
            deferredPrompt: null, // PWA installation prompt
            modalData: {
                confirm: null,
                compare: null, // This holds the raw comparison object
                diagnostics: {
                    webGpu: false,
                    sab: false,
                    wasm: false,
                    quota: '0',
                    usage: '0'
                },
                recovery: []
            }
        };
    },
    watch: {
        chatHistory: {
            handler(newHistory) {
                // Performance: Do not persist to DB while AI is streaming tokens
                if (this.isGuestMode || this.isTyping) return;

                // Optimization: Debounce DB writes to prevent I/O bottlenecks during AI streaming
                if (this._saveTimeout) clearTimeout(this._saveTimeout);
                this._saveTimeout = setTimeout(() => {
                    this.conversationService.saveHistory(this.storageService, newHistory)
                        .catch(err => {
                            this.addToast(this.storageService.getErrorMessage('history', 'readwrite'), 'error', true);
                        });
                    localStorage.setItem(APP_CONFIG.STORAGE_KEYS.LAST_MODIFIED, new Date().toISOString());
                }, 1000);
            }, deep: true
        },
        contextProfiles: {
            handler(newProfiles) {
                if (this.isGuestMode) return;
                this._saveProfilesToDB(newProfiles);
                localStorage.setItem(APP_CONFIG.STORAGE_KEYS.LAST_MODIFIED, new Date().toISOString());
            }, deep: true
        },
        settingsToggles: { 
            handler(val) { 
                if (!this.isGuestMode) localStorage.setItem(APP_CONFIG.STORAGE_KEYS.SETTINGS, JSON.stringify(val)); 
            }, deep: true 
        },
        'settingsToggles.theme'(val) {
            this.settingsService.applyTheme(val);
        },
        'settingsToggles.isDyslexic'(val) {
            this.settingsService.applyDyslexicMode(val);
        },
        activeProfileId(newId) {
            if (!this.isGuestMode) localStorage.setItem(APP_CONFIG.STORAGE_KEYS.ACTIVE_PROFILE, JSON.stringify(newId));
            this._ensureActiveProfileModel();
        },
        activeView(newView) {
            if (newView === 'settings') {
                this.modelService.startDownloadRefreshInterval();
                this.modelService.getActiveDownloadIds().then(ids => this.activeDownloads = ids); // Initial refresh
            } else {
                this.modelService.stopDownloadRefreshInterval();
            }
        },
        activeModal() {
            this.uiService.withViewTransition(() => {}); // Still relevant for modal transitions
        },
        globalSearch(newVal) {
            if (this._logSearchTimeout) clearTimeout(this._logSearchTimeout);
            if (!newVal) {
                this.debouncedLogSearchQuery = '';
                return;
            }
            this._logSearchTimeout = setTimeout(() => {
                this.debouncedLogSearchQuery = newVal;
            }, 300);
        },
        filteredLogs: {
            handler() {
                this.$nextTick(() => {
                    const el = this.$refs.logConsole;
                    if (el) el.scrollTop = el.scrollHeight;
                });
            },
            deep: true
        }
    },
    async created() {
        await this._initializeServices(); // Await service initialization
        await this._loadInitialState();
        
        if (this.chatHistory.length === 0 && !this.isPwaInstalled && this.activeView !== 'settings') {
            this.activeView = 'landing';
        }
    },
    computed: {
        charCountClass() {
            const status = this.getStatus(this.chatInput.length, this.maxChars);
            // We return 'status-text' prefixed class for the UI indicators
            return status === 'healthy' ? '' : `status-text ${status}`;
        },
        systemPromptCharClass() {
            const status = this.getStatus(
                (this.activeProfile?.systemPrompt || "").length, 
                this.maxSystemPromptChars
            );
            return status === 'healthy' ? '' : `status-text ${status}`;
        }, // Corrected to use `danger` and `warning` classes
        systemHealthClass() {
            const diag = this.modalData.diagnostics;
            if (!diag) return 'unknown';
            if (!diag.wasm || !diag.sab) return 'critical';
            if (!diag.webGpu) return 'degraded';
            return 'healthy';
        },
        filteredHistory() {
            const query = this.globalSearch.toLowerCase().trim();
            return this.chatHistory.map((msg, index) => ({ msg, index }))
                                   .filter(i => i.msg.content.toLowerCase().includes(query));
        },
        allAvailableTags() {
            return this.profileService.getAllTags(this.contextProfiles);
        },
        filteredProfiles() {
            const query = this.globalSearch.toLowerCase().trim();
            const selected = this.selectedTags;

            return this.contextProfiles.filter(p => {
                const matchesQuery = !query || p.name.toLowerCase().includes(query);
                const matchesTags = selected.length === 0 || (p.tags && selected.every(t => p.tags.includes(t)));
                return matchesQuery && matchesTags;
            });
        },
        filteredLogs() {
            let logs = this.systemLogs;
            if (this.logFilter !== 'all') {
                logs = logs.filter(log => log.type === this.logFilter);
            }
            
            const query = this.debouncedLogSearchQuery.toLowerCase().trim();
            if (query) {
                logs = logs.filter(log => 
                    log.msg.toLowerCase().includes(query) || 
                    (log.detail && log.detail.toLowerCase().includes(query))
                );
            }
            return logs.slice(-APP_CONFIG.LIMITS.LOG_DISPLAY_LIMIT);
        },
        maxContextTokens() { // Computed property for clarity
            return this.maxContextChars / 4;
        },
        isVLM() {
            return this.modelService && this.activeModel && this.modelService.isVLM(this.activeModel.id);
        },
        inputActionButtonIcon() {
            return this.isVLM ? 'menu' : 'attachment';
        },
        inputActionButtonTooltip() {
            return this.isVLM ? 'Model nepodporuje přílohy. Otevřít nastavení.' : 'Přidat přílohu';
        },
        activeProfile() {
            return this.contextProfiles.find(p => p.id === this.activeProfileId) || 
                   { id: 'none', name: 'None', knowledgeBase: [], systemPrompt: '', historySummary: '', selectedModelId: this.models[0].id };
        },
        activeModel() {
            return this.models.find(m => m.id === this.activeProfile.selectedModelId) || this.models[0];
        },
        storageUsage() {
            if (!this.storageService) return "N/A";
            return this.storageService.calculateUsage();
        },
        filteredCompareData() {
            if (!this.modalData.compare) return null;
            const query = this.globalSearch.toLowerCase().trim();
            if (!query) return this.modalData.compare;

            return {
                ...this.modalData.compare,
                metrics: this.modalData.compare.metrics.filter(m => 
                    m.label.toLowerCase().includes(query) ||
                    String(m.current).toLowerCase().includes(query) || 
                    String(m.snap).toLowerCase().includes(query)
                ),
                profiles: {
                    added: this.modalData.compare.profiles.added.filter(p => p.toLowerCase().includes(query)),
                    removed: this.modalData.compare.profiles.removed.filter(p => p.toLowerCase().includes(query)),
                    promptChanges: this.modalData.compare.profiles.promptChanges.filter(c => c.name.toLowerCase().includes(query))
                }
            };
        },
        snapshotChartData() {
            const recent = this.snapshots.slice(0, 5).reverse();
            const max = Math.max(...recent.map(s => s.chatHistory.length), 1);
            return recent.map(s => ({
                time: new Date(s.timestamp).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' }),
                count: s.chatHistory.length, height: (s.chatHistory.length / max * 100) + '%'
            }));
        }
    },
    mounted() {
        this._setupGlobalEventListeners();
        this._setupBusListeners();
    },
    beforeUnmount() {
        this._removeGlobalEventListeners();
    },
    methods: {
        _registerServiceWorker() {
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.register('./sw.js')
                    .then(async reg => {
                        logger.info('Service Worker registered', { scope: reg.scope });
                        
                        navigator.serviceWorker.addEventListener('message', (event) => {
                            if (event.data === 'reload-app') window.location.reload();
                        });
                        
                        // Register periodic sync for model configs if supported
                        if ('periodicSync' in reg) {
                            try {
                                // Check if permission is already granted to avoid NotAllowedError
                                const status = await navigator.permissions.query({
                                    name: 'periodic-background-sync',
                                });

                                if (status.state === 'granted') {
                                    await reg.periodicSync.register('update-model-configs', {
                                        minInterval: 24 * 60 * 60 * 1000 // Attempt update every 24 hours
                                    });
                                    logger.info('Periodic Sync registered: update-model-configs');
                                } else {
                                    logger.info('Periodic Sync skipped: Permission not yet granted (App may not be installed)');
                                }
                            } catch (err) {
                                // Silently fail for expected browser policy restrictions
                                logger.debug('Periodic Sync registration deferred:', err.name);
                            }
                        }
                    })
                    .catch(err => logger.error('Service Worker registration failed', err));
            }
        },

        /**
         * Forces the Service Worker to clear all caches and then reloads the application.
         */
        async clearCacheAndUpdate() {
            this.addToast('Čištění mezipaměti a aktualizace...', 'info');
            if (!navigator.serviceWorker.controller) {
                const names = await caches.keys();
                await Promise.all(names.map(name => caches.delete(name)));
                window.location.reload();
                return;
            }
            navigator.serviceWorker.controller.postMessage('clear-cache-and-update');
            // Safety fallback reload
            setTimeout(() => window.location.reload(), 2000);
        },

        async installPwa() {
            if (!this.deferredPrompt) return;
            this.deferredPrompt.prompt();
            const { outcome } = await this.deferredPrompt.userChoice;
            if (outcome === 'accepted') logger.info('User accepted PWA install');
            this.deferredPrompt = null;
        },

        async _warmModels(modelId) {
            this.isLoading = true;
            try {
                await this.modelService.warm(modelId, (status, progress) => {
                    this.loadStatus = status;
                    this.loadProgress = progress;
                });
            } catch (err) {
                this.addToast(err.message, 'error', true);
            } finally {
                this.isLoading = false;
                if (this.loadStatus.includes('Initializing')) this.loadStatus = '';
                this.loadStatus = '';
                this.loadProgress = 0;
            }
        },

        _detectPwaStatus() {
            this.isPwaInstalled = window.matchMedia('(display-mode: standalone)').matches 
                || window.navigator.standalone === true 
                || document.referrer.includes('android-keystore');
        },
        _setupGlobalEventListeners() {
            window.addEventListener('click', this._handleDocumentClick);
            window.addEventListener('keydown', this._handleDocumentKeydown);
            window.addEventListener('resize', this._handleWindowResize);
            window.addEventListener('nevimto-log', this._handleExternalLog);
            window.addEventListener('beforeinstallprompt', (e) => {
                e.preventDefault();
                this.deferredPrompt = e;
            });
            window.addEventListener('appinstalled', () => {
                this.deferredPrompt = null;
                this.isPwaInstalled = true;
                this.addToast('Aplikace byla úspěšně nainstalována', 'success');
            });

            // Listen for system contrast preference changes
            const contrastQuery = window.matchMedia('(prefers-contrast: more)');
            contrastQuery.addEventListener('change', () => {
                if (this.settingsToggles.theme === 'system') this._applyTheme('system');
            });

            this.autoResize();
        },

        /**
         * Initiates a Background Fetch for large model assets.
         * @param {string} modelId - The ID of the model (e.g., 'Qwen2.5-0.5B')
         * @param {string[]} urls - List of binary/wasm URLs to download.
         * @param {number} estimatedSize - Total size in bytes.
         */
        async startModelBackgroundFetch(modelId, estimatedSize = 0) {
            try {
                this.addToast(`Spouštím stahování modelu ${modelId} na pozadí...`, 'info');

                await this.modelService.startBackgroundFetch(modelId, estimatedSize, (percent) => {
                    this.loadStatus = `Stahování na pozadí: ${percent}%`;
                    this.loadProgress = percent;
                });

                await this.modelService.refreshActiveDownloads();
            } catch (err) {
                if (err.name !== 'AbortError') {
                    logger.error('Background Fetch registration failed:', err);
                    this.addToast(err.message || 'Chyba při spouštění stahování na pozadí.', 'error');
                }
            }
        },

        async downloadAllMissingModels() {
            await this.modelService.downloadAllMissing();
        },

        async abortModelDownload(modelId) {
            await this.modelService.abortModelDownload(modelId);
        },

        _checkInitialHealth() {
            this.modalData.diagnostics = {
                webGpu: !!navigator.gpu,
                sab: typeof SharedArrayBuffer !== 'undefined',
                wasm: typeof WebAssembly !== 'undefined'
            };
        },

        toggleCompactMode() {
            this.settingsToggles.isCompactMode = !this.settingsToggles.isCompactMode;
            this.addToast(this.settingsToggles.isCompactMode ? 'Kompaktní režim zapnut' : 'Kompaktní režim vypnut', 'info');
        },

        _handleExternalLog(e) {
            const log = e.detail;
            this.systemLogs.push(log);
            if (this.systemLogs.length > 500) this.systemLogs.shift();
            if (this.isGuestMode) return;
            this.storageService.persistLog(log);
        },

        setLogFilter(type) { this.logFilter = type; },

        switchView(view) {
            this.uiService.switchView(view);
        },
        startChat() {
            const modelId = this.activeProfile.selectedModelId || this.models[0].id;
            this._warmModels(modelId);
            this.switchView('chat');
        },

        openModal(name, data) {
            this.uiService.openModal(name, data);
        },

        closeModal() {
            this.uiService.closeModal();
        },

        getStatus(current, max) {
            if (this.modelService && typeof this.modelService.getStatus === 'function') {
                return this.modelService.getStatus(current, max);
            }
            return 'healthy';
        },

        _verifyStorageIntegrity() {
            if (!this.storageService.checkAccessibility()) {
                this.addToast('Místní úložiště je nedostupné (např. anonymní režim). Nastavení nebude uloženo.', 'warning');
                return true;
            }

            const corrupted = this.storageService.verifyIntegrity(STORAGE_VALIDATORS);

            if (corrupted.length > 0) {
                logger.error('Corrupted local storage data detected', { corruptedItems: corrupted });
                this.triggerConfirm(
                    'Kritická chyba dat',
                    `Místní data (${corrupted.join(', ')}) jsou poškozena. Chcete provést opravu smazáním poškozených dat a restartem aplikace?`,
                    () => {
                        Object.values(APP_CONFIG.STORAGE_KEYS).forEach(k => localStorage.removeItem(k));
                        location.reload();
                    },
                    { confirmLabel: 'OPRAVIT' }
                );
                return false; // Stop loading broken data
            }
            return true;
        },

        async sendMessage() { // Orchestrates sending a message and running inference
            const validation = this.validationService.validateMessage(
                this.chatInput,
                this.pendingAttachments,
                { maxChars: this.maxChars, isLoading: this.isLoading }
            );

            if (!validation.isValid) {
                if (validation.error) this.addToast(validation.error, validation.type);
                return;
            }

            const text = validation.cleanText;

            // Handle in-chat commands
            if (text.startsWith('/')) {
                if (await this._handleChatCommand(text)) return;
            }

            this._addUserMessageToHistory(text);
            await this.runInference(text);
        },

        async _handleChatCommand(text) {
            const handled = await this.commandService.execute(text);
            if (handled) {
                this.chatInput = '';
            }
            return handled;
        },

        _addUserMessageToHistory(text) {
            this.conversationService.addUserMessage(this.chatHistory, text, this.pendingAttachments);
            this.chatInput = '';
            this.pendingAttachments = [];

            this.$nextTick(() => {
                this.scrollToBottom();
                this.autoResize();
            });
        },

        async copyToClipboard(text, eventOrEl = null) {
            const target = (eventOrEl instanceof Event) ? eventOrEl.currentTarget : eventOrEl;
            await this.uiService.copyToClipboard(text, target);
        },

        downloadCodeSnippet(codeText, lang) {
            this.uiService.downloadCodeSnippet(codeText, lang);
        },

        handleKbLinkClick(event) { // New method to handle clicks on KB links
            event.preventDefault();
            const kbId = event.target.dataset.kbId;
            if (kbId) this.knowledgeService.handleLinkClick(kbId, this);
        },
        
        addToast(message, type = 'info', isPersistent = false) {
            this.toastService.add(message, type, isPersistent);
        },

        removeToast(id) {
            this.toastService.remove(id);
        },
        
        autoResize(event) {
            const target = (event instanceof Event) ? event : this.$refs.inputTextArea;
            this.uiService.autoResize(target);
        },

        triggerAttachment() {
            if (!this.isVLM) { // Inverted logic based on request: "if is vlm dont see add button"
                this.uiService.triggerInputClick(this.$refs.attachmentInput);
            } else {
                this.uiService.toggleModal('settings');
            }
        },

        async handleAttachment(event) {
            const files = Array.from(event.target.files);
            const processed = await this.attachmentService.processFiles(files, (msg, type) => this.addToast(msg, type));
            this.pendingAttachments.push(...processed);
            event.target.value = ''; // Reset input for same file re-selection
        },

        removePendingAttachment(index) {
            this.pendingAttachments.splice(index, 1);
        },

        renderMarkdown(msgOrText) {
            const isStreaming = this.isLoading && msgOrText === this.chatHistory.at(-1);
            return this.markdownService.render(msgOrText, { 
                isStreaming 
            });
        },

        downloadFile(content, fileName, contentType) {
            this.uiService.downloadFile(content, fileName, contentType);
        },

        exportChatJSON() {
            const data = this.backupService.exportChatJSON(this.chatHistory);
            const date = new Date().toISOString().split('T')[0];
            this.downloadFile(data, `chat-export-${date}.json`, "application/json");
        },

        exportChatMarkdown() {
            const data = this.backupService.exportChatMarkdown(this.chatHistory);
            const date = new Date().toISOString().split('T')[0];
            this.downloadFile(data, `chat-export-${date}.md`, "text/markdown");
        },

        exportFullStateJSON() {
            const data = this.backupService.exportFullStateJSON(this.chatHistory, this.contextProfiles, this.activeProfileId);
            const date = new Date().toISOString().split('T')[0];
            this.downloadFile(data, `nevimto-backup-${date}.json`, "application/json");
            this.addToast('Kompletní záloha byla stažena', 'success');
        },

        async exportFullBackupZip() {
            this.isLoading = true;
            this.loadStatus = 'Generuji ZIP archiv...';
            try {
                const blob = await this.backupService.exportFullBackupZip(this.chatHistory, this.contextProfiles, this.activeProfileId);
                const date = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
                this.downloadFile(blob, `nevimto-backup-${date}.zip`, "application/zip");
                this.addToast('Kompletní ZIP záloha byla vytvořena', 'success');
            } catch (err) {
                this.addToast(`Chyba: ${err.message}`, 'error');
            } finally {
                this.isLoading = false;
                this.loadStatus = '';
            }
        },

        // --- IndexedDB Operations ---
        async _initializeServices() {
            this.storageService = new StorageService(undefined, undefined, APP_CONFIG.STORAGE_KEYS);
            this.profileService = new ProfileService();
            this.backupService = new BackupService();
            this.knowledgeService = new KnowledgeService(APP_CONFIG.SIMILARITY_THRESHOLD);
            this.commandService = new CommandService(bus, {
                profiles: () => this.contextProfiles,
                models: () => this.models,
                activeProfileId: () => this.activeProfileId,
                activeProfile: () => this.activeProfile
            });
            this.toastService = new ToastService(this.toasts);
            this.uiService = new UIService(bus, APP_CONFIG, {
                activeView: () => this.activeView,
                activeModal: () => this.activeModal
            });
            this.validationService = new ValidationService();
            this.settingsService = new SettingsService(APP_CONFIG.STORAGE_KEYS);
            this.modelService = new ModelService(this, APP_CONFIG.LIMITS);
            this.systemInfoService = new SystemInfoService();
            this.attachmentService = new AttachmentService();
            this.snapshotService = new SnapshotService();
            this.pwaService = new PwaService(this);
            this.eventService = new EventService(this);
            this.markdownService = new MarkdownService();
            this.messageService = new MessageService(this.modelService, this.maxContextTokens);
            this.conversationService = new ConversationService(this.messageService, this.modelService);
            this.isPwaInstalled = this.pwaService.detectStatus();
            this.pwaService.register();
            if (!this._verifyStorageIntegrity()) return;
            this._checkInitialHealth();
        },

        _setupBusListeners() {
            bus.on('view:change', ({ view }) => {
                this.activeModal = null;
                this.uiService.withViewTransition(() => this.activeView = view);
            });

            bus.on('modal:open', ({ name, data }) => {
                if (data && Object.hasOwn(this.modalData, name)) {
                    this.modalData[name] = data;
                }
                this.activeModal = name;
            });

            bus.on('modal:close', () => {
                this.activeModal = null;
                this.modalIsLoading = false;
                this.selectedTags = [];
                this.isTagDropdownOpen = false;
                this.globalSearch = '';
                this.mergeSourceId = null;
            });

            bus.on('toast', ({ msg, type, persistent }) => {
                this.addToast(msg, type, persistent);
            });
            
            bus.on('chat:clear', () => this.clearHistory());
            
            bus.on('profile:update-model', ({ profileId, modelId }) => this.updateProfileModel(profileId, modelId));
            
            bus.on('profile:switch', ({ id }) => this.activeProfileId = id);
        },

        async _loadInitialState() {
            this.settingsToggles = this.settingsService.init(this.settingsToggles);
            
            const { profiles, activeProfileId } = await this.profileService.initProfiles(this.storageService, APP_CONFIG.STORAGE_KEYS);
            this.activeProfileId = activeProfileId;
            this.contextProfiles = profiles;
            
            this.chatHistory = await this.conversationService.initHistory(this.storageService, APP_CONFIG.STORAGE_KEYS);
            this.systemLogs = await this.storageService.initLogs(APP_CONFIG.LIMITS.LOG_DISPLAY_LIMIT);
            
            this._ensureActiveProfileModel();
            await this.modelService.notifyMissingModelsOnStartup();
        },

        _ensureActiveProfileModel() {
            const profile = this.contextProfiles.find(p => p.id === this.activeProfileId);
            if (profile && !profile.selectedModelId) {
                profile.selectedModelId = this.models[0].id;
                this._saveProfilesToDB(this.contextProfiles);
            }
        },

        async _saveProfilesToDB(profiles) { // Saves context profiles to IDB
            if (this.isGuestMode) return;
            this.storageService.saveProfiles(profiles)
                .catch(err => logger.error('Failed to save profiles to IDB', err));
        },

        async vacuumDatabase() {
            this.isLoading = true;
            this.loadStatus = 'Optimalizuji databázi...';

            try {
                await this.storageService.vacuum();
                this.addToast('Databáze byla optimalizována.', 'success');
            } catch (err) { this.addToast('Optimalizace selhala: ' + err.message, 'error'); } 
            finally {
                this.isLoading = false;
                this.loadStatus = '';
            } // The following methods are now directly called by watchers or other app logic
        },

        async runAutoBackup() {
            try {
                await this.snapshotService.save(
                    this.storageService,
                    this.chatHistory,
                    this.contextProfiles,
                    this.activeProfileId
                );
                this.lastAutoSave = new Date().toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
            } catch (err) {
                logger.error('Auto-backup failed:', err);
            }
        },

        triggerRestoreBackup(dryRun = false) {
            this.backupService.triggerPicker(this, dryRun);
        },

        async handleRestoreBackup(event) {
            const file = event.target.files[0];
            if (!file) return;

            try {
                const imported = await this.backupService.readBackupFile(file);
                this.backupService.applyImport(
                    imported, 
                    this, 
                    localStorage.getItem(APP_CONFIG.STORAGE_KEYS.LAST_MODIFIED)
                );
            } catch (err) {
                this.addToast('Obnovení selhalo: ' + err.message, 'error');
            } finally {
                event.target.value = '';
            }
        },

        async addKnowledge(text, importanceOverride = null, lockedOverride = null) {
            const content = text || this.kbInput.trim();
            if (!content) return;

            this.isLoading = true;
            this.loadStatus = 'Indexuji znalost...';

            try {
                const newEntry = await this.knowledgeService.createEntry(content, {
                    importance: importanceOverride || this.kbImportance,
                    locked: lockedOverride !== null ? lockedOverride : this.kbLocked,
                    onProgress: (status, progress) => {
                        this.loadStatus = status;
                        this.loadProgress = progress;
                    }
                });
                this.activeProfile.knowledgeBase.unshift(newEntry);
                this.addToast('Uloženo do znalostní báze', 'success');
            } catch (e) {
                this.addToast('Chyba při indexaci znalosti', 'error');
                logger.error('Knowledge indexing failed', e);
            } finally {
                this.isLoading = false;
                this.loadStatus = '';
                this.kbInput = '';
                this.kbImportance = 1;
                this.kbLocked = false;
            }
        },

        removeKnowledge(id) {
            this.triggerConfirm('Odstranit znalost', 'Opravdu chcete tuto informaci smazat?', () => {
                this.activeProfile.knowledgeBase = this.activeProfile.knowledgeBase.filter(k => k.id !== id);
            }); // Vue reactivity handles updates
        },

        toggleKBLock(kb) {
            kb.locked = !kb.locked;
            this.addToast(kb.locked ? 'Znalost uzamčena do kontextu' : 'Znalost odemčena', 'info');
        },

        updateProfileModel(profileId, modelId) {
            const profile = this.contextProfiles.find(p => p.id === profileId);
            if (profile) {
                profile.selectedModelId = modelId;
                this.addToast(`Model pro profil "${profile.name}" byl změněn.`, 'info');
            }
        },

        toggleTagFilter(tag) {
            const idx = this.selectedTags.indexOf(tag);
            if (idx > -1) this.selectedTags.splice(idx, 1);
            else this.selectedTags.push(tag);
        },

        addTagToProfile(profile) {
            const tag = prompt("Zadejte nový tag:")?.trim();
            this.profileService.addTag(profile, tag);
        },

        removeTagFromProfile(profile, tag) {
            this.profileService.removeTag(profile, tag);
        },

        createProfile() {
            const name = prompt('Zadejte název nového profilu:')?.trim();
            if (name) {
                const newProfile = this.profileService.create(name);
                this.contextProfiles.push(newProfile); // Vue reactivity handles updates
                this.activeProfileId = newProfile.id;
                this.addToast('Profil vytvořen', 'success');
            }
        },

        renameProfile(profile) {
            const newName = prompt('Přejmenovat profil:', profile.name)?.trim();
            if (newName) profile.name = newName;
        },

        deleteProfile(id) {
            if (this.contextProfiles.length <= 1) return;
            this.triggerConfirm(
                'Smazat profil',
                'Opravdu chcete tento profil včetně všech jeho znalostí smazat? Tuto akci nelze vrátit.',
                () => {
                    this.contextProfiles = this.contextProfiles.filter(p => p.id !== id); 
                    if (this.activeProfileId === id) this.activeProfileId = this.contextProfiles[0].id;
                    this.addToast('Profil smazán', 'info');
                }
                , { confirmLabel: 'SMAZAT' }
            );
        },

        triggerConfirm(title, message, onConfirm, options = {}) {
            this.uiService.triggerConfirm(title, message, onConfirm, options);
        },

        highlightText,

        rollbackTo(index) {
            if (this.isLoading) return;
            const msg = this.chatHistory[index];
            this.triggerConfirm(
                'Návrat v čase',
                `Opravdu se chcete vrátit k bodu: "${msg.content.substring(0, 30)}..."? Všechny následující zprávy budou odstraněny.`,
                () => {
                    this.conversationService.rollback(this.chatHistory, index);
                    this.switchView('chat');
                    this.addToast('Stav aplikace byl obnoven.', 'info');
                },
                { confirmLabel: 'OBNOVIT' }
            );
        },

        startEdit(index) { this.editingIndex = index; this.editBuffer = this.chatHistory[index].content; },

        cancelEdit() { this.editingIndex = null; this.editBuffer = ''; },

        async submitEdit(index) {
            const newText = this.editBuffer.trim();
            if (!newText || newText === this.chatHistory[index].content) {
                return this.cancelEdit();
            }
            this.chatHistory[index].content = newText; // Vue reactivity handles updates
            this.editingIndex = null;
            this.chatHistory.splice(index + 1);
            await this.runInference(newText);
        },

        downloadMessage(content, index) {
            this.uiService.downloadMessage(content, index);
        },

        exportProfileJSON(profile) {
            const { data, fileName } = this.backupService.exportProfileJSON(profile);
            this.downloadFile(data, fileName, "application/json");
            this.addToast('Profil exportován', 'success');
        },

        triggerProfileImport() { // Triggers hidden file input for profile import
            this.uiService.triggerInputClick(this.$refs.profileImportInput);
        },

        async handleProfileImport(event) {
            const file = event.target.files[0];
            if (!file) return;
            try {
                const imported = await this.backupService.readBackupFile(file);
                const profile = this.profileService.validateAndPrepareImport(imported);
                
                this.contextProfiles.push(profile);
                this.activeProfileId = profile.id;
                this.addToast(`Profil "${profile.name}" byl importován`, 'success');
            } catch (err) {
                this.addToast('Import selhal: ' + err.message, 'error');
            } finally {
                event.target.value = '';
            }
        },

        performMerge() {
            if (!this.mergeSourceId) return;
            const source = this.contextProfiles.find(p => p.id === this.mergeSourceId);
            const target = this.activeProfile;

            this.modalIsLoading = true;
            try {
                if (source && target && source.id !== target.id) {
                    target.knowledgeBase = this.profileService.merge(target, source); // Use profileService
                    this.addToast(`Profil "${source.name}" byl sloučen do "${target.name}"`, 'success');
                    this.closeModal();
                }
            } finally {
                this.modalIsLoading = false;
            }
        },

        removeQueuedMessage(index) {
            this.conversationService.removeFromQueue(this.messageQueue, index);
            this.addToast('Zpráva odstraněna z fronty.', 'info');
        },

        editQueuedMessage({ index, text }) {
            this.conversationService.updateQueuedMessage(this.messageQueue, index, text);
            this.addToast('Zpráva ve frontě byla upravena.', 'info');
        },

        async stopInference() {
            this.isAborting = true;
            this.messageQueue = []; // Clear the queue if user manually stops
            await stopAI();
            this.isLoading = false;
            this.addToast('Generování zastaveno.', 'warning');
            this.isTyping = false; // Stop typing indicator on abort
        },

        async openCompare(snapshot) {
            const data = this.snapshotService.compare(
                snapshot,
                this.contextProfiles,
                this.chatHistory,
                localStorage.getItem(APP_CONFIG.STORAGE_KEYS.LAST_MODIFIED)
            );
            this.openModal('compare', data);
        },

        async openRecoveryManager() {
            try {
                const snapshots = await this.snapshotService.load(this.storageService);
                this.openModal('recovery', snapshots);
            } catch (err) {
                this.addToast('Nepodařilo se načíst snímky: ' + err.message, 'error');
            }
        },

        confirmRestoreSnapshot(snapshot) {
            this.snapshotService.applySnapshot(snapshot, this);
        },

        purgeOldHistory() {
            this.triggerConfirm(
                'Vyčistit úložiště',
                'Tato akce smaže veškerou historii chatu pro uvolnění místa. Vaše znalosti a profily zůstanou zachovány.',
                () => {
                    this.chatHistory = []; // Vue reactivity handles updates
                    this.addToast('Historie chatu byla vymazána.', 'info');
                },
                { confirmLabel: 'VYČISTIT' }
            );
        },

        async regenerateResponse() {
            if (this.isLoading || this.chatHistory.length === 0) return;
            const query = this.conversationService.prepareRegenerate(this.chatHistory);
            if (query) {
                await this.runInference(query);
            }
        },

        undoLastAction() {
            if (this.isLoading || this.chatHistory.length === 0) return;
            this.conversationService.undo(this.chatHistory);
            this.addToast('Poslední akce vrácena.', 'info');
        },

        deleteMessage(index) {
            this.triggerConfirm(
                'Odstranit zprávu',
                'Opravdu chcete tuto zprávu trvale odstranit z historie?',
                () => { // Vue reactivity handles updates
                    this.chatHistory.splice(index, 1);
                    this.addToast('Zpráva odstraněna.', 'info');
                },
                { confirmLabel: 'SMAZAT' }
            );
        },

        clearHistory() {
            this.triggerConfirm(
                'Smazat historii',
                'Opravdu chcete smazat celou historii chatu? Tuto akci nelze vrátit.',
                async () => { // Vue reactivity handles updates
                    this.chatHistory = [];
                    this.historyManager.clear();
                    await Promise.all([
                        this.storageService.saveHistory([]),
                        this.storageService.clearHistoryStacks()
                    ]);
                    this.loadStatus = '';
                },
                { confirmLabel: 'SMAZAT' }
            );
        },

        async runDiagnostics() {
            this.isLoading = true;
            this.loadStatus = 'Provádím diagnostiku...';

            this.modalData.diagnostics = await this.systemInfoService.runFullDiagnostics(
                this.storageUsage
            );
            this.openModal('diagnostics');
            this.isLoading = false;
            this.loadStatus = '';
        },

        nuclearReset() {
            this.triggerConfirm(
                'TOTÁLNÍ RESET',
                'Tato akce nenávratně smaže veškerá místní data: historii chatu, veškeré kontextové profily i automatické zálohy v IndexedDB. Aplikace bude poté restartována. Chcete pokračovat?',
                async () => {
                    this.modalIsLoading = true;
                    try {
                        await this.systemInfoService.nuclearReset(this.storageService);
                    } finally {
                        // This finally block might not always execute before reload, but it's good practice.
                        this.modalIsLoading = false;
                    }
                }
                , { confirmLabel: 'RESET' }
            );
        },

        async runInference(query, context = "") {
            this.uiService.withViewTransition(() => {
                this.isLoading = true;
                this.isTyping = true;
                this.loadStatus = 'Initializing...';
                this.loadProgress = 0;
            });

            let assistantMsg = null;
            try {
                const setup = await this._initializeInferenceContext(query, context);
                assistantMsg = setup.assistantMsg;

                // Use the model defined in the active profile
                await askAI(this.activeModel.id, setup.modelMessages, (statusText, progress) => {
                        this.loadStatus = statusText;
                        this.loadProgress = progress;
                    },
                    (partialText) => {
                        assistantMsg.content = partialText; // Update content of the placeholder message
                        this.$nextTick(this.scrollToBottom);
                    }
                    , setup.engineOptions
                );
                this.$nextTick(this.scrollToBottom);
            } catch (e) {
                this._handleInferenceError(e, assistantMsg);
            } finally {
                this._resetLoadingState();
            }
        },

        async _initializeInferenceContext(query, context) {
            const { assistantMsg, modelMessages, engineOptions } = await this.conversationService.prepareInference({
                query,
                context,
                activeProfile: this.activeProfile,
                chatHistory: this.chatHistory,
                knowledgeService: this.knowledgeService
            });

            this.chatHistory.push(assistantMsg); // Add placeholder after building context
            return { assistantMsg, modelMessages, engineOptions };
        },

        _handleInferenceError(e, assistantMsg) {
            if (this.isAborting) return;
            
            this.toastService.add(`Chyba: ${e.message}`, 'error');
            this.conversationService.cleanupError(this.chatHistory, assistantMsg);
        },

        async _performSemanticSearch(query) {
            if (!this.activeProfile?.knowledgeBase) return "";
            return await this.knowledgeService.search(query, this.activeProfile.knowledgeBase);
        },

        _resetLoadingState() { // Resets loading indicators
            this.isLoading = false;
            this.loadStatus = '';
            this.loadProgress = 0;
            this.isTyping = false;
            this.isAborting = false;

            // Check if we need to summarize the history to save context
            this._handleAutomaticSummarization();

            // Process the next message in the queue if available
            if (this.messageQueue.length > 0) {
                const nextMsg = this.messageQueue.shift();
                this.chatInput = nextMsg.text;
                this.pendingAttachments = nextMsg.attachments;
                this.$nextTick(() => this.sendMessage());
            }
        },

        async _handleAutomaticSummarization() {
            if (this.isGuestMode || this.chatHistory.length < 10) return;

            const usage = this.contextUsage;
            if (parseFloat(usage.percentage) > 75) {
                logger.info("Context limit approaching, initiating automatic summarization...");
                try {
                    const { summary, midPoint } = await this.conversationService.summarize(
                        this.chatHistory, 
                        this.activeModel.id
                    );

                    if (this.conversationService.applySummarization(this.activeProfile, this.chatHistory, summary, midPoint)) {
                        this.addToast('Historie byla automaticky shrnuta pro zachování výkonu.', 'info');
                    }
                } catch (err) {
                    this.conversationService.handleSummarizationError(err);
                }
            }
        },

        scrollToBottom() {
            this.uiService.scrollToBottom(this.$refs.chatScroll);
        }
    }
}).mount('#app');