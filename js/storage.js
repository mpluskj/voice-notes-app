
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

