// src/views/SettingsView.js

export default {
    name: 'SettingsView',
    props: ['settingsToggles', 'systemHealthClass', 'storageUsage', 'systemLogs', 'deferredPrompt', 'models', 'activeDownloads'],
    emits: ['close', 'update-theme', 'toggle-compact', 'open-kb', 'open-history', 'open-recovery', 'trigger-restore', 'export-zip', 'diagnostics', 'clear-history', 'nuclear-reset', 'install-pwa', 'start-model-background-fetch', 'download-all-missing', 'abort-model-download', 'clear-cache-update'],
    template: `
      <div class="panel-container">
        <div class="ui-panel-header">
          <div class="settings-title-group">
            <div class="status-dot" :class="[systemHealthClass]" :title="'Systémový stav: ' + systemHealthClass"></div>
            <h2 id="settings-modal-title">COMMAND CENTER</h2>
          </div>
          <button @click="$emit('close')" class="ui-button is-icon" title="Zavřít"><span class="material-symbols-outlined">close</span></button>
        </div>

        <div class="settings-grid">
          <div class="settings-block">
            <div class="ui-label">PROSTŘEDÍ</div>
            <div class="block-content">
              <div class="theme-toggle-group">
                <button @click="$emit('update-theme', 'light')" :class="['ui-button is-toggle', { active: settingsToggles.theme === 'light' }]"><span class="material-symbols-outlined">light_mode</span></button>
                <button @click="$emit('update-theme', 'system')" :class="['ui-button is-toggle', { active: settingsToggles.theme === 'system' }]"><span class="material-symbols-outlined">brightness_auto</span></button>
                <button @click="$emit('update-theme', 'dark')" :class="['ui-button is-toggle', { active: settingsToggles.theme === 'dark' }]"><span class="material-symbols-outlined">dark_mode</span></button>
              </div>
              <button @click="$emit('open-kb')" class="ui-button"><span class="material-symbols-outlined">psychology</span> Znalostní Báze</button>
              <button @click="$emit('open-history')" class="ui-button"><span class="material-symbols-outlined">history</span> Časová Osa</button>
              <button @click="$emit('toggle-compact')" :class="['ui-button is-toggle', { active: settingsToggles.isCompactMode }]"><span class="material-symbols-outlined">view_compact</span> Kompaktní Režim</button>
              <button @click="settingsToggles.isDyslexic = !settingsToggles.isDyslexic" :class="['ui-button is-toggle', { active: settingsToggles.isDyslexic }]"><span class="material-symbols-outlined">spellcheck</span> Dyslektické Písmo</button>
              <button @click="$emit('clear-cache-update')" class="ui-button"><span class="material-symbols-outlined">cached</span> Aktualizovat Jádro</button>
            </div>
          </div>

          <div class="settings-block">
            <div class="ui-label">SPRÁVA DAT</div>
            <div class="block-content">
              <button @click="$emit('open-recovery')" class="ui-button"><span class="material-symbols-outlined">settings_backup_restore</span> Snímky</button>
              <button @click="$emit('trigger-restore')" class="ui-button"><span class="material-symbols-outlined">upload_file</span> Importovat JSON</button>
              <button @click="$emit('export-zip')" class="ui-button"><span class="material-symbols-outlined">archive</span> Exportovat ZIP Zálohu</button>
            </div>
          </div>

          <div class="settings-block">
            <div class="ui-label">SYSTÉM</div>
            <div class="block-content">
              <button v-if="deferredPrompt" @click="$emit('install-pwa')" class="ui-button pulse"><span class="material-symbols-outlined">install_desktop</span> Instalovat PWA</button>
              <button @click="$emit('diagnostics')" class="ui-button"><span class="material-symbols-outlined">terminal</span> Diagnostika</button>
              <button @click="$emit('clear-history')" class="ui-button is-danger"><span class="material-symbols-outlined">delete_sweep</span> Vymazat Chat</button>
              <button @click="$emit('nuclear-reset')" class="ui-button is-danger-solid"><span class="material-symbols-outlined">restart_alt</span> TOTÁLNÍ RESET</button>
            </div>
          </div>

          <div class="settings-block">
            <div class="ui-label">MODELY</div>
            <div class="block-content">
              <button @click="$emit('download-all-missing')" class="ui-button" style="margin-bottom: 0.75rem; border-color: var(--blue-color); color: var(--blue-color);">
                <span class="material-symbols-outlined">cloud_download</span> Stáhnout chybějící
              </button>
              <div v-for="model in models" :key="model.id" class="ui-list-item">
                <div class="ui-list-main">
                  <div class="ui-list-content">{{ model.name }}</div>
                  <div class="ui-list-secondary">{{ (model.estimatedSize / (1024 * 1024 * 1024)).toFixed(2) }} GB</div>
                </div>
                <div v-if="activeDownloads && activeDownloads.includes(model.id)" class="download-status-group">
                  <div class="spinner sm" title="Stahování na pozadí..."></div>
                  <button @click="$emit('abort-model-download', model.id)" class="ui-button is-icon sm danger" title="Zrušit stahování">
                    <span class="material-symbols-outlined">close</span>
                  </button>
                </div>
                <button v-else @click="$emit('start-model-background-fetch', model.id, model.estimatedSize)" class="ui-button is-icon sm" title="Stáhnout model na pozadí">
                  <span class="material-symbols-outlined">download</span>
                </button>
              </div>
            </div>
          </div>

          <div class="settings-block full-width">
            <div class="ui-label">KLÁVESOVÉ ZKRATKY</div>
            <div class="block-content">
                <dl class="shortcut-list">
                    <div class="shortcut-item"><dt><kbd>Ctrl</kbd> + <kbd>B</kbd></dt><dd>Kompaktní režim</dd></div>
                    <div class="shortcut-item"><dt><kbd>Ctrl</kbd> + <kbd>S</kbd></dt><dd>Export ZIP</dd></div>
                    <div class="shortcut-item"><dt><kbd>Ctrl</kbd> + <kbd>/</kbd></dt><dd>Znalostní báze</dd></div>
                </dl>
            </div>
          </div>

          <div class="settings-block full-width">
            <div class="ui-label">SYSTÉMOVÝ LOG</div>
            <div class="log-console">
              <div v-for="log in systemLogs" :key="log.id" :class="['log-entry', log.type]">
                <span class="log-time">[{{ log.time }}]</span> {{ log.msg }}
              </div>
            </div>
          </div>
        </div>

        <div class="settings-footer">
          <div class="system-id">CORE v2.5 // PRIVÁTNÍ REŽIM</div>
          <div class="storage-info">VYUŽITÍ: {{ storageUsage }}</div>
        </div>
      </div>
    `
};