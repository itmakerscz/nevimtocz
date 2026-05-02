/**
 * AttachmentService handles file processing for chat attachments.
 */
export class AttachmentService {
    /**
     * Processes raw files into data URLs.
     */
    async processFiles(files, onToast) {
        const processed = [];
        for (const file of files) {
            if (!file.type.startsWith('image/')) {
                if (onToast) onToast('Podporovány jsou pouze obrázky.', 'warning');
                continue;
            }
            const dataUrl = await new Promise(resolve => {
                const reader = new FileReader();
                reader.onload = e => resolve(e.target.result);
                reader.readAsDataURL(file);
            });
            processed.push({ name: file.name, type: file.type, data: dataUrl });
        }
        return processed;
    }
}