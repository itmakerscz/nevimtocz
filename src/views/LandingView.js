// src/views/LandingView.js
export default {
    name: 'LandingView',
    props: ['deferredPrompt', 'contextProfiles', 'highlightText', 'globalSearch', 'isGuestMode', 'models', 'activeProfileId', 'getStatus', 'knowledgeService'],
    emits: ['continue', 'install', 'update:activeProfileId', 'update:globalSearch', 'update:isGuestMode', 'update-profile-model'],
    data() {
        return {
            showResults: false,
            results: [],
            isSearching: false,
            _lastSearchId: 0
        };
    },
    template: `
        <div class="landing-page">
            <div class="landing-background"></div>
            <div class="landing-content">
                <div class="logo-animation hero-logo">
                    
                    <svg viewBox="0 0 491 491" fill="none" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" class="hero-logo-svg">
                    <!-- Orange Path -->
                    <path id="orangePath" d="M325.988 325.988C280.967 371.009 231.117 402.608 186.953 417.329C142.726 432.072 104.522 429.803 82.3809 407.662C60.2394 385.52 57.9713 347.317 72.7138 303.09C87.4351 258.926 119.033 209.076 164.055 164.055C209.076 119.033 258.926 87.4351 303.09 72.7138C347.317 57.9713 385.52 60.2394 407.662 82.3809C429.803 104.522 432.072 142.726 417.329 186.953C402.608 231.117 371.009 280.967 325.988 325.988Z" stroke="#FF9900" stroke-opacity="0.8" stroke-width="2" fill="none"/>
                    <!-- Animated Circle for Orange Path -->
                    <circle r="14.381" fill="#FF9900">
                        <animateMotion dur="5s" repeatCount="indefinite">
                        <mpath xlink:href="#orangePath" />
                        </animateMotion>
                    </circle>

                    <!-- Green Path -->
                    <path id="greenPath" d="M344.519 246.457C344.519 310.182 333.34 367.827 315.306 409.503C306.288 430.343 295.577 447.144 283.733 458.721C271.893 470.294 258.975 476.6 245.5 476.6C232.025 476.6 219.107 470.294 207.267 458.721C195.423 447.144 184.712 430.343 175.694 409.503C157.66 367.827 146.481 310.182 146.481 246.457C146.481 182.732 157.66 125.087 175.694 83.4112C184.712 62.5716 195.423 45.7703 207.267 34.1933C219.107 22.6207 232.025 16.3138 245.5 16.3138C258.975 16.3138 271.893 22.6207 283.733 34.1933C295.577 45.7703 306.288 62.5716 315.306 83.4112C333.34 125.087 344.519 182.732 344.519 246.457Z" stroke="#009933" stroke-opacity="0.8" stroke-width="2" fill="none"/>
                    <!-- Animated Circle for Green Path -->
                    <circle r="14.381" fill="#009933">
                        <animateMotion dur="6s" repeatCount="indefinite" begin="0s">
                        <mpath xlink:href="#greenPath" />
                        </animateMotion>
                    </circle>

                    <!-- Red Path -->
                    <path id="redPath" d="M246.457 132.125C310.164 132.125 367.791 145.011 409.454 165.8C451.177 186.618 476.6 215.193 476.6 246.457C476.6 277.721 451.177 306.296 409.454 327.115C367.791 347.903 310.164 360.789 246.457 360.789C182.75 360.789 125.123 347.903 83.4606 327.115C41.7374 306.296 16.3138 277.721 16.3138 246.457C16.3138 215.193 41.7374 186.618 83.4606 165.8C125.123 145.011 182.75 132.125 246.457 132.125Z" stroke="#FF0033" stroke-opacity="0.8" stroke-width="2" fill="none"/>
                    <!-- Animated Circle for Red Path -->
                    <circle r="14.381" fill="#FF0033">
                        <animateMotion dur="4s" repeatCount="indefinite" begin="0s">
                        <mpath xlink:href="#redPath" />
                        </animateMotion>
                    </circle>

                    <!-- Blue Path -->
                    <path id="bluePath" d="M326.945 165.012C371.966 210.033 403.565 259.883 418.286 304.047C433.029 348.274 430.761 386.478 408.619 408.619C386.478 430.761 348.274 433.029 304.047 418.286C259.883 403.565 210.033 371.966 165.012 326.945C119.991 281.924 88.3922 232.074 73.6709 187.91C58.9284 143.683 61.1965 105.479 83.338 83.338C105.479 61.1965 143.683 58.9284 187.91 73.6709C232.074 88.3922 281.924 119.991 326.945 165.012Z" stroke="#0099FF" stroke-opacity="0.8" stroke-width="2" fill="none"/>
                    <!-- Animated Circle for Blue Path -->
                    <circle r="14.381" fill="#0099FF">
                        <animateMotion dur="7s" repeatCount="indefinite" begin="0s">
                        <mpath xlink:href="#bluePath" />
                        </animateMotion>
                    </circle>

                    <!-- Static Circles (Original Design) -->
                    <!-- Red Circles -->
                    <circle cx="280.761" cy="259.382" r="14.381" fill="#FF0033"/>
                    <circle cx="172.903" cy="246.799" r="14.381" fill="#FF0033"/>
                    <circle cx="208.856" cy="300.728" r="14.381" fill="#FF0033"/>
                    <circle cx="172.903" cy="282.751" r="14.381" fill="#FF0033"/>
                    <circle cx="280.761" cy="223.429" r="14.381" fill="#FF0033"/>
                    <circle cx="208.856" cy="264.775" r="14.381" fill="#FF0033"/>
                    <circle cx="244.809" cy="280.954" r="14.381" fill="#FF0033"/>

                    <!-- Orange Circles -->
                    <circle cx="172.903" cy="352.859" r="14.381" fill="#FF9900" fill-opacity="0.2"/>
                    <circle cx="136.951" cy="331.287" r="14.381" fill="#FF9900" fill-opacity="0.4"/>
                    <circle cx="244.809" cy="396.002" r="14.381" fill="#FF9900" fill-opacity="0.05"/>
                    <circle cx="280.761" cy="338.478" r="14.381" fill="#FF9900"/>
                    <circle cx="280.761" cy="374.43" r="14.381" fill="#FF9900" fill-opacity="0.4"/>
                    <circle cx="316.714" cy="316.906" r="14.381" fill="#FF9900"/>
                    <circle cx="316.714" cy="352.859" r="14.381" fill="#FF9900" fill-opacity="0.5"/>
                    <circle cx="352.666" cy="295.335" r="14.381" fill="#FF9900" fill-opacity="0.6"/>
                    <circle cx="100.998" cy="275.561" r="14.381" fill="#FF9900"/>
                    <circle cx="100.998" cy="311.513" r="14.381" fill="#FF9900"/>
                    <circle cx="352.666" cy="331.287" r="14.381" fill="#FF9900" fill-opacity="0.1"/>

                    <!-- Green Circles -->
                    <circle cx="208.856" cy="108.381" r="14.381" fill="#009933"/>
                    <circle cx="208.856" cy="144.334" r="14.381" fill="#009933" fill-opacity="0.4"/>
                    <circle cx="207.262" cy="180.879" r="14.381" fill="#009933" fill-opacity="0.2"/>
                    <circle cx="171.106" cy="165.905" r="14.381" fill="#009933"/>
                    <circle cx="172.421" cy="128.618" r="14.381" fill="#009933" fill-opacity="0.6"/>
                    <circle cx="136.951" cy="187.477" r="14.381" fill="#009933"/>
                    <circle cx="136.951" cy="223.429" r="14.381" fill="#009933" fill-opacity="0.6"/>
                    <circle cx="135.839" cy="259.271" r="14.381" fill="#009933" fill-opacity="0.3"/>
                    <circle cx="102.796" cy="169.5" r="14.381" fill="#009933"/>
                    <circle cx="100.998" cy="205.453" r="14.381" fill="#009933"/>

                    <!-- Blue Circles -->
                    <circle cx="388.619" cy="207.251" r="14.381" fill="#0099FF" fill-opacity="0.2"/>
                    <circle cx="388.619" cy="243.203" r="14.381" fill="#0099FF" fill-opacity="0.05"/>
                    <circle cx="388.619" cy="171.298" r="14.381" fill="#0099FF"/>
                    <circle cx="316.714" cy="129.953" r="14.381" fill="#0099FF"/>
                    <circle cx="280.761" cy="151.524" r="14.381" fill="#0099FF"/>
                    <circle cx="280.428" cy="114.682" r="14.381" fill="#0099FF"/>
                    <circle cx="244.809" cy="205.453" r="14.381" fill="#0099FF"/>
                    <circle cx="280.761" cy="187.477" r="14.381" fill="#0099FF"/>
                    <circle cx="352.666" cy="151.524" r="14.381" fill="#0099FF"/>
                    <circle cx="352.666" cy="187.477" r="14.381" fill="#0099FF" fill-opacity="0.3"/>
                    <circle cx="352.666" cy="223.429" r="14.381" fill="#0099FF" fill-opacity="0.1"/>

                    <!-- Falling and Fading Clones of Circles -->
                    <!-- Red Circles -->
                    <circle cx="280.761" cy="259.382" r="14.381" fill="#FF0033">
                        <animate attributeName="cy" from="259.382" to="491" dur="4s" repeatCount="indefinite" />
                        <animate attributeName="opacity" from="1" to="0" dur="4s" repeatCount="indefinite" />
                    </circle>
                    <circle cx="172.903" cy="246.799" r="14.381" fill="#FF0033">
                        <animate attributeName="cy" from="246.799" to="491" dur="4s" repeatCount="indefinite" begin="1s" />
                        <animate attributeName="opacity" from="1" to="0" dur="4s" repeatCount="indefinite" begin="1s" />
                    </circle>
                    <circle cx="208.856" cy="300.728" r="14.381" fill="#FF0033">
                        <animate attributeName="cy" from="300.728" to="491" dur="4s" repeatCount="indefinite" begin="2s" />
                        <animate attributeName="opacity" from="1" to="0" dur="4s" repeatCount="indefinite" begin="2s" />
                    </circle>

                    <!-- Orange Circles -->
                    <circle cx="172.903" cy="352.859" r="14.381" fill="#FF9900" fill-opacity="0.2">
                        <animate attributeName="cy" from="352.859" to="491" dur="4s" repeatCount="indefinite" begin="0.5s" />
                        <animate attributeName="opacity" from="0.2" to="0" dur="4s" repeatCount="indefinite" begin="0.5s" />
                    </circle>
                    <circle cx="136.951" cy="331.287" r="14.381" fill="#FF9900" fill-opacity="0.4">
                        <animate attributeName="cy" from="331.287" to="491" dur="4s" repeatCount="indefinite" begin="1.5s" />
                        <animate attributeName="opacity" from="0.4" to="0" dur="4s" repeatCount="indefinite" begin="1.5s" />
                    </circle>
                    <circle cx="244.809" cy="396.002" r="14.381" fill="#FF9900" fill-opacity="0.05">
                        <animate attributeName="cy" from="396.002" to="491" dur="4s" repeatCount="indefinite" begin="2.5s" />
                        <animate attributeName="opacity" from="0.05" to="0" dur="4s" repeatCount="indefinite" begin="2.5s" />
                    </circle>

                    <!-- Green Circles -->
                    <circle cx="208.856" cy="108.381" r="14.381" fill="#009933">
                        <animate attributeName="cy" from="108.381" to="491" dur="4s" repeatCount="indefinite" begin="0.5s" />
                        <animate attributeName="opacity" from="1" to="0" dur="4s" repeatCount="indefinite" begin="0.5s" />
                    </circle>
                    <circle cx="208.856" cy="144.334" r="14.381" fill="#009933" fill-opacity="0.4">
                        <animate attributeName="cy" from="144.334" to="491" dur="4s" repeatCount="indefinite" begin="1.5s" />
                        <animate attributeName="opacity" from="0.4" to="0" dur="4s" repeatCount="indefinite" begin="1.5s" />
                    </circle>
                    <circle cx="207.262" cy="180.879" r="14.381" fill="#009933" fill-opacity="0.2">
                        <animate attributeName="cy" from="180.879" to="491" dur="4s" repeatCount="indefinite" begin="2.5s" />
                        <animate attributeName="opacity" from="0.2" to="0" dur="4s" repeatCount="indefinite" begin="2.5s" />
                    </circle>

                    <!-- Blue Circles -->
                    <circle cx="388.619" cy="207.251" r="14.381" fill="#0099FF" fill-opacity="0.2">
                        <animate attributeName="cy" from="207.251" to="491" dur="4s" repeatCount="indefinite" begin="0.5s" />
                        <animate attributeName="opacity" from="0.2" to="0" dur="4s" repeatCount="indefinite" begin="0.5s" />
                    </circle>
                    <circle cx="388.619" cy="243.203" r="14.381" fill="#0099FF" fill-opacity="0.05">
                        <animate attributeName="cy" from="243.203" to="491" dur="4s" repeatCount="indefinite" begin="1.5s" />
                        <animate attributeName="opacity" from="0.05" to="0" dur="4s" repeatCount="indefinite" begin="1.5s" />
                    </circle>
                    <circle cx="388.619" cy="171.298" r="14.381" fill="#0099FF">
                        <animate attributeName="cy" from="171.298" to="491" dur="4s" repeatCount="indefinite" begin="2.5s" />
                        <animate attributeName="opacity" from="1" to="0" dur="4s" repeatCount="indefinite" begin="2.5s" />
                    </circle>
                    </svg>
                    <h1 class="glow-text">NEVIMTO CORE</h1>
                    <p class="subtitle">SOUKROMÁ LOKÁLNÍ AI</p>
                </div>

                <div class="search-container">
                    <div class="search-bar-wrapper">
                        <span v-if="!isSearching" class="material-symbols-outlined search-icon">search</span>
                        <div v-else class="spinner search-icon" style="width: 20px; height: 20px; border-width: 2px; left: 1.2rem;"></div>
                        <input type="text" :value="globalSearch" @input="$emit('update:globalSearch', $event.target.value)" @focus="showResults = true" placeholder="Prohledat profily a znalosti..." class="hero-search">
                        <div v-if="showResults && globalSearch" class="hero-results">
                            <!-- Profiles Category -->
                            <div v-if="categorizedResults.profiles.length">
                                <div class="category-header">PROFILY</div>
                                <div v-for="res in categorizedResults.profiles" :key="'p-' + res.id" class="result-item" @click="selectResult(res)">
                                    <span class="material-symbols-outlined">person</span>
                                    <div class="result-text">
                                        <div class="result-title">
                                            <span v-html="highlightText(res.title, globalSearch)"></span>
                                            <span v-if="getStatus" :class="['status-dot', getStatus(1 - res.score, 0.6)]" :title="'Relevance: ' + Math.round(res.score * 100) + '%'" style="margin-left: 8px;"></span>
                                        </div>
                                        <div class="result-subtitle" v-html="highlightText(res.subtitle, globalSearch)"></div>
                                    </div>
                                </div>
                            </div>

                            <!-- Knowledge Category -->
                            <div v-if="categorizedResults.knowledge.length">
                                <div class="category-header">ZNALOSTI</div>
                                <div v-for="res in categorizedResults.knowledge" :key="'k-' + res.kbId" class="result-item" @click="selectResult(res)">
                                    <span class="material-symbols-outlined">psychology</span>
                                    <div class="result-text">
                                        <div class="result-title">
                                            <span v-html="highlightText(res.title, globalSearch)"></span>
                                            <span v-if="getStatus" :class="['status-dot', getStatus(1 - res.score, 0.6)]" :title="'Relevance: ' + Math.round(res.score * 100) + '%'" style="margin-left: 8px;"></span>
                                        </div>
                                        <div class="result-subtitle" v-html="highlightText(res.subtitle, globalSearch)"></div>
                                    </div>
                                </div>
                            </div>

                            <div v-if="results.length === 0 && !isSearching" class="no-results">Žádné shody nenalezeny</div>
                        </div>
                    </div>
                </div>
                
                <div class="hero-features">
                    <div class="feature-card">
                        <span class="material-symbols-outlined">shield</span>
                        <h4>100% Soukromí</h4>
                        <p>Vaše data nikdy neopustí váš prohlížeč.</p>
                    </div>
                    <div class="feature-card">
                        <span class="material-symbols-outlined">bolt</span>
                        <h4>WebGPU Výkon</h4>
                        <p>Využijte plný výkon svého hardwaru.</p>
                    </div>
                    <div class="feature-card">
                        <span class="material-symbols-outlined">cloud_off</span>
                        <h4>Offline Režim</h4>
                        <p>Funguje i bez připojení k internetu.</p>
                    </div>
                </div>

                <section class="vimto-showcase" aria-labelledby="vimto-title">
                    <div class="vimto-header">
                        <h3 id="vimto-title">vimtoLLM</h3>
                        <span class="vimto-badge">VIMTO-SCALE</span>
                    </div>
                    <p class="vimto-description">
                        Nová generace ultra-efektivní architektury. Podobně jako u standardu <strong>quecto</strong>, 
                        vimtoLLM maximalizuje hustotu informací v minimálním balení, umožňující okamžitou odezvu na jakémkoliv hardwaru bez ztráty logických schopností.
                    </p>
                </section>

                <div class="hero-actions">
                    <div class="landing-model-selector" v-if="models && models.length">
                        <label class="ui-label tiny">VYBERTE MOZEK SYSTÉMU</label>
                        <select :value="contextProfiles.find(p => p.id === activeProfileId)?.selectedModelId || models[0].id" 
                                @change="$emit('update-profile-model', activeProfileId, $event.target.value)" 
                                class="hero-model-select">
                            <option v-for="m in models" :key="m.id" :value="m.id">{{ m.name }} — {{ m.bestFor }}</option>
                        </select>
                    </div>

                    <div class="guest-mode-wrapper">
                        <label class="guest-toggle">
                            <input type="checkbox" :checked="isGuestMode" @change="$emit('update:isGuestMode', $event.target.checked)">
                            <span class="toggle-slider"></span>
                            <span class="toggle-text">REŽIM HOSTA</span>
                        </label>
                    </div>
                    <button v-if="deferredPrompt" @click="$emit('install')" class="ui-button is-send pulse">
                        <span class="material-symbols-outlined">download_for_offline</span>
                        INSTALOVAT APLIKACI
                    </button>
                    <button @click="$emit('continue')" class="ui-button">
                        SPUSTIT CHAT
                        <span class="material-symbols-outlined">arrow_forward</span>
                    </button>
                </div>
            </div>
        </div>
    `,
    computed: {
        categorizedResults() {
            return {
                profiles: this.results.filter(r => r.type === 'profile'),
                knowledge: this.results.filter(r => r.type === 'kb')
            };
        }
    },
    watch: {
        globalSearch() {
            this.debouncedSearch();
        }
    },
    methods: {
        debouncedSearch() {
            if (this._searchTimer) clearTimeout(this._searchTimer);
            this._searchTimer = setTimeout(() => this.performSearch(), 300);
        },
        _getKeywordMatches(query) {
            const keywordMatches = [];
            this.contextProfiles.forEach(profile => {
                const profileNameLower = profile.name.toLowerCase();
                if (profileNameLower.includes(query)) {
                    keywordMatches.push({
                        type: 'profile', id: profile.id, title: profile.name,
                        subtitle: 'Kontextový profil', 
                        score: profileNameLower === query ? 1.0 : (profileNameLower.startsWith(query) ? 0.98 : 0.95)
                    });
                }
                profile.knowledgeBase.forEach(kb => {
                    const contentLower = kb.content.toLowerCase();
                    const idx = contentLower.indexOf(query);
                    if (idx !== -1) {
                        keywordMatches.push({
                            type: 'kb', id: profile.id, kbId: kb.id,
                            title: this._createSnippet(kb.content, idx),
                            subtitle: `Znalost • ${profile.name}`, 
                            score: contentLower === query ? 0.9 : 0.85
                        });
                    }
                });
            });
            return keywordMatches;
        },
        _createSnippet(text, matchIdx) {
            if (text.length <= 60) return text;
            const start = Math.max(0, matchIdx - 20);
            const end = Math.min(text.length, start + 60);
            return (start > 0 ? '...' : '') + text.substring(start, end) + (end < text.length ? '...' : '');
        },
        async performSearch() {
            const q = (this.globalSearch || '').toLowerCase().trim();
            if (!q) { this.results = []; return; }

            const searchId = ++this._lastSearchId;
            const keywordMatches = this._getKeywordMatches(q);

            this.results = keywordMatches.sort((a, b) => b.score - a.score).slice(0, 8);

            if (q.length < 3) return;

            try {
                this.isSearching = true;
                
                const allKB = [];
                for (const p of this.contextProfiles) {
                    p.knowledgeBase.forEach(k => allKB.push({ ...k, profileId: p.id, profileName: p.name }));
                }

                const items = await this.knowledgeService.searchRanked(q, allKB);
                if (searchId === this._lastSearchId) {
                    const semanticMatches = items.map(kb => ({
                        type: 'kb',
                        id: kb.profileId,
                        kbId: kb.id,
                        title: kb.content.substring(0, 60) + '...',
                        subtitle: `Znalost • ${kb.profileName}`,
                        score: kb.score
                    })).filter(res => res.score > 0.45);

                    this.results = this._mergeResults(keywordMatches, semanticMatches);
                }
            } catch (err) {
                console.error("Semantic search failed:", err);
            } finally {
                this.isSearching = false;
            }
        },
        _mergeResults(keywords, semantic) {
            const resultMap = new Map();
            [...keywords, ...semantic].forEach(item => {
                const key = item.type + (item.kbId || item.id);
                const existing = resultMap.get(key);
                if (!existing || item.score > existing.score) resultMap.set(key, item);
            });
            return Array.from(resultMap.values()).sort((a, b) => b.score - a.score).slice(0, 8);
        },
        selectResult(res) {
            this.$emit('update:activeProfileId', res.id);
            this.$emit('continue');
        }
    }
};