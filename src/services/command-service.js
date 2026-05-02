/**
 * CommandService handles the parsing and execution of chat slash commands.
 */
export class CommandService {
    /**
     * @param {EventBus} bus - Application event bus.
     * @param {Object} state - Reference to application state (profiles, models).
     */
    constructor(bus, state) {
        this.bus = bus;
        this.state = state;
    }

    /**
     * Executes a chat command string.
     * @param {string} text - The raw user input (must start with '/').
     * @returns {Promise<boolean>} True if the input was handled as a command.
     */
    async execute(text) {
        const full = text.substring(1).trim();
        if (!full) return false;

        // Split by first space to separate command/profile name from optional arguments/query
        const spaceIdx = full.indexOf(' ');
        const cmd = spaceIdx === -1 ? full.toLowerCase() : full.substring(0, spaceIdx).toLowerCase();
        const args = spaceIdx === -1 ? '' : full.substring(spaceIdx + 1).trim();

        const systemCommands = this._getSystemCommands(args);

        if (systemCommands[cmd]) {
            systemCommands[cmd](args);
            return true;
        }

        // 2. Handle Profile Switching (Dynamic Commands)
        const target = this.state.profiles().find(p => p.name.toLowerCase() === cmd);
        if (target) {
            this.bus.emit('profile:switch', { id: target.id, name: target.name });
            
            // Notify that a profile was switched with a potential query
            this.bus.emit('inference:run', { 
                modelId: target.selectedModelId, 
                query: args 
            });
            return true;
        }

        return false;
    }

    /**
     * Returns the registry of built-in system commands.
     * @private
     */
    _getSystemCommands() {
        return {
            help: () => this.bus.emit('toast', { msg: 'Dostupné příkazy: /help, /clear, /model [název], /system [text], /settings, /history, /kb, /<název_profilu> [dotaz]', type: 'info', persistent: true }),
            clear: () => this.bus.emit('chat:clear'),
            settings: () => this.bus.emit('view:switch', 'settings'),
            history: () => this.bus.emit('view:switch', 'history'),
            kb: () => this.bus.emit('view:switch', 'kb'),
            model: (args) => {
                if (!args) {
                    const modelList = this.state.models().map(m => m.name).join(', ');
                    return this.bus.emit('toast', { msg: `Dostupné modely: ${modelList}`, type: 'info', persistent: true });
                }
                const targetModel = this.state.models().find(m => 
                    m.id.toLowerCase().includes(args.toLowerCase()) || 
                    m.name.toLowerCase().includes(args.toLowerCase())
                );
                if (targetModel) {
                    this.bus.emit('profile:update-model', { profileId: this.state.activeProfileId(), modelId: targetModel.id });
                } else {
                    this.bus.emit('toast', { msg: `Model "${args}" nebyl nalezen.`, type: 'warning' });
                }
            },
            system: (args) => {
                const profile = this.state.activeProfile();
                if (!profile) return;

                if (!args) {
                    const current = profile.systemPrompt || 'není nastavena';
                    this.bus.emit('toast', { msg: `Aktuální systémová instrukce: ${current}`, type: 'info', persistent: true });
                } else {
                    this.bus.emit('profile:update-system-prompt', { id: profile.id, prompt: args });
                }
            }
        };
    }
}