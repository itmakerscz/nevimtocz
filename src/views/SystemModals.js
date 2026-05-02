// src/views/SystemModals.js
import ContextMonitor from './ContextMonitor.js';

export default {
    name: 'SystemModals',
    components: { 'context-monitor': ContextMonitor },
    props: ['activeModal', 'modalData', 'contextProfiles', 'activeProfile', 'activeProfileId', 'mergeSourceId', 'contextUsage', 'maxContextChars', 'modalIsLoading', 'filteredCompareData'],
    emits: ['close', 'confirm', 'secondary', 'merge', 'update:merge-source-id', 'open-compare', 'restore-snapshot', 'run-backup', 'nuclear-reset'],
    template: `
        <div class="system-modals-root">
            <!-- Confirm Modal -->
            <div v-if="activeModal === 'confirm'" class="modal-overlay" role="dialog">
                <div class="confirm-modal">
                    <div class="ui-panel-header">
                        <h3>{{ modalData.confirm.title }}</h3>
                        <button @click="$emit('close')" class="ui-button is-icon"><span class="material-symbols-outlined">close</span></button>
                    </div>
                    <section class="modal-body">
                        <p>{{ modalData.confirm.message }}</p>
                    </section>
                    <div class="modal-footer">
                        <button @click="$emit('confirm')" class="ui-button" :disabled="modalIsLoading">{{ modalData.confirm.confirmLabel }}</button>
                        <button v-if="modalData.confirm.secondaryAction" @click="$emit('secondary')" class="ui-button is-secondary" :disabled="modalIsLoading">{{ modalData.confirm.secondaryLabel }}</button>
                        <button @click="$emit('close')" class="ui-button is-secondary" :disabled="modalIsLoading">{{ modalData.confirm.cancelLabel }}</button>
                    </div>
                </div>
            </div>

            <!-- Diagnostics Modal -->
            <div v-if="activeModal === 'diagnostics'" class="modal-overlay">
                <div class="settings-page">
                    <div class="panel-container">
                        <div class="ui-panel-header">
                            <div class="settings-title-group">
                                <span class="material-symbols-outlined">terminal</span>
                                <h2>DIAGNOSTIKA</h2>
                            </div>
                            <button @click="$emit('close')" class="ui-button is-icon"><span class="material-symbols-outlined">close</span></button>
                        </div>
                        <div class="modal-body" v-if="modalData.diagnostics">
                            <div class="settings-grid">
                                <div class="settings-block">
                                    <div class="ui-label">PROHLÍŽEČ</div>
                                    <div class="block-content">
                                        <div class="diag-list-item">GPU <span :class="['status-dot', modalData.diagnostics.webGpu ? 'healthy' : 'critical']"></span></div>
                                        <div class="diag-list-item">WASM <span :class="['status-dot', modalData.diagnostics.wasm ? 'healthy' : 'critical']"></span></div>
                                    </div>
                                </div>
                                <div class="settings-block full-width">
                                    <div class="ui-label">KONTEXTOVÉ OKNO</div>
                                    <context-monitor 
                                        :usage="contextUsage" 
                                        :max-tokens="maxContextChars / 4" />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Merge Modal -->
            <div v-if="activeModal === 'merge'" class="modal-overlay">
                <div class="settings-page">
                    <div class="ui-panel-header">
                        <div class="settings-title-group">
                            <span class="material-symbols-outlined">call_merge</span>
                            <h2>SLOUČIT KONTEXTY</h2>
                        </div>
                        <button @click="$emit('close')" class="ui-button is-icon"><span class="material-symbols-outlined">close</span></button>
                    </div>
                    <div class="modal-body">
                        <p>Importovat znalosti do profilu <strong>{{ activeProfile.name }}</strong> z:</p>
                        <select :value="mergeSourceId" @change="$emit('update:merge-source-id', $event.target.value)" class="ui-select merge-select">
                            <option v-for="p in contextProfiles.filter(p => p.id !== activeProfileId)" :key="p.id" :value="p.id">{{ p.name }}</option>
                        </select>
                    </div>
                    <div class="modal-footer">
                        <button @click="$emit('merge')" class="ui-button" :disabled="!mergeSourceId || modalIsLoading">SLOUČIT</button>
                        <button @click="$emit('close')" class="ui-button is-secondary" :disabled="modalIsLoading">ZRUŠIT</button>
                    </div>
                </div>
            </div>

            <!-- Recovery Modal -->
            <div v-if="activeModal === 'recovery'" class="modal-overlay">
                <div class="settings-page">
                    <div class="panel-container">
                        <div class="ui-panel-header">
                            <div class="settings-title-group">
                                <span class="material-symbols-outlined">settings_backup_restore</span>
                                <h2>SNÍMKY</h2>
                            </div>
                            <button @click="$emit('close')" class="ui-button is-icon"><span class="material-symbols-outlined">close</span></button>
                        </div>
                        <div class="modal-body">
                            <div class="snapshot-list">
                                <div v-for="snap in modalData.recovery" :key="snap.timestamp" class="snapshot-item">
                                    <div class="snap-info">
                                        <div class="snap-time">{{ new Date(snap.timestamp).toLocaleString('cs-CZ') }}</div>
                                        <div class="snap-meta">{{ snap.chatHistory.length }} zpráv</div>
                                    </div>
                                    <div class="snap-actions">
                                        <button @click="$emit('open-compare', snap)" class="ui-button is-icon sm"><span class="material-symbols-outlined">difference</span></button>
                                        <button @click="$emit('restore-snapshot', snap)" class="ui-button is-icon sm"><span class="material-symbols-outlined">restore</span></button>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button @click="$emit('run-backup')" class="ui-button" :disabled="modalIsLoading">NOVÝ SNÍMEK</button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Compare Modal -->
            <div v-if="activeModal === 'compare'" class="modal-overlay">
                <div class="settings-page">
                    <div class="panel-container">
                        <div class="ui-panel-header">
                            <div class="settings-title-group">
                                <span class="material-symbols-outlined">difference</span>
                                <h2>POROVNÁNÍ</h2>
                            </div>
                            <button @click="$emit('close')" class="ui-button is-icon"><span class="material-symbols-outlined">close</span></button>
                        </div>
                        <div class="modal-body" v-if="filteredCompareData">
                            <div class="compare-details">
                                <div class="ui-label">METRIKY</div>
                                <div v-for="m in filteredCompareData.metrics" :key="m.label" class="ui-list-item" style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem; padding: 0.75rem;">
                                    <span>{{ m.label }}</span>
                                    <span>{{ m.current }}</span>
                                    <span :class="{ 'diff-alert': m.isDiff }">{{ m.snap }}</span>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button @click="$emit('restore-snapshot', modalData.compare.snapshot)" class="ui-button is-danger-solid" :disabled="modalIsLoading">OBNOVIT SNÍMEK</button>
                            <button @click="$emit('close')" class="ui-button" :disabled="modalIsLoading">ZAVŘÍT</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `
};