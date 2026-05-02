/**
 * BackupService handles the generation of exports and backups.
 */
export class BackupService {
    /**
     * Generates a full system backup as a ZIP file.
     */
    async exportFullBackupZip(chatHistory, contextProfiles, activeProfileId) {
        if (!window.JSZip) throw new Error('Knihovna JSZip není dostupná.');

        const zip = new JSZip();
        const now = new Date();
        const timestamp = now.toISOString().replace(/[:.]/g, '-').split('Z')[0];

        // 1. Full State JSON
        const state = {
            chatHistory,
            contextProfiles,
            activeProfileId,
            exportDate: now.toISOString()
        };
        zip.file("state.json", JSON.stringify(state, null, 2));

        // 2. Chat History as Markdown
        zip.file("konverzace.md", this._generateChatMarkdown(chatHistory, now));

        // 3. Profiles Folder
        const profilesFolder = zip.folder("profily");
        contextProfiles.forEach(p => {
            const safeName = p.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            profilesFolder.file(`${safeName}.json`, JSON.stringify(p, null, 2));
        });

        // 4. Attachments
        const attachmentsFolder = zip.folder("prilohy");
        let attachmentCount = 0;
        chatHistory.forEach((msg, msgIdx) => {
            (msg.attachments || []).forEach((att, attIdx) => {
                attachmentCount++;
                const base64Data = att.data.includes('base64,') ? att.data.split('base64,')[1] : att.data;
                const fileName = att.name || `msg${msgIdx + 1}_att${attIdx + 1}.${att.type.split('/')[1]}`;
                attachmentsFolder.file(fileName, base64Data, { base64: true });
            });
        });
        if (attachmentCount === 0) zip.remove("prilohy");

        return await zip.generateAsync({ type: "blob" });
    }

    /**
     * Generates a simple JSON export of the chat history.
     */
    exportChatJSON(chatHistory) {
        return JSON.stringify(chatHistory, null, 2);
    }

    /**
     * Generates a full system state JSON export.
     */
    exportFullStateJSON(chatHistory, contextProfiles, activeProfileId) {
        const state = {
            chatHistory,
            contextProfiles,
            activeProfileId,
            exportDate: new Date().toISOString()
        };
        return JSON.stringify(state, null, 2);
    }

    /**
     * Generates a simple Markdown export of the chat history.
     */
    exportChatMarkdown(chatHistory) {
        const date = new Date().toISOString().split('T')[0];
        return this._generateChatMarkdown(chatHistory, new Date());
    }

    _generateChatMarkdown(history, date) {
        let md = `# Nevimto Chat Export - ${date.toLocaleString('cs-CZ')}\n\n`;
        history.forEach(msg => {
            md += `## ${msg.role === 'user' ? 'UŽIVATEL' : 'AI ASISTENT'}\n\n${msg.content}\n\n`;
            if (msg.attachments?.length > 0) {
                md += `**Přílohy:**\n${msg.attachments.map(a => `- ${a.name}`).join('\n')}\n\n`;
            }
            md += `---\n\n`;
        });
        return md;
    }

    /**
     * Validates and calculates differences for an imported backup.
     * @param {Object} imported - The parsed JSON data from the backup file.
     * @param {number} currentHistoryCount - Current count of messages in history.
     * @param {number} currentProfileCount - Current count of context profiles.
     * @param {string|null} lastModifiedIso - The ISO timestamp of the last local modification.
     * @returns {Object} A diff object for UI display.
     */
    getImportDiff(imported, currentHistoryCount, currentProfileCount, lastModifiedIso) {
        if (!imported.chatHistory || !imported.contextProfiles || !imported.activeProfileId) {
            throw new Error("Soubor nemá platný formát zálohy Nevimto.");
        }

        const currentDate = lastModifiedIso ? new Date(lastModifiedIso) : new Date();
        const backupDate = new Date(imported.exportDate || Date.now());

        return {
            messages: { old: currentHistoryCount, new: imported.chatHistory.length },
            profiles: { old: currentProfileCount, new: imported.contextProfiles.length },
            timestamp: {
                old: currentDate.toLocaleString('cs-CZ', { dateStyle: 'short', timeStyle: 'short' }),
                new: backupDate.toLocaleString('cs-CZ', { dateStyle: 'short', timeStyle: 'short' }),
                isNewer: backupDate > currentDate
            }
        };
    }

    /**
     * Reads and parses a backup file (JSON).
     * @param {File} file - The file from an input element.
     * @returns {Promise<Object>} The parsed backup data.
     */
    readBackupFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    resolve(JSON.parse(e.target.result));
                } catch (err) {
                    reject(new Error("Soubor neobsahuje platný JSON."));
                }
            };
            reader.onerror = () => reject(new Error("Nepodařilo se přečíst soubor."));
            reader.readAsText(file);
        });
    }

    /**
     * Triggers the file picker for backup restoration.
     */
    triggerPicker(app, dryRun = false) {
        app.isRestoreDryRun = dryRun;
        app.$refs.restoreBackupInput?.click();
    }

    /**
     * Orchestrates the import and application of backup data.
     */
    applyImport(imported, app, lastModifiedIso) {
        const diff = this.getImportDiff(
            imported,
            app.chatHistory.length,
            app.contextProfiles.length,
            lastModifiedIso
        );

        if (app.isRestoreDryRun) {
            const status = diff.timestamp.isNewer ? 'novější' : 'starší';
            app.addToast(`Záloha je platná (${status}): ${diff.messages.new} zpráv, ${diff.profiles.new} profilů.`, 'success');
            return;
        }

        app.triggerConfirm(
            'Obnovit zálohu',
            'Tato akce nahradí veškerou aktuální historii a profily daty ze zálohy. Chcete pokračovat?',
            async () => {
                app.modalIsLoading = true;
                try {
                    app.chatHistory = imported.chatHistory;
                    app.contextProfiles = imported.contextProfiles;
                    app.activeProfileId = imported.activeProfileId;
                    app.addToast('Záloha úspěšně obnovena', 'success');
                    await app.$nextTick(() => app.scrollToBottom());
                } finally {
                    app.modalIsLoading = false;
                }
            },
            { confirmLabel: 'OBNOVIT', diff }
        );
    }

    /**
     * Prepares a JSON export for a single profile.
     * @param {Object} profile - The profile object.
     * @returns {Object} An object containing the JSON data and a generated filename.
     */
    exportProfileJSON(profile) {
        const data = JSON.stringify(profile, null, 2);
        const safeName = profile.name.replace(/\s+/g, '-').toLowerCase();
        const fileName = `profile-${safeName}-${Date.now()}.json`;
        return { data, fileName };
    }
}