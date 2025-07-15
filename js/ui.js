
// /js/ui.js

// This module will handle all direct DOM manipulations and UI updates.

export function getDOMElements() {
    return {
        settingsBtn: document.getElementById('settings-btn'),
        settingsModal: document.getElementById('settings-modal'),
        closeModalBtn: document.getElementById('close-modal-btn'),
        saveSettingsBtn: document.getElementById('save-settings-btn'),
        recordBtn: document.getElementById('record-btn'),
        statusMessage: document.getElementById('status-message'),
        interimTranscriptEl: document.getElementById('interim-transcript'),
        finalTranscriptEl: document.getElementById('final-transcript'),
        summaryOutputEl: document.getElementById('summary-output'),
        docTitleFormatInput: document.getElementById('doc-title-format'),
        languageSelect: document.getElementById('language-select'),
        summaryFormatSelect: document.getElementById('summary-format'),
        themeSelect: document.getElementById('theme-select'),
        fontSizeSlider: document.getElementById('font-size-slider'),
        geminiApiKeyInput: document.getElementById('gemini-api-key'),
        recordAudioCheckbox: document.getElementById('record-audio-checkbox'),
        postRecordingActions: document.getElementById('post-recording-actions'),
        summarizeBtn: document.getElementById('summarize-btn'),
        saveToFileBtn: document.getElementById('save-to-file-btn'),
        downloadAudioBtn: document.getElementById('download-audio-btn'),
        discardBtn: document.getElementById('discard-btn'),
        fileInput: document.getElementById('file-input'),
        loadFileBtn: document.getElementById('load-file-icon-btn'),
        audioFileInput: document.getElementById('audio-file-input'),
        uploadAudioBtn: document.getElementById('upload-audio-icon-btn'),
        audioPlayer: document.getElementById('audio-player'),
        exportFormatSelect: document.getElementById('export-format-select'),
        searchInput: document.getElementById('search-input'),
        searchBtn: document.getElementById('search-icon-btn'),
        noteSearchInput: document.getElementById('note-search-input'),
        tagInput: document.getElementById('tag-input'),
        tagsDisplay: document.getElementById('tags-display'),
        newNoteBtn: document.getElementById('new-note-btn'),
        notesListEl: document.getElementById('notes-list'),
        ttsBtn: document.getElementById('tts-btn'),
        noteTitleInput: document.getElementById('note-title-input'),
        exportAllNotesBtn: document.getElementById('export-all-notes-btn'),
        importAllNotesBtn: document.getElementById('import-all-notes-btn'),
        importAllNotesFileInput: document.getElementById('import-all-notes-file-input'),
        deleteAllNotesBtn: document.getElementById('delete-all-notes-btn'),
        darkModeToggleBtn: document.getElementById('dark-mode-toggle-btn'),
        sidebarToggleBtn: document.getElementById('sidebar-toggle-btn'),
        sidebar: document.querySelector('.sidebar'),
        audioVisualizer: document.getElementById('audio-visualizer'),
        foldersListEl: document.getElementById('folders-list'),
        addFolderBtn: document.getElementById('add-folder-btn'),
        tagsFilterListEl: document.getElementById('tags-filter-list'),
        undoIconBtn: document.getElementById('undo-icon-btn'),
        redoIconBtn: document.getElementById('redo-icon-btn'),
    };
}

export function renderNotesList(notes, currentNoteId, searchTerm, folderId, tagFilter, loadNoteCallback, deleteNoteCallback) {
    const notesListEl = getDOMElements().notesListEl;
    notesListEl.innerHTML = '';
    let notesToRender = notes;

    if (searchTerm) {
        notesToRender = notesToRender.filter(note =>
            note.title.toLowerCase().includes(searchTerm) ||
            note.transcript.toLowerCase().includes(searchTerm)
        );
    }

    if (folderId && folderId !== 'all') {
        notesToRender = notesToRender.filter(note => note.folderId === folderId);
    }

    if (tagFilter) {
        notesToRender = notesToRender.filter(note => note.tags.includes(tagFilter));
    }

    notesToRender.forEach(note => {
        const noteItem = document.createElement('div');
        noteItem.classList.add('note-item');
        if (note.id === currentNoteId) {
            noteItem.classList.add('active');
        }
        noteItem.dataset.noteId = note.id;
        noteItem.innerHTML = `
            <h3>${note.title}</h3>
            <p>${note.transcript.substring(0, 100).replace(/<[^>]*>/g, '')}...</p>
            <div class="note-tags">${note.tags.map(tag => `<span class="tag-item">${tag}</span>`).join('')}</div>
            <button class="delete-note-btn" data-id="${note.id}">삭제</button>
        `;
        noteItem.addEventListener('click', (event) => {
            if (!event.target.classList.contains('delete-note-btn')) {
                loadNoteCallback(note.id);
            }
        });
        notesListEl.appendChild(noteItem);
    });

    notesListEl.querySelectorAll('.delete-note-btn').forEach(btn => {
        btn.addEventListener('click', (event) => {
            event.stopPropagation();
            const noteIdToDelete = event.target.dataset.id;
            if (confirm('정말로 이 노트를 삭제하시겠습니까?')) {
                deleteNoteCallback(noteIdToDelete);
            }
        });
    });
}

