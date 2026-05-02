/**
 * MessageService handles the preparation of message payloads for LLM inference,
 * including context window management, sliding history, and system prompt assembly.
 */
export class MessageService {
    /**
     * @param {Object} modelService - Reference to ModelService.
     * @param {number} maxTokens - Maximum allowed tokens in the context window.
     */
    constructor(modelService, maxTokens = 4000) {
        this.modelService = modelService;
        this.maxTokens = maxTokens;
    }

    /**
     * Prepares an array of messages formatted for model consumption.
     * @param {Object} params
     * @returns {Object} { messages: Array, engineOptions: Object }
     */
    prepareModelMessages({ query, attachments, relevantKB, context, systemPrompt, historySummary, chatHistory, modelId, temperature, top_p }) {
        const messages = [];

        // 1. Construct the System Message
        let systemContent = systemPrompt || "Jsi užitečný AI asistent.";

        // Inject branding if vimtoLLM is active
        if (modelId && modelId.startsWith('vimto')) {
            const branding = "Jsi vimtoLLM - all space inside! (10 on minus 84), ultra-efektivní VIMTO-SCALE model optimalizovaný pro bleskovou odezvu a lokální soukromí.";
            systemContent = systemPrompt ? `${branding}\n${systemPrompt}` : branding;
        }

        if (historySummary && historySummary.trim()) {
            systemContent += `\n\n### SHRNUTÍ PŘEDCHOZÍ KONVERZACE:\n${historySummary}`;
        }

        if (relevantKB && relevantKB.trim()) {
            systemContent += `\n\n### ZNALOSTNÍ BÁZE (Relevantní informace):\n${relevantKB}`;
        }

        if (context && context.trim()) {
            systemContent += `\n\n### DODATEČNÝ KONTEXT:\n${context}`;
        }

        const systemMessage = { role: 'system', content: systemContent };

        const isVLM = this.modelService.isVLM(modelId);

        // 2. Manage Context Window (Sliding Window History)
        const systemTokens = this.modelService.estimateTokens(systemContent);
        
        const formattedQuery = this.formatMessageContent(query, attachments);
        const finalQuery = (!isVLM && Array.isArray(formattedQuery)) ? formattedQuery[0].text : formattedQuery;
        const queryTokens = this.modelService.estimateTokens(finalQuery);

        // Reserve a buffer for generation and overhead
        let tokenBudget = this.maxTokens - systemTokens - queryTokens - 256;

        const historyToInclude = [];
        // Iterate backwards from the most recent history entries
        for (let i = chatHistory.length - 1; i >= 0; i--) {
            const msg = chatHistory[i];
            if (!msg.content || (msg.role === 'assistant' && msg.content === '') || msg.isSummary) continue;

            // Format message content (handles multi-modal)
            const formattedContent = this.formatMessageContent(msg.content, msg.attachments);
            const compatibleContent = (!isVLM && Array.isArray(formattedContent)) ? formattedContent[0].text : formattedContent;
            const msgTokens = this.modelService.estimateTokens(compatibleContent);

            if (tokenBudget - msgTokens > 0) {
                historyToInclude.unshift({ role: msg.role, content: compatibleContent });
                tokenBudget -= msgTokens;
            } else {
                break; // Stop adding older messages once budget is exhausted
            }
        }

        // 3. Assemble the final payload
        messages.push(systemMessage);
        messages.push(...historyToInclude);
        messages.push({ role: 'user', content: finalQuery });

        return {
            messages,
            engineOptions: { temperature, top_p }
        };
    }

    /**
     * Helper to format content as a string or a multi-modal array.
     */
    formatMessageContent(text, attachments = []) {
        const safeAttachments = attachments || [];
        const images = safeAttachments.filter(a => a.type?.startsWith('image/'));
        const texts = safeAttachments.filter(a => a.type === 'text/plain' || a.type === 'application/pdf');

        if (images.length === 0 && texts.length === 0) return text;

        const content = [{ type: 'text', text: text || "" }];

        // Append text from document attachments
        texts.forEach(att => {
            const extracted = att.extractedText || att.content;
            if (extracted) {
                content[0].text += `\n\n[PŘÍLOHA: ${att.name}]\n${extracted}`;
            }
        });

        images.forEach(img => {
            content.push({ type: 'image_url', image_url: { url: img.data } });
        });
        return content;
    }

    /**
     * Formats a prompt specifically for the AI to summarize a set of messages.
     * @param {Array} messagesToSummarize 
     * @returns {string}
     */
    getSummarizationPrompt(messagesToSummarize) {
        const textToProcess = messagesToSummarize
            .map(m => `${m.role === 'user' ? 'Uživatel' : 'AI'}: ${m.content}`)
            .join('\n');

        return `Následující text je historie naší konverzace. 
Stručně a věcně shrň hlavní body, probraná témata a důležité závěry tak, abychom na ně mohli navázat. 
Piš v první osobě (např. "Probrali jsme..."). 

TEXT KE SHRNUTÍ:\n${textToProcess}`;
    }
}