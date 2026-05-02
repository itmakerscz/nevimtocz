// src/views/KbView.js
export default {
    name: 'KbView',
    props: ['activeProfile', 'filteredProfiles', 'allAvailableTags', 'profileSearchQuery', 'selectedTags', 'isTagDropdownOpen', 'activeProfileId', 'contextProfiles', 'kbInput', 'kbImportance', 'kbLocked', 'storageUsage', 'maxSystemPromptChars', 'systemPromptCharClass', 'models'],
    emits: ['close', 'update:profile-search-query', 'update:active-profile-id', 'create-profile', 'rename-profile', 'delete-profile', 'open-merge', 'export-profile', 'trigger-import', 'remove-tag', 'add-tag', 'update:kb-input', 'update:kb-importance', 'update:kb-locked', 'add-knowledge', 'toggle-kb-lock', 'remove-knowledge', 'update-profile-model'],
    template: `
        <div class="settings-page">
        <div class="panel-container">
          <div class="ui-panel-header">
            <div class="settings-title-group">
              <span class="material-symbols-outlined" aria-hidden="true">psychology</span>
              <h2 id="kb-modal-title">SPRÁVA ZNALOSTÍ</h2>
            </div>
            <button @click="$emit('close')" class="ui-button is-icon" title="Zavřít"><span class="material-symbols-outlined">close</span></button>
          </div>

          <div class="ui-management-grid kb-fullscreen-grid">
            <div class="kb-management-pane">
              <div class="profile-manager">
                <div class="ui-label profile-title">PROFIL KONTEXTU</div>
                <div class="profile-search-row">
                  <span class="material-symbols-outlined sm-icon">search</span>
                  <input :value="profileSearchQuery" @input="$emit('update:profile-search-query', $event.target.value)" placeholder="Hledat profil..." class="ui-input profile-search-input">
                </div>
                
                <div class="profile-selector-row">
                  <select :value="activeProfileId" @change="$emit('update:active-profile-id', $event.target.value)" class="ui-select profile-select">
                    <option v-for="p in filteredProfiles" :key="p.id" :value="p.id">{{ p.name }}</option>
                  </select>
                  <button @click="$emit('create-profile')" class="ui-button is-icon sm"><span class="material-symbols-outlined">add_box</span></button>
                  <button @click="$emit('rename-profile', activeProfile)" class="ui-button is-icon sm"><span class="material-symbols-outlined">edit_note</span></button>
                  <button @click="$emit('delete-profile', activeProfileId)" class="ui-button is-icon sm" :disabled="contextProfiles.length <= 1"><span class="material-symbols-outlined">delete_forever</span></button>
                  <button @click="$emit('open-merge')" class="ui-button is-icon sm"><span class="material-symbols-outlined">call_merge</span></button>
                  <button @click="$emit('export-profile', activeProfile)" class="ui-button is-icon sm"><span class="material-symbols-outlined">upload</span></button>
                  <button @click="$emit('trigger-import')" class="ui-button is-icon sm"><span class="material-symbols-outlined">download_2</span></button>
                </div>

                <div class="profile-model-selector" v-if="activeProfile.id">
                  <div class="ui-label tiny">VÝCHOZÍ MODEL PROFILU</div>
                  <select :value="activeProfile.selectedModelId" @change="$emit('update-profile-model', { profileId: activeProfile.id, modelId: $event.target.value })" class="ui-select profile-select">
                    <option v-for="model in models" :key="model.id" :value="model.id">{{ model.name }}</option>
                  </select>
                </div>

                <div class="profile-temperature-selector" v-if="activeProfile.id">
                  <div class="ui-label tiny">KREATIVITA (TEMPERATURE): {{ activeProfile.temperature ?? 0.7 }}</div>
                  <div class="slider-container" style="padding-block: 0.5rem;">
                    <input type="range" v-model.number="activeProfile.temperature" min="0" max="2" step="0.1" style="width: 100%; accent-color: var(--red-color);">
                  </div>
                </div>

                <div class="profile-threshold-selector" v-if="activeProfile.id">
                  <div class="ui-label tiny">SÍLA SÉMANTIKY (THRESHOLD): {{ activeProfile.semanticThreshold ?? 0.5 }}</div>
                  <div class="slider-container" style="padding-block: 0.5rem;">
                    <input type="range" v-model.number="activeProfile.semanticThreshold" min="0.1" max="0.9" step="0.05" style="width: 100%; accent-color: var(--status-healthy);">
                  </div>
                </div>

                <div class="active-profile-tags" v-if="activeProfile.id">
                  <div class="ui-label tiny">TAGY PROFILU</div>
                  <div class="tag-list">
                    <span v-for="tag in (activeProfile.tags || [])" :key="tag" class="ui-tag profile-tag">
                      #{{ tag }}
                      <button @click="$emit('remove-tag', {profile: activeProfile, tag})" class="remove-tag">×</button>
                    </span>
                    <button @click="$emit('add-tag', activeProfile)" class="ui-button is-icon sm add-tag-btn"><span class="material-symbols-outlined">add</span></button>
                  </div>
                </div>

                <div class="system-prompt-editor">
                  <div class="ui-label tiny">PERSONA / INSTRUKCE</div>
                  <textarea v-model="activeProfile.systemPrompt" class="ui-input kb-textarea system-prompt-input"></textarea>
                  <div class="char-counter sidebar-counter" :class="systemPromptCharClass">
                    {{ (activeProfile.systemPrompt || "").length }}/{{ maxSystemPromptChars }}
                  </div>
                </div>
              </div>

              <div class="sidebar-search">
                <textarea :value="kbInput" @input="$emit('update:kb-input', $event.target.value)" placeholder="Nová znalost..." class="ui-input kb-textarea"></textarea>
                <div class="kb-options-row">
                  <div class="kb-importance-selector">
                    <label>PRIORITA:</label>
                    <select :value="kbImportance" @change="$emit('update:kb-importance', Number($event.target.value))" class="ui-select">
                      <option v-for="n in 5" :key="n" :value="n">{{ '★'.repeat(n) }}</option>
                    </select>
                  </div>
                  <button @click="$emit('update:kb-locked', !kbLocked)" :class="['ui-button is-toggle', { active: kbLocked }]">
                    <span class="material-symbols-outlined">{{ kbLocked ? 'push_pin' : 'keep_public' }}</span>
                  </button>
                </div>
                <button @click="$emit('add-knowledge')" class="ui-button is-add-kb"><span class="material-symbols-outlined">add</span> <span class="btn-text">PŘIDAT DO PAMĚTI</span></button>
              </div>
            </div>

            <div class="history-list kb-scroll-list">
              <div v-for="kb in activeProfile.knowledgeBase" :key="kb.id" :class="['ui-list-item kb-item', { 'is-locked': kb.locked }]">
                <div class="ui-list-main">
                  <div class="ui-list-content">
                    <span class="importance-tag" v-if="kb.importance > 1">{{ '★'.repeat(kb.importance) }}</span>
                    {{ kb.content }}
                  </div>
                  <div class="ui-list-secondary"><span>{{ kb.date }}</span></div>
                </div>
                <div class="kb-item-actions">
                  <div class="action-group">
                    <button @click.stop="$emit('toggle-kb-lock', kb)" :class="['ui-button is-icon sm is-toggle', { active: kb.locked }]">
                      <span class="material-symbols-outlined">{{ kb.locked ? 'lock' : 'lock_open' }}</span>
                    </button>
                    <button @click.stop="$emit('remove-knowledge', kb.id)" class="ui-button is-icon sm delete-btn">
                      <span class="material-symbols-outlined">delete</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="settings-footer">
            <div class="storage-info">VYUŽITÍ: {{ storageUsage }}</div>
          </div>
        </div>
    </div>
    `
};