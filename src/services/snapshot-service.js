import { logger } from '../utils/logger.js';

/**
 * SnapshotService handles the creation, restoration and comparison of system snapshots.
 */
export class SnapshotService {
    async load(storageService) {
        const snaps = await storageService.getSnapshots();
        return snaps.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    }

    async save(storageService, chatHistory, contextProfiles, activeProfileId) {
        const snapshot = {
            timestamp: new Date().toISOString(),
            chatHistory: structuredClone(chatHistory),
            contextProfiles: structuredClone(contextProfiles),
            activeProfileId: activeProfileId
        };
        await storageService.saveSnapshot(snapshot);
        await storageService.pruneSnapshots(5);
        return snapshot;
    }

    compare(snapshot, currentProfiles, currentHistory, lastModifiedIso) {
        const currentProfileNames = currentProfiles.map(p => p.name);
        const snapProfileNames = snapshot.contextProfiles.map(p => p.name);

        const currentKBTotal = currentProfiles.reduce((acc, p) => acc + (p.knowledgeBase?.length || 0), 0);
        const snapKBTotal = snapshot.contextProfiles.reduce((acc, p) => acc + (p.knowledgeBase?.length || 0), 0);

        const promptChanges = [];
        currentProfiles.forEach(currP => {
            const snapP = snapshot.contextProfiles.find(p => p.id === currP.id || p.name === currP.name);
            if (snapP && currP.systemPrompt !== snapP.systemPrompt) {
                promptChanges.push({
                    name: currP.name,
                    currentLen: (currP.systemPrompt || "").length,
                    snapLen: (snapP.systemPrompt || "").length,
                    currentText: currP.systemPrompt || "",
                    snapText: snapP.systemPrompt || ""
                });
            }
        });

        return {
            snapshot,
            metrics: [
                {
                    label: 'Poslední aktivita', 
                    current: lastModifiedIso ? new Date(lastModifiedIso).toLocaleString('cs-CZ') : 'Není', 
                    snap: new Date(snapshot.timestamp).toLocaleString('cs-CZ') 
                },
                { 
                    label: 'Počet zpráv', 
                    current: currentHistory.length, 
                    snap: snapshot.chatHistory.length,
                    isDiff: currentHistory.length !== snapshot.chatHistory.length
                },
                { 
                    label: 'Počet profilů', 
                    current: currentProfiles.length, 
                    snap: snapshot.contextProfiles.length,
                    isDiff: currentProfiles.length !== snapshot.contextProfiles.length
                },
                {
                    label: 'Celkem znalostí',
                    current: currentKBTotal,
                    snap: snapKBTotal,
                    isDiff: currentKBTotal !== snapKBTotal
                }
            ],
            profiles: {
                added: snapProfileNames.filter(p => !currentProfileNames.includes(p)),
                removed: currentProfileNames.filter(p => !snapProfileNames.includes(p)),
                promptChanges
            },
            lastMsg: {
                current: currentHistory.at(-1)?.content.substring(0, 60) + "..." || "Žádná",
                snap: snapshot.chatHistory.at(-1)?.content.substring(0, 60) + "..." || "Žádná"
            }
        };
    }

    /**
     * Orchestrates the restoration of a system snapshot.
     * @param {Object} snapshot - The snapshot object to restore.
     * @param {Object} app - The main application instance.
     */
    applySnapshot(snapshot, app) {
        app.triggerConfirm(
            'Obnovit ze snímku',
            `Opravdu chcete obnovit stav aplikace ze dne ${new Date(snapshot.timestamp).toLocaleString()}? Aktuální data budou přepsána.`,
            async () => {
                app.modalIsLoading = true;
                try {
                    app.chatHistory = snapshot.chatHistory;
                    app.contextProfiles = snapshot.contextProfiles;
                    app.activeProfileId = snapshot.activeProfileId;
                    app.closeModal();
                    app.addToast('Stav obnoven ze záložního snímku', 'success');
                    await app.$nextTick(() => app.scrollToBottom());
                } finally {
                    app.modalIsLoading = false;
                }
            }
        );
    }
}