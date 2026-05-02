/**
 * MarkdownService handles the parsing of Markdown into HTML,
 * including custom extensions for code blocks and internal knowledge links.
 */
export class MarkdownService {
    constructor() {
        this._setupMarked();
    }

    /**
     * Configures the marked library with custom renderers and extensions.
     * @private
     */
    _setupMarked() {
        marked.use({
            renderer: {
                code: ({ text, lang }) => {
                    const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext';
                    return this._renderCodeBlock(text, language);
                }
            },
            extensions: [{
                name: 'kbLink',
                level: 'inline',
                start(src) { return src.indexOf('[[KB:'); },
                tokenizer(src) {
                    const rule = /^\[\[KB:([a-zA-Z0-9-]+)\]\]/;
                    const match = rule.exec(src);
                    if (match) {
                        return {
                            type: 'kbLink',
                            raw: match[0],
                            kbId: match[1]
                        };
                    }
                },
                renderer(token) {
                    return `<a href="#" class="kb-link" data-kb-id="${token.kbId}">${token.kbId}</a>`;
                }
            }]
        });
    }

    /**
     * Custom renderer for code blocks with action buttons.
     * @private
     */
    _renderCodeBlock(text, language) {
        const highlighted = hljs.highlight(text, { language }).value;
        return `<div class="code-block-container" data-lang="${language}">
            <div class="code-header"><span class="code-lang">${language}</span>
            <div class="code-actions"><button class="code-download-btn"><span class="material-symbols-outlined">download</span></button>
            <button class="code-copy-btn"><span class="material-symbols-outlined">content_copy</span></button></div></div>
            <pre><code class="hljs language-${language}">${highlighted}</code></pre></div>`;
    }

    /**
     * Renders markdown content into HTML with support for memoization.
     * @param {string|Object} msgOrText - The text to render or a message object.
     * @param {Object} options - Options including isStreaming to handle caching.
     */
    render(msgOrText, { isStreaming = false } = {}) {
        if (!msgOrText) return '';
        const isObject = typeof msgOrText === 'object';
        
        // Optimization: Memoize rendered markdown to avoid re-parsing static messages
        if (isObject && msgOrText.renderedHTML && !isStreaming) {
            return msgOrText.renderedHTML;
        }

        const text = isObject ? (msgOrText.content || '') : msgOrText;
        let html = marked.parse(text || '', { breaks: true });

        if (isObject && !isStreaming) {
            msgOrText.renderedHTML = html;
        }
        return html;
    }
}