export function renderFoldersList(folders, currentFolderId, switchFolderCallback, deleteFolderCallback) {
    const { foldersListEl } = getDOMElements();
    foldersListEl.innerHTML = '';
    folders.forEach(folder => {
        const folderItem = document.createElement('li');
        folderItem.classList.add('folder-item');
        if (folder.id === currentFolderId) {
            folderItem.classList.add('active');
        }
        folderItem.dataset.folderId = folder.id;
        folderItem.innerHTML = `
            <span class="folder-name">${folder.name}</span>
            ${folder.id !== 'all' ? `<button class="delete-folder-btn" data-id="${folder.id}">x</button>` : ''}
        `;
        folderItem.addEventListener('click', (event) => {
            if (!event.target.classList.contains('delete-folder-btn')) {
                switchFolderCallback(folder.id);
            }
        });
        foldersListEl.appendChild(folderItem);
    });

    foldersListEl.querySelectorAll('.delete-folder-btn').forEach(btn => {
        btn.addEventListener('click', (event) => {
            event.stopPropagation();
            const folderIdToDelete = event.target.dataset.id;
            if (confirm('정말로 이 폴더와 안에 있는 모든 노트를 삭제하시겠습니까?')) {
                deleteFolderCallback(folderIdToDelete);
            }
        });
    });
}

export function renderTagsFilterList(notes, currentTagFilter, switchTagCallback) {
    const { tagsFilterListEl } = getDOMElements();
    tagsFilterListEl.innerHTML = '';
    const allTags = new Set();
    notes.forEach(note => {
        note.tags.forEach(tag => allTags.add(tag));
    });

    const allTagsItem = document.createElement('li');
    allTagsItem.classList.add('tag-filter-item');
    if (currentTagFilter === null) {
        allTagsItem.classList.add('active');
    }
    allTagsItem.textContent = '모든 태그';
    allTagsItem.addEventListener('click', () => switchTagCallback(null));
    tagsFilterListEl.appendChild(allTagsItem);

    Array.from(allTags).sort().forEach(tag => {
        const tagItem = document.createElement('li');
        tagItem.classList.add('tag-filter-item');
        if (currentTagFilter === tag) {
            tagItem.classList.add('active');
        }
        tagItem.textContent = tag;
        tagItem.addEventListener('click', () => switchTagCallback(tag));
        tagsFilterListEl.appendChild(tagItem);
    });
}

export function updateRecordButton(isRecording) {
    const { recordBtn } = getDOMElements();
    if (isRecording) {
        recordBtn.classList.add('recording');
        recordBtn.innerHTML = '<i class="material-icons">stop</i>';
    } else {
        recordBtn.classList.remove('recording');
        recordBtn.innerHTML = '<i class="material-icons">mic</i>';
    }
}

export function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
}

export function applyFontSize(size) {
    const { finalTranscriptEl } = getDOMElements();
    finalTranscriptEl.style.fontSize = `${size}px`;
}

export function toggleDarkMode() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    applyTheme(newTheme);
    // Optionally, save this preference to settings
}

export function openSettingsModal() {
    getDOMElements().settingsModal.style.display = 'block';
}

export function closeSettingsModal() {
    getDOMElements().settingsModal.style.display = 'none';
}

export function toggleSidebar() {
    getDOMElements().sidebar.classList.toggle('closed');
}

export function showToast(message, duration = 3000) {
    const toast = document.createElement('div');
    toast.classList.add('toast');
    toast.textContent = message;
    document.body.appendChild(toast);

    // Animate in
    setTimeout(() => {
        toast.classList.add('show');
    }, 100);

    // Animate out and remove
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            document.body.removeChild(toast);
        }, 500);
    }, duration);
}

export function createVisualizer(stream, visualizerEl) {
    visualizerEl.style.display = 'block';
    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);

    const visualizerState = {
        analyser,
        visualizerCtx: visualizerEl.getContext('2d'),
        visualizerEl,
        animationFrameId: null,
    };

    function draw() {
        visualizerState.animationFrameId = requestAnimationFrame(draw);

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteTimeDomainData(dataArray);

        const { visualizerCtx, visualizerEl } = visualizerState;
        visualizerCtx.fillStyle = 'rgb(240, 242, 245)';
        visualizerCtx.fillRect(0, 0, visualizerEl.width, visualizerEl.height);
        visualizerCtx.lineWidth = 2;
        visualizerCtx.strokeStyle = 'rgb(98, 0, 238)';
        visualizerCtx.beginPath();

        const sliceWidth = visualizerEl.width * 1.0 / bufferLength;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
            const v = dataArray[i] / 128.0;
            const y = v * visualizerEl.height / 2;

            if (i === 0) {
                visualizerCtx.moveTo(x, y);
            } else {
                visualizerCtx.lineTo(x, y);
            }

            x += sliceWidth;
        }

        visualizerCtx.lineTo(visualizerEl.width, visualizerEl.height / 2);
        visualizerCtx.stroke();
    }

    draw();

    return visualizerState;
}
