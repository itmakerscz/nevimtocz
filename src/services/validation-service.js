/**
 * ValidationService centralizes input validation rules for the application.
 */
export class ValidationService {
    /**
     * Validates user chat input.
     * @param {string} text - Raw input text from the chat box.
     * @param {Array} attachments - Pending attachments.
     * @param {Object} context - Application context { maxChars, isLoading }.
     * @returns {Object} Result { isValid, cleanText, error, type }.
     */
    validateMessage(text, attachments, { maxChars, isLoading }) {
        const cleanText = (text || '').trim();

        // Silent exit if app is busy (prevents double-send)
        if (isLoading) return { isValid: false };

        // Silent exit if no content is provided
        if (!cleanText && (!attachments || attachments.length === 0)) {
            return { isValid: false };
        }

        // Active validation for character limits
        if (cleanText.length > maxChars) {
            return {
                isValid: false,
                error: `Zpráva je příliš dlouhá (max ${maxChars} znaků).`,
                type: 'warning'
            };
        }

        return { isValid: true, cleanText };
    }
}