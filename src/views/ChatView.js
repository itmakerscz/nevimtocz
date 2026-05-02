// src/views/ChatView.js
const AssistantMessage = {
    name: 'AssistantMessage',
    props: ['msg', 'isLoading', 'isTyping', 'loadProgress', 'selectedModel', 'renderMarkdown', 'isLast'],
    emits: ['regenerate', 'save-kb', 'copy', 'download', 'delete-msg'],
    template: `
        <div :class="['msg-wrapper', 'assistant', { 'is-streaming': isLoading && isTyping && isLast }]">
            <div class="avatar">
                <span class="material-symbols-outlined assistant-avatar">smart_toy</span>
            </div>

            <div class="msg-bubble">
                <div class="system-tag">
                    AI ASISTENT
                    <span v-if="isVimto" class="vimto-badge-pill">vimtoLLM • VIMTO-SCALE</span>
                </div>
                
                <div class="msg-content fx-aberration" v-html="renderMarkdown(msg)"></div>

                <!-- Assistant Attachment Gallery -->
                <div v-if="msg.attachments && msg.attachments.length > 0" class="attachment-gallery">
                    <div v-for="(att, idx) in msg.attachments" :key="idx" class="attachment-preview">
                        <img v-if="att.type.startsWith('image/')" :src="att.data" :alt="att.name" :title="att.name" />
                    </div>
                </div>

                <div v-if="isLast && isLoading" class="bubble-status-area">
                    <div v-if="!msg.content" class="bubble-loader" :class="{ 'is-complete': loadProgress === 100 }">
                        <div class="progress-fill" :style="{ width: loadProgress + '%' }"></div>
                    </div>
                    <span v-if="isTyping" class="typing-indicator"><span class="cursor">_</span></span>
                </div>

                <div class="bubble-actions">
                    <button v-if="!isLoading" @click="$emit('regenerate')" title="Regenerovat" class="ui-button is-icon regenerate-btn"><span class="material-symbols-outlined">refresh</span></button>
                    <button @click="$emit('save-kb', msg.content)" title="Uložit do znalostí" class="ui-button is-icon kb-save-btn"><span class="material-symbols-outlined">psychology_alt</span></button>
                    <button @click="$emit('copy', msg.content, $event)" title="Kopírovat" class="ui-button is-icon copy-btn"><span class="material-symbols-outlined">content_copy</span></button>
                    <button @click="$emit('download', msg.content)" title="Stáhnout" class="ui-button is-icon download-msg-btn"><span class="material-symbols-outlined">download</span></button>
                    <button @click="$emit('delete-msg')" title="Smazat" class="ui-button is-icon delete-btn"><span class="material-symbols-outlined">delete</span></button>
                </div>
            </div>
        </div>
    `,
    computed: {
        isVimto() {
            return this.selectedModel?.id?.startsWith('vimto');
        }
    }
};

