import { askAI } from '../llm.js';
import { logger } from '../utils/logger.js';

/**
 * ConversationService handles high-level conversation logic,
 * specifically context usage tracking and automatic summarization.
 */
export class ConversationService {
    constructor(messageService, modelService) {
        this.messageService = messageService;
        this.modelService = modelService;
    }

    /**
     * Calculates context usage for one or more profiles based on the current chat history.
     * @param {Array} chatHistory - Current messages.
     * @param {Object|Array|string} profileOrProfiles - Single profile, array of profiles, or system prompt string.
     * @param {number} maxContextTokens - Limit for the context window in tokens.
     * @returns {Object|Array} Usage object or array of objects with id/name metadata.
     */
    getUsage(chatHistory = [], profileOrProfiles = null, maxContextTokens = 4000) {
        const safeMax = (Number(maxContextTokens) && maxContextTokens > 0) ? maxContextTokens : 4000;
        const history = Array.isArray(chatHistory) ? chatHistory : [];

        const getHistoryTokensForModel = (modelId) => {
            const isVLM = this.modelService?.isVLM(modelId);
            return history.reduce((sum, m) => {
            if (!m || m.isSummary) return sum;

            // Track specific attachment tokens for UI tooltips
            if (m.attachments && Array.isArray(m.attachments)) {
                m.attachments.forEach(att => {
                    const attTokens = (this.modelService && typeof this.modelService.estimateTokens === 'function')
                        ? this.modelService.estimateTokens(att)
                        : 0;
                    if (attTokens > 0) attachmentDetails.push({ name: att.name, tokens: attTokens });
                });
            }

            const content = (this.messageService && typeof this.messageService.formatMessageContent === 'function')
                ? this.messageService.formatMessageContent(m.content, m.attachments)
                : (m.content || "");

            const compatibleContent = (!isVLM && Array.isArray(content)) ? content[0].text : content;
            const tokens = (this.modelService && typeof this.modelService.estimateTokens === 'function')
                ? this.modelService.estimateTokens(compatibleContent)
                : 0;
            return sum + (Number(tokens) || 0);
            }, 0);
        };
        
        const calculate = (input) => {
            const systemPrompt = (typeof input === 'string') ? input : (input?.systemPrompt || "");
            const isObj = input && typeof input === 'object' && !Array.isArray(input);
            const historySummary = isObj ? (input.historySummary || "") : "";
            const modelId = isObj ? input.selectedModelId : null;
            
            // Heuristic for overhead in system assembly
            let systemContent = systemPrompt;
            if (historySummary) systemContent += `\n\n### SHRNUTÍ:\n${historySummary}`;
            
            const systemTokens = (this.modelService && typeof this.modelService.estimateTokens === 'function')
                ? this.modelService.estimateTokens(systemContent)
                : 0;
            
            const hTokens = getHistoryTokensForModel(modelId);
            const total = (Number(systemTokens) || 0) + hTokens;
            
            const status = (this.modelService && typeof this.modelService.getStatus === 'function') 
                ? this.modelService.getStatus(total, safeMax) 
                : 'healthy';
            
            return {
                id: input?.id || 'unknown',
                tokens: Number(total) || 0,
                percentage: safeMax > 0 ? Math.min((total / safeMax) * 100, 100).toFixed(1) : '0.0',
                isOverflowing: total > safeMax,
                systemTokens: Number(systemTokens) || 0,
                historyTokens: hTokens,
                status: status || 'healthy',
                attachmentDetails: [] // Attachments are handled per history scan now
            };
        };

        if (Array.isArray(profileOrProfiles)) {
            return profileOrProfiles
                .filter(p => p !== null && p !== undefined)
                .map(p => ({
                    id: p?.id || 'unknown',
                    name: p?.name || 'Unknown',
                    ...calculate(p)
                }));
        }

        return calculate(profileOrProfiles) || { tokens: 0, percentage: '0.0', isOverflowing: false, systemTokens: 0, historyTokens: 0, status: 'healthy' };
    }

    /**
     * Orchestrates the summarization of the first half of the conversation.
     */
    async summarize(chatHistory, modelId) {
        const midPoint = Math.floor(chatHistory.length / 2);
        const toSummarize = chatHistory.slice(0, midPoint);
        const summarizationPrompt = this.messageService.getSummarizationPrompt(toSummarize);

        const summary = await askAI(modelId, summarizationPrompt, null, null);
        return { summary, midPoint };
    }

    /**
     * Orchestrates the preparation of the context and message payload for inference.
     * @param {Object} params - Input parameters including query, context, and dependencies.
     * @returns {Promise<Object>} The prepared assistant message and model messages.
     */
    async prepareInference({ query, context, activeProfile, chatHistory, knowledgeService }) {
        // 1. Retrieve relevant knowledge
        const relevantKB = await knowledgeService.search(
            query, 
            activeProfile.knowledgeBase, 
            activeProfile.semanticThreshold
        );
        
        const strategy = this.modelService.getPromptStrategy(activeProfile?.selectedModelId);

        // 2. Prepare the payload for the LLM
        const { messages, engineOptions } = this.messageService.prepareModelMessages({
            query,
            relevantKB,
            context,
            systemPrompt: activeProfile?.systemPrompt,
            historySummary: activeProfile?.historySummary,
            chatHistory: chatHistory,
            modelId: activeProfile?.selectedModelId,
            temperature: activeProfile?.temperature,
            top_p: activeProfile?.top_p,
            strategy
        });

        const assistantMsg = { role: 'assistant', content: '', id: crypto.randomUUID() };
        return { assistantMsg, modelMessages: messages, engineOptions };
    }

