/**
 * Highlights occurrences of a query string within a given text.
 * @param {string} text - The original text.
 * @param {string} query - The query string to highlight.
 * @returns {string} The text with query occurrences wrapped in <mark> tags.
 */
export function highlightText(text, query) {
    if (!query.trim()) return text;
    const escapedText = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const escapedQuery = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedQuery})`, 'gi');
    return escapedText.replace(regex, '<mark>$1</mark>');
}