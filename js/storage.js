
// /js/storage.js

// NOTE: This module will be dependent on the main app's state object.
// We will pass the state object to the functions that need it.

export function loadNotesAndFolders() {
    const notes = JSON.parse(localStorage.getItem('voiceNotes')) || [];
    const folders = JSON.parse(localStorage.getItem('voiceFolders')) || [];
    if (folders.length === 0) {
        folders.push({ id: 'all', name: '모든 노트' });
        saveFolders(folders);
    }
    return { notes, folders };
}

export function saveNotes(notes) {
    localStorage.setItem('voiceNotes', JSON.stringify(notes));
}

export function saveFolders(folders) {
    localStorage.setItem('voiceFolders', JSON.stringify(folders));
}

export function saveSettings(settings) {
    localStorage.setItem('voiceNotesSettings', JSON.stringify(settings));
}

export function loadSettings() {
    const defaultSettings = {
        docTitleFormat: '[YYYY-MM-DD] 음성 메모',
        language: 'ko-KR',
        summaryFormat: 'bullet',
        theme: 'light',
        fontSize: 16,
        geminiApiKey: '',
        recordAudio: false,
        silenceTimeout: 30,
        customColors: {
            primary: '#6200EE',
            background: '#F0F2F5',
            text: '#212121'
        }
    };
    const savedSettings = JSON.parse(localStorage.getItem('voiceNotesSettings')) || {};
    return { ...defaultSettings, ...savedSettings };
}

export function exportAllNotes() {
    const notes = JSON.parse(localStorage.getItem('voiceNotes')) || [];
    const folders = JSON.parse(localStorage.getItem('voiceFolders')) || [];
    const data = { notes, folders };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'voice-notes-backup.json';
    a.click();
    URL.revokeObjectURL(url);
    // Assuming ui.showToast is available globally or passed as an argument
    // For now, we'll assume it's available via import in app.js which calls this function
}

export function importAllNotes(event, callback) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (data.notes && data.folders) {
                    saveNotes(data.notes);
                    saveFolders(data.folders);
                    callback(data.notes, data.folders);
                    // Assuming ui.showToast is available globally or passed as an argument
                    // For now, we'll assume it's available via import in app.js which calls this function
                    ui.showToast('Notes and folders imported successfully!');
                } else {
                    ui.showToast('Invalid backup file format.', 'error');
                }
            } catch (error) {
                ui.showToast('Error parsing backup file.', 'error');
            }
        };
        reader.readAsText(file);
    }
}