    /**
     * Removes messages following a specific index.
     */
    rollback(chatHistory, index) {
        if (!Array.isArray(chatHistory) || index < 0 || index >= chatHistory.length) return chatHistory;
        chatHistory.length = index + 1; // Efficiently truncate the array
        return chatHistory;
    }

    /**
     * Reverts the last assistant/user pair or last user message.
     */
    undo(chatHistory) {
        if (!Array.isArray(chatHistory) || chatHistory.length === 0) return chatHistory;
        
        const lastMsg = chatHistory[chatHistory.length - 1];
        const secondLastMsg = chatHistory[chatHistory.length - 2];

        // If last is assistant, remove it and the preceding user message to revert the whole turn
        if (lastMsg.role === 'assistant' && secondLastMsg && secondLastMsg.role === 'user') {
            chatHistory.length = chatHistory.length - 2;
        } else {
            chatHistory.length = chatHistory.length - 1;
        }
        return chatHistory;
    }

    /**
     * Prepares history for regeneration by removing the last response.
     */
    prepareRegenerate(chatHistory) {
        const lastUserIdx = [...chatHistory].reverse().findIndex(m => m.role === 'user');
        if (lastUserIdx === -1) return null;
        const actualIdx = chatHistory.length - 1 - lastUserIdx;
        const query = chatHistory[actualIdx].content;
        chatHistory.splice(actualIdx + 1);
        return query;
    }

    /**
     * Initializes chat history by loading from IndexedDB or migrating from localStorage.
     * @param {Object} storageService - The storage service instance.
     * @param {Object} storageKeys - Configuration keys for storage.
     * @returns {Promise<Array>} The initialized chat history.
     */
    async initHistory(storageService, storageKeys) {
        let history = [];
        try {
            history = await storageService.getHistory() ||
                      await storageService.migrateStorage(storageKeys.HISTORY, []);
        } catch (error) {
            logger.error('Failed to load or migrate chat history:', error);
            // Fallback to an empty array if storage operations fail
            history = [];
        }

        if (history.length > 0) {
            // Ensure all messages have an ID for consistent keying in Vue
            history.forEach(msg => { if (!msg.id) msg.id = crypto.randomUUID(); });
        }
        return Array.isArray(history) ? history : [];
    }

    /**
     * Persists the chat history to the database.
     */
    async saveHistory(storageService, history) {
        try {
            return await storageService.saveHistory(history);
        } catch (err) {
            logger.error('Failed to save history to DB', err);
            throw err;
        }
    }

    /**
     * Cleans up the history by removing the assistant placeholder if it remains empty after an error.
     */
    cleanupError(chatHistory, assistantMsg) {
        if (assistantMsg && assistantMsg.content === '' && chatHistory.at(-1) === assistantMsg) {
            chatHistory.pop();
        }
    }

    /**
     * Creates and adds a new user message to the chat history.
     * @param {Array} chatHistory - The reactive chat history array.
     * @param {string} content - The text content of the message.
     * @param {Array} attachments - List of pending attachments.
     * @returns {Object} The created message object.
     */
    addUserMessage(chatHistory, content, attachments = []) {
        const userMsg = {
            id: crypto.randomUUID(),
            role: 'user',
            content: content,
            attachments: [...attachments]
        };
        chatHistory.push(userMsg);
        return userMsg;
    }

    /**
     * Removes a message from the queue by index.
     * @param {Array} queue 
     * @param {number} index 
     */
    removeFromQueue(queue, index) {
        if (index >= 0 && index < queue.length) {
            queue.splice(index, 1);
        }
    }

    /**
     * Updates the text of a queued message.
     * @param {Array} queue 
     * @param {number} index 
     * @param {string} newText 
     */
    updateQueuedMessage(queue, index, newText) {
        if (queue[index]) {
            queue[index].text = newText;
        }
    }

    /**
     * Applies the summarization result to the active profile and chat history.
     * @returns {boolean} True if summary was applied.
     */
    applySummarization(activeProfile, chatHistory, summary, midPoint) {
        if (summary) {
            activeProfile.historySummary = summary;
            chatHistory.splice(0, midPoint);

            // Add a visual indicator to the chat history
            chatHistory.unshift({
                id: crypto.randomUUID(),
                role: 'system',
                content: `### SHRNUTÍ PŘEDCHOZÍ HISTORIE\n\n${summary}`,
                isSummary: true,
                timestamp: new Date().toISOString()
            });
            return true;
        }
        return false;
    }

    /**
     * Standardized error handling for summarization failures.
     */
    handleSummarizationError(err) {
        logger.error("Automatic summarization failed", err);
    }
}