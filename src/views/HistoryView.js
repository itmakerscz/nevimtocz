// src/views/HistoryView.js
export default {
    name: 'HistoryView',
    props: ['filteredHistory', 'historySearchQuery', 'highlightText'],
    emits: ['close', 'update:historySearchQuery', 'rollback'],
    template: `
      <div class="settings-page">
      <div class="panel-container">
        <div class="ui-panel-header">
          <div class="settings-title-group">
            <span class="material-symbols-outlined" aria-hidden="true">history</span>
            <h2 id="history-modal-title">ČASOVÁ OSA</h2>
          </div>
          <div class="header-search-wrap search-input-wrapper">
            <input :value="historySearchQuery" @input="$emit('update:historySearchQuery', $event.target.value)" placeholder="Hledat v historii..." class="ui-input">
          </div>
          <button @click="$emit('close')" class="ui-button is-icon" title="Zavřít"><span class="material-symbols-outlined">close</span></button>
        </div>
        <div class="ui-management-grid is-history">
          <div class="history-list fullscreen-list">
            <div v-for="item in filteredHistory" :key="'hist-'+item.index" class="ui-list-item" @click="$emit('rollback', item.index)">
              <div class="ui-list-main">
                <div class="ui-list-content" v-html="highlightText(item.msg.content, historySearchQuery)"></div>
                <div class="ui-list-secondary">
                  <span class="hist-role" :class="item.msg.role">{{ item.msg.role === 'user' ? 'Uživatel' : 'Asistent' }}</span>
                </div>
              </div>
              <div class="hist-meta">
                <span class="material-symbols-outlined status-icon" :class="item.msg.role">
                  {{ item.msg.role === 'user' ? 'person' : 'smart_toy' }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    `
};