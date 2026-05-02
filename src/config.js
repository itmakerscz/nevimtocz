/**
 * Global application configuration constants.
 */
export const APP_CONFIG = {
    VIEWS: { CHAT: 'chat', SETTINGS: 'settings', HISTORY: 'history', KB: 'kb' },
    STORAGE_KEYS: {
        HISTORY: 'nevimto-chat-history',
        PROFILES: 'nevimto-context-profiles',
        SETTINGS: 'nevimto-settings',
        ACTIVE_PROFILE: 'nevimto-active-profile-id',
        LAST_MODIFIED: 'nevimto-last-modified'
    },
    LIMITS: { 
        MAX_CHARS: 2000, 
        MAX_SYSTEM_PROMPT: 1000, 
        MAX_CONTEXT: 16000, 
        LOG_DISPLAY_LIMIT: 100,
    },
    SIMILARITY_THRESHOLD: 0.5,
    EMBEDDING_MODEL: {
        id: 'all-MiniLM-L6-v2',
        size: 94371840 // ~90 MB
    },
    ENGINE_CONFIG: {
        temperature: 0.7,
        top_p: 0.95,
        max_gen_len: 1024,
    },
    MODELS: [
        {
            id: "vimto-quecto-1.5B-q4f16_1-MLC",
            name: "vimtoLLM (Vimto-scale)",
            desc: "Ultra-komprimovaný model s VIMTO-SCALE efektivitou pro bleskovou odezvu.",
            bestFor: "Okamžitou asistenci a mobilní zařízení.",
            estimatedSize: 786432000 // ~750 MB
        },
        {
            id: "Llama-3.2-1B-Instruct-q4f32_1-MLC",
            name: "Llama 3.2 (1B)",
            desc: "Nejnovější úsporný model od Meta, skvělý poměr výkon/velikost.",
            bestFor: "Rychlou asistenci a mobilní zařízení.",
            estimatedSize: 858993459 // ~820 MB
        },
        {
            id: "Llama-3.2-3B-Instruct-q4f32_1-MLC",
            name: "Llama 3.2 (3B)",
            desc: "Výkonnější verze Llama 3.2 s lepším logickým uvažováním.",
            bestFor: "Komplexnější úkoly a kreativní psaní.",
            estimatedSize: 2040109465 // ~1.9 GB
        },
        {
            id: "Qwen2.5-1.5B-Instruct-q4f32_1-MLC",
            name: "Qwen 2.5 (1.5B)",
            desc: "Vynikající model pro kódování a matematiku v malém balení.",
            bestFor: "Technické dotazy a strukturovaná data.",
            estimatedSize: 1181116006 // ~1.1 GB
        },
        {
            id: "Phi-3.5-mini-instruct-q4f32_1-MLC",
            name: "Phi-3.5 Mini",
            desc: "Špičkový model od Microsoftu zaměřený na logiku a vědecké uvažování.",
            bestFor: "Programování a komplexní logické operace.",
            estimatedSize: 2362232012 // ~2.2 GB
        },
        {
            id: "SmolLM2-360M-Instruct-q4f32_1-MLC",
            name: "SmolLM2 (360M)",
            desc: "Nová generace extrémně malého modelu pro základní úkoly.",
            bestFor: "Jednoduché dotazy a velmi omezený hardware.",
            estimatedSize: 377487360 // ~360 MB
        }
    ]
};