export default {
    name: 'ChatView',
    components: { AssistantMessage },
    props: ['chatHistory', 'isLoading', 'isTyping', 'pendingAttachments', 'selectedModel', 'editingIndex', 'editBuffer', 'loadProgress', 'maxChars', 'chatInput', 'charCountClass', 'renderMarkdown', 'contextProfiles', 'messageQueue'],
    emits: ['send-message', 'stop-inference', 'trigger-attachment', 'remove-attachment', 'regenerate', 'save-kb', 'copy', 'download', 'start-edit', 'delete-msg', 'cancel-edit', 'submit-edit', 'update:chatInput', 'open-settings', 'auto-resize', 'remove-queued', 'edit-queued'],
    data() {
        return {
            selectedIndex: 0,
            editingQueueIndex: null,
            queueEditBuffer: ''
        };
    },
    computed: {
        filteredSuggestions() {
            if (!this.chatInput.startsWith('/') || this.chatInput.includes(' ')) return [];
            const query = this.chatInput.substring(1).toLowerCase();
            
            const builtIn = ['help', 'clear', 'model', 'system', 'settings', 'history', 'kb'];
            const profiles = this.contextProfiles.map(p => p.name.toLowerCase());
            
            return [...builtIn, ...profiles]
                .filter(name => name.includes(query))
                .sort();
        }
    },
    template: `
        <main class="chat-container" ref="chatScroll" role="log" aria-label="Historie chatu">
            <template v-for="(msg, index) in chatHistory" :key="index">
                <!-- Assistant Message Component -->
                <assistant-message v-if="msg.role === 'assistant'"
                    :msg="msg"
                    :is-loading="isLoading"
                    :is-typing="isTyping"
                    :load-progress="loadProgress"
                    :selected-model="selectedModel"
                    :render-markdown="renderMarkdown"
                    :is-last="index === chatHistory.length - 1"
                    @regenerate="$emit('regenerate')"
                    @save-kb="$emit('save-kb', $event)"
                    @copy="(c, e) => $emit('copy', c, e)"
                    @download="(c) => $emit('download', c, index)"
                    @delete-msg="$emit('delete-msg', index)"
                />

                <!-- Other Messages (User/System) -->
                <div v-else :class="['msg-wrapper', msg.role]">
                    <div class="msg-bubble">
                        <div v-if="msg.role === 'system'" class="system-tag">SYSTÉM</div>
                        
                        <div v-if="editingIndex === index" class="inline-editor">
                            <textarea :value="editBuffer" @input="$emit('update:editBuffer', $event.target.value)" class="ui-input" rows="2" aria-label="Upravit zprávu"></textarea>
                            <div class="edit-actions">
                                <button @click="$emit('submit-edit', index)" class="ui-button">ULOŽIT</button>
                                <button @click="$emit('cancel-edit')" class="ui-button is-secondary">ZRUŠIT</button>
                            </div>
                        </div>
                        <template v-else>
                            <div :class="['msg-content', 'fx-aberration']" v-html="renderMarkdown(msg)"></div>
                            <!-- User Attachment Gallery -->
                            <div v-if="msg.attachments && msg.attachments.length > 0" class="attachment-gallery">
                                <div v-for="(att, idx) in msg.attachments" :key="idx" class="attachment-preview">
                                    <img v-if="att.type.startsWith('image/')" :src="att.data" :alt="att.name" :title="att.name" />
                                </div>
                            </div>
                        </template>
                        
                        <div v-if="editingIndex !== index" class="bubble-actions">
                            <button @click="$emit('copy', msg.content, $event)" title="Kopírovat" class="ui-button is-icon copy-btn"><span class="material-symbols-outlined">content_copy</span></button>
                            <button @click="$emit('download', msg.content, index)" title="Stáhnout" class="ui-button is-icon download-msg-btn"><span class="material-symbols-outlined">download</span></button>
                            <button v-if="msg.role === 'user'" @click="$emit('start-edit', index)" title="Upravit" class="ui-button is-icon edit-btn"><span class="material-symbols-outlined">edit</span></button>
                            <button @click="$emit('delete-msg', index)" title="Smazat" class="ui-button is-icon delete-btn"><span class="material-symbols-outlined">delete</span></button>
                        </div>
                    </div>
                    <div v-if="msg.role === 'user'" class="avatar user-avatar">
                        <span class="material-symbols-outlined">account_circle</span>
                    </div>
                </div>
            </template>
            <div ref="scrollAnchor" style="height: 1px; width: 100%;"></div>
        </main>

        <footer class="input-area">
            <div v-if="messageQueue.length > 0" class="message-queue-display">
                <div class="queue-header">FRONTA ZPRÁV ({{ messageQueue.length }})</div>
                <div v-for="(msg, idx) in messageQueue" :key="idx" class="queue-item">
                    <div class="queue-text" v-if="editingQueueIndex !== idx">{{ msg.text.substring(0, 50) }}...</div>
                    <input v-else v-model="queueEditBuffer" @keydown.enter="saveQueueEdit(idx)" class="ui-input sm" />
                    <div class="queue-item-actions">
                        <button @click="editingQueueIndex === idx ? saveQueueEdit(idx) : startQueueEdit(idx, msg.text)" class="ui-button is-icon sm">
                            <span class="material-symbols-outlined">{{ editingQueueIndex === idx ? 'check' : 'edit' }}</span>
                        </button>
                        <button @click="$emit('remove-queued', idx)" class="ui-button is-icon sm danger"><span class="material-symbols-outlined">delete</span></button>
                    </div>
                </div>
            </div>

            <div v-if="pendingAttachments.length > 0" class="pending-attachments">
                <div v-for="(att, idx) in pendingAttachments" :key="idx" class="pending-att-item">
                    <img :src="att.data" :alt="'Příloha: ' + att.name">
                    <button @click="$emit('remove-attachment', idx)" class="remove-att" title="Odstranit">
                        <span class="material-symbols-outlined">close</span>
                    </button>
                </div>
            </div>

            <div class="input-box">
                <div v-if="filteredSuggestions.length" class="command-suggestions">
                    <div v-for="(name, i) in filteredSuggestions" :key="name" 
                        :class="['suggestion-item', { active: i === selectedIndex }]"
                        @click="selectSuggestion(name)">
                        <span class="suggestion-slash">/</span>{{ name }}
                    </div>
                </div>
                <button @click="$emit('open-settings')" class="ui-button is-icon" aria-label="Otevřít nastavení">
                    <span class="material-symbols-outlined">menu</span>
                </button>
                
                <button @click="$emit('trigger-attachment')" class="ui-button is-icon" title="Nahrát obrázek" aria-label="Nahrát obrázek">
                    <span class="material-symbols-outlined">add</span>
                </button>

                <textarea :value="chatInput" @input="$emit('update:chatInput', $event.target.value); $emit('auto-resize', $event)" @keydown="handleKeydown" ref="inputTextArea" 
                    placeholder="Zeptej se na cokoliv..." :disabled="isLoading" rows="1"
                    aria-label="Zpráva pro AI"></textarea>
                
                <button v-if="isLoading" @click="$emit('stop-inference')" class="ui-button is-send is-stop" title="Zastavit generování" aria-label="Zastavit generování">
                    <span class="material-symbols-outlined">stop</span>
                </button>
                <button v-else @click="$emit('send-message')" :disabled="!chatInput.trim()" class="ui-button is-send">
                    <span class="material-symbols-outlined">send</span>
                </button>
            </div>
            <div class="char-counter" :class="charCountClass" aria-hidden="true">{{ chatInput.length }}/{{ maxChars }}</div>
        </footer>
    `,
    methods: {
        scrollToBottom() {
            this.$nextTick(() => {
                const container = this.$refs.chatScroll;
                if (container) container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
            });
        },
        handleKeydown(e) {
            if (this.filteredSuggestions.length > 0) {
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    this.selectedIndex = (this.selectedIndex + 1) % this.filteredSuggestions.length;
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    this.selectedIndex = (this.selectedIndex - 1 + this.filteredSuggestions.length) % this.filteredSuggestions.length;
                } else if (e.key === 'Enter' || e.key === 'Tab') {
                    e.preventDefault();
                    this.selectSuggestion(this.filteredSuggestions[this.selectedIndex]);
                } else if (e.key === 'Escape') {
                    this.$emit('update:chatInput', '');
                }
            } else if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.$emit('send-message');
            }
        },
        selectSuggestion(name) {
            this.$emit('update:chatInput', '/' + name + ' ');
            this.selectedIndex = 0;
            this.$nextTick(() => this.$refs.inputTextArea.focus());
        }
    },
    watch: {
        'chatHistory.length'() { this.scrollToBottom(); },
        'filteredSuggestions.length'(newLen) {
            if (this.selectedIndex >= newLen) this.selectedIndex = 0;
        }
    }
};