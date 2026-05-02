/**
 * ContextMonitor displays the token usage and health status for a given profile or input.
 */
export default {
    name: 'ContextMonitor',
    props: {
        /**
         * The usage object from ConversationService.getUsage.
         * Expected schema: { tokens, percentage, status, isOverflowing, ... }
         */
        usage: {
            type: Object,
            default: () => ({ 
                tokens: 0, 
                percentage: '0.0', 
                status: 'healthy', 
                isOverflowing: false 
            })
        },
        maxTokens: {
            type: Number,
            required: true
        },
        isInputMonitor: {
            type: Boolean,
            default: false
        }
    },
    computed: {
        systemPercent() {
            const tokens = this.usage?.systemTokens || 0;
            return Math.min((tokens / this.maxTokens) * 100, 100);
        },
        historyPercent() {
            const tokens = this.usage?.historyTokens || 0;
            return Math.min((tokens / this.maxTokens) * 100, 100);
        },
        attachmentsTooltip() {
            const details = this.usage?.attachmentDetails;
            if (!details || details.length === 0) return '';
            const lines = details.map(a => `${a.name}: ${a.tokens} tokens`);
            return `Tokeny příloh:\n${lines.join('\n')}`;
        }
    },
    template: `
        <div class="context-monitor-root" :class="[usage?.status || 'healthy', { 'is-input-monitor': isInputMonitor }]">
            <div class="context-viz-container">
                <div class="context-viz-bar" :class="[usage?.status, { 'is-overflowing': usage?.isOverflowing }]">
                    <div class="viz-segment system" :style="{ width: systemPercent + '%' }"></div>
                    <div class="viz-segment history" :style="{ width: historyPercent + '%' }"></div>
                </div>
                <div class="context-viz-legend">
                    <div class="legend-main">
                        <span class="token-label">
                            <strong>{{ usage?.tokens || 0 }}</strong> / {{ Math.round(maxTokens) }}
                        </span>
                        <span class="percentage-display">
                            <span v-if="usage?.isOverflowing" class="material-symbols-outlined warning-icon critical">warning</span>
                            {{ usage?.percentage || '0.0' }}%
                        </span>
                    </div>
                    <div class="legend-breakdown">
                        <span class="breakdown-item system">
                            <span class="dot"></span> Systém: {{ usage?.systemTokens || 0 }}
                        </span>
                        <span class="breakdown-item history">
                            <span class="dot"></span> Historie: {{ usage?.historyTokens || 0 }} 
                            <span v-if="attachmentsTooltip" class="material-symbols-outlined attachment-info-icon" :title="attachmentsTooltip">
                                attachment
                            </span>
                        </span>
                    </div>
                </div>
            </div>
        </div>
    `
};