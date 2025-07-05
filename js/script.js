document.addEventListener('DOMContentLoaded', () => {
    // --- UI Elements ---
    const settingsBtn = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    const recordBtn = document.getElementById('record-btn');
    const statusMessage = document.getElementById('status-message');
    const interimTranscriptEl = document.getElementById('interim-transcript');
    const finalTranscriptEl = document.getElementById('final-transcript');
    const summaryOutputEl = document.getElementById('summary-output');

    // Settings Inputs
    const docTitleFormatInput = document.getElementById('doc-title-format');
    const languageSelect = document.getElementById('language-select');
    const summaryFormatSelect = document.getElementById('summary-format');
    const themeSelect = document.getElementById('theme-select');
    const fontSizeSlider = document.getElementById('font-size-slider');
    const geminiApiKeyInput = document.getElementById('gemini-api-key');
    const recordAudioCheckbox = document.getElementById('record-audio-checkbox');

    // Post-recording Action Buttons
    const postRecordingActions = document.getElementById('post-recording-actions');
    const summarizeBtn = document.getElementById('summarize-btn');
    const saveToFileBtn = document.getElementById('save-to-file-btn');
    const downloadAudioBtn = document.getElementById('download-audio-btn'); // Added
    const discardBtn = document.getElementById('discard-btn');

    const fileInput = document.getElementById('file-input');
    const loadFileBtn = document.getElementById('load-file-icon-btn'); // Changed ID
    const audioFileInput = document.getElementById('audio-file-input');
    const uploadAudioBtn = document.getElementById('upload-audio-icon-btn'); // Changed ID
    const audioPlayer = document.getElementById('audio-player');
    const exportFormatSelect = document.getElementById('export-format-select');

    const searchInput = document.getElementById('search-input'); // This is now the content search input
    const searchBtn = document.getElementById('search-icon-btn'); // Changed ID

    const noteSearchInput = document.getElementById('note-search-input'); // New: Note list search input

    const tagInput = document.getElementById('tag-input');
    const tagsDisplay = document.getElementById('tags-display');
    const newNoteBtn = document.getElementById('new-note-btn');
    const notesListEl = document.getElementById('notes-list');
    const ttsBtn = document.getElementById('tts-btn');
    const noteTitleInput = document.getElementById('note-title-input');

    const exportAllNotesBtn = document.getElementById('export-all-notes-btn');
    const importAllNotesBtn = document.getElementById('import-all-notes-btn');
    const importAllNotesFileInput = document.getElementById('import-all-notes-file-input');

    const deleteAllNotesBtn = document.getElementById('delete-all-notes-btn');
    const darkModeToggleBtn = document.getElementById('dark-mode-toggle-btn');
    const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
    const sidebar = document.querySelector('.sidebar');
    const audioVisualizer = document.getElementById('audio-visualizer');


    // --- State ---
    let isRecording = false;
    let recognition = null;
    let mediaRecorder = null;
    let audioChunks = [];
    let audioBlobUrl = null;
    let audioStartTime = 0;
    let notes = []; // Array to store all notes
    let folders = []; // Array to store folders
    let currentNoteId = null; // ID of the currently active note
    let currentFolderId = null; // ID of the currently active folder
    let currentTagFilter = null; // New: ID of the currently active tag filter
    let history = []; // Stores snapshots of the transcript for undo/redo
    let historyIndex = -1; // Current position in the history array
    let lastProcessedResultIndex = 0; // New: To track the last processed result index for final results
    let silenceTimeoutId = null; // Moved: To manage silence timeout
    let audioContext = null;
    let analyser = null;
    let visualizerCanvasCtx = null;
    let vad = null;
    let isSpeaking = false;

    // --- Local Storage Management ---
    function loadData() {
        notes = JSON.parse(localStorage.getItem('voiceNotes')) || [];
        folders = JSON.parse(localStorage.getItem('voiceFolders')) || [];
        if (folders.length === 0) {
            // Create a default "All Notes" folder if none exist
            folders.push({ id: 'all', name: '모든 노트' });
            saveData();
        }
        renderFoldersList();
        renderTagsList(); // New: Render tags list on data load
        renderNotesList();
        if (notes.length > 0) {
            loadNote(notes[0].id); // Load the first note by default
        } else {
            createNote(); // Create a new note if none exist
        }
    }

    function saveData() {
        localStorage.setItem('voiceNotes', JSON.stringify(notes));
        localStorage.setItem('voiceFolders', JSON.stringify(folders));
    }

    function createNote() {
        const newNote = {
            id: Date.now().toString(),
            title: '새 노트',
            transcript: '',
            summary: '',
            tags: [],
            audioBlobUrl: null,
            timestamp: new Date().toISOString(),
            folderId: currentFolderId || 'all' // Assign to current folder or 'all'
        };
        notes.unshift(newNote); // Add to the beginning
        saveData();
        loadNote(newNote.id);
        renderTagsList(); // Update tags list
        history = ['']; // Initialize history for new note
        historyIndex = 0;
        updateUndoRedoButtons();
    }

    function loadNote(id) {
        const note = notes.find(n => n.id === id);
        if (note) {
            currentNoteId = note.id;
            currentFolderId = note.folderId; // Update current folder when loading note
            noteTitleInput.value = note.title || '새 노트'; // Update title input
            finalTranscriptEl.innerHTML = note.transcript || '';
            summaryOutputEl.innerHTML = note.summary || '';
            renderTags(note.tags || []);
            audioBlobUrl = note.audioBlobUrl || null;
            postRecordingActions.style.display = 'flex';
            statusMessage.textContent = '노트가 불러와졌습니다.';
            renderNotesList(); // Update active state in list
            renderFoldersList(); // Update active folder state
            history = [note.transcript || '']; // Initialize history with current transcript
            historyIndex = 0;
            updateUndoRedoButtons();

            // Close sidebar on mobile after loading a note
            if (window.innerWidth <= 768) {
                sidebar.classList.remove('open');
            }
        }
    }

    function saveNote() {
        if (!currentNoteId) return; // No note active

        const noteIndex = notes.findIndex(n => n.id === currentNoteId);
        if (noteIndex > -1) {
            notes[noteIndex].title = noteTitleInput.value;
            notes[noteIndex].transcript = finalTranscriptEl.innerHTML;
            notes[noteIndex].summary = summaryOutputEl.innerHTML;
            notes[noteIndex].tags = Array.from(tagsDisplay.querySelectorAll('.tag-item')).map(tagEl => tagEl.textContent.replace(' x', ''));
            notes[noteIndex].audioBlobUrl = audioBlobUrl;
            notes[noteIndex].timestamp = new Date().toISOString(); // Update timestamp on save
            notes[noteIndex].folderId = currentFolderId || 'all'; // Ensure folderId is saved
            saveData();
            renderNotesList(); // Update list to reflect changes
            renderTagsList(); // Update tags list
            addHistoryEntry(finalTranscriptEl.innerHTML); // Add to undo history
        }
    }

    function addHistoryEntry(content) {
        // If we undo and then type something new, we truncate the redo history
        if (historyIndex < history.length - 1) {
            history = history.slice(0, historyIndex + 1);
        }
        history.push(content);
        historyIndex = history.length - 1;
        updateUndoRedoButtons();
    }

    function renderNotesList(filterTag = null) { // Added filterTag parameter
        notesListEl.innerHTML = '';
        let notesToRender = notes;

        // Apply note search filter
        const noteSearchTerm = noteSearchInput.value.toLowerCase();
        if (noteSearchTerm) {
            notesToRender = notesToRender.filter(note => 
                note.title.toLowerCase().includes(noteSearchTerm) ||
                note.transcript.toLowerCase().includes(noteSearchTerm)
            );
        }

        // Filter by folder first
        if (currentFolderId && currentFolderId !== 'all') {
            notesToRender = notesToRender.filter(note => note.folderId === currentFolderId);
        }

        // Then filter by tag if provided
        if (filterTag) {
            notesToRender = notesToRender.filter(note => note.tags.includes(filterTag));
        } else if (currentTagFilter) { // Apply global tag filter if no specific filterTag is provided
            notesToRender = notesToRender.filter(note => note.tags.includes(currentTagFilter));
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
                    loadNote(note.id);
                }
            });
            notesListEl.appendChild(noteItem);
        });

        // Add event listeners for delete buttons
        notesListEl.querySelectorAll('.delete-note-btn').forEach(btn => {
            btn.addEventListener('click', (event) => {
                event.stopPropagation(); // Prevent loading the note
                const noteIdToDelete = event.target.dataset.id;
                if (confirm('정말로 이 노트를 삭제하시겠습니까?')) {
                    deleteNote(noteIdToDelete);
                }
            });
        });
    }

    function deleteNote(id) {
        notes = notes.filter(note => note.id !== id);
        saveData();
        if (currentNoteId === id) {
            // If deleted note was active, create a new one or load another
            if (notes.length > 0) {
                loadNote(notes[0].id);
            } else {
                createNote();
            }
        }
        else {
            renderNotesList(); // Just re-render the list
            renderTagsList(); // Update tags list
        }
    }

    function undo() {
        if (historyIndex > 0) {
            historyIndex--;
            finalTranscriptEl.innerHTML = history[historyIndex];
            updateUndoRedoButtons();
        }
    }

    function redo() {
        if (historyIndex < history.length - 1) {
            historyIndex++;
            finalTranscriptEl.innerHTML = history[historyIndex];
            updateUndoRedoButtons();
        }
    }

    function updateUndoRedoButtons() {
        const undoBtn = document.getElementById('undo-btn');
        const redoBtn = document.getElementById('redo-btn');
        if (undoBtn) undoBtn.disabled = historyIndex <= 0;
        if (redoBtn) redoBtn.disabled = historyIndex >= history.length - 1;
    }

    function renderTags(tags) {
        tagsDisplay.innerHTML = '';
        tags.forEach(tag => {
            const tagSpan = document.createElement('span');
            tagSpan.classList.add('tag-item');
            tagSpan.textContent = tag;
            const removeBtn = document.createElement('span');
            removeBtn.textContent = ' x';
            removeBtn.classList.add('remove-tag');
            removeBtn.addEventListener('click', () => {
                tagSpan.remove();
                saveNote();
            });
            tagSpan.appendChild(removeBtn);
            tagsDisplay.appendChild(tagSpan);
        });
    }

    // --- Tag Filter Management ---
    const tagsFilterListEl = document.getElementById('tags-filter-list');

    function renderTagsList() {
        tagsFilterListEl.innerHTML = '';
        const allTags = new Set();
        notes.forEach(note => {
            note.tags.forEach(tag => allTags.add(tag));
        });

        // Add 'All Tags' filter option
        const allTagsItem = document.createElement('li');
        allTagsItem.classList.add('tag-filter-item');
        if (currentTagFilter === null) {
            allTagsItem.classList.add('active');
        }
        allTagsItem.textContent = '모든 태그';
        allTagsItem.addEventListener('click', () => {
            currentTagFilter = null;
            renderTagsList();
            renderNotesList();
        });
        tagsFilterListEl.appendChild(allTagsItem);

        Array.from(allTags).sort().forEach(tag => {
            const tagItem = document.createElement('li');
            tagItem.classList.add('tag-filter-item');
            if (currentTagFilter === tag) {
                tagItem.classList.add('active');
            }
            tagItem.textContent = tag;
            tagItem.addEventListener('click', () => {
                currentTagFilter = tag;
                renderTagsList();
                renderNotesList();
            });
            tagsFilterListEl.appendChild(tagItem);
        });
    }

    // --- Folder Management ---
    const foldersListEl = document.getElementById('folders-list');
    const addFolderBtn = document.getElementById('add-folder-btn');

    function renderFoldersList() {
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
                    currentFolderId = folder.id;
                    renderFoldersList();
                    renderNotesList();
                }
            });
            foldersListEl.appendChild(folderItem);
        });

        // Add event listeners for delete folder buttons
        foldersListEl.querySelectorAll('.delete-folder-btn').forEach(btn => {
            btn.addEventListener('click', (event) => {
                event.stopPropagation();
                const folderIdToDelete = event.target.dataset.id;
                if (confirm('정말로 이 폴더와 안에 있는 모든 노트를 삭제하시겠습니까?')) {
                    deleteFolder(folderIdToDelete);
                }
            });
        });
    }

    function createFolder() {
        const folderName = prompt('새 폴더 이름을 입력하세요:');
        if (folderName && folderName.trim() !== '') {
            const newFolder = {
                id: Date.now().toString(),
                name: folderName.trim()
            };
            folders.push(newFolder);
            saveData();
            renderFoldersList();
        }
    }

    function deleteFolder(id) {
        // Move notes in this folder to 'all' folder or delete them
        notes = notes.map(note => {
            if (note.folderId === id) {
                // Option 1: Move to 'all' folder
                note.folderId = 'all';
                // Option 2: Delete notes in this folder (uncomment below and comment above)
                // return null;
            }
            return note;
        }).filter(note => note !== null);

        folders = folders.filter(folder => folder.id !== id);
        saveData();
        if (currentFolderId === id) {
            currentFolderId = 'all'; // Switch to 'all' folder if current folder is deleted
        }
        renderFoldersList();
        renderNotesList();
    }

    // --- Search Functionality ---
    function searchTranscript() {
        const searchTerm = searchInput.value.trim();
        if (!searchTerm) {
            // If search term is empty, restore original transcript
            loadNote(currentNoteId); // Reload current note to clear highlight
            return;
        }

        const currentNote = notes.find(n => n.id === currentNoteId);
        if (!currentNote) return;

        const originalContent = currentNote.transcript;
        let highlightedContent = originalContent;

        // Create a regex for the search term, case-insensitive
        const regex = new RegExp(`(${searchTerm})`, 'gi');

        // Replace matches with highlighted span, avoiding re-highlighting existing spans
        highlightedContent = highlightedContent.replace(regex, '<span class="highlight">$1</span>');

        finalTranscriptEl.innerHTML = highlightedContent;
    }

    // --- Real-time Transcription ---
    async function startRecording() {
        if (isRecording || !vad) return;

        isRecording = true;
        updateRecordButton();
        statusMessage.textContent = '녹음 중...';
        audioVisualizer.style.display = 'block';
        visualizerCanvasCtx = audioVisualizer.getContext('2d');

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    noiseSuppression: true,
                    echoCancellation: true
                }
            });

            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioContext.createAnalyser();
            const mediaStreamSource = audioContext.createMediaStreamSource(stream);
            mediaStreamSource.connect(analyser);

            if (loadSettings(false).recordAudio) {
                mediaRecorder = new MediaRecorder(stream);
                audioChunks = [];
                audioStartTime = Date.now();

                mediaRecorder.ondataavailable = (event) => {
                    audioChunks.push(event.data);
                };

                mediaRecorder.onstop = () => {
                    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                    audioBlobUrl = URL.createObjectURL(audioBlob);
                };
            }

            vad.start();
            drawVisualizer();

        } catch (error) {
            console.error('Error starting audio recording:', error);
            statusMessage.textContent = `오류: 오디오 기록 시작 실패 - ${error.message}`;
            isRecording = false;
            updateRecordButton();
            audioVisualizer.style.display = 'none';
            if (audioContext) {
                audioContext.close();
            }
        }
    }

    function stopRecording(unexpected = false) {
        if (!isRecording) return;
        isRecording = false;

        if (vad) {
            vad.pause();
        }

        if (recognition) {
            recognition.stop();
        }

        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
        }

        if (audioContext) {
            audioContext.close();
            audioContext = null;
        }

        audioVisualizer.style.display = 'none';

        updateRecordButton();

        if (unexpected) {
            statusMessage.textContent = '음성 인식이 중단되었습니다.';
            return;
        }

        if (finalTranscriptEl.textContent.trim().length > 0) {
            statusMessage.textContent = '녹음 완료.';
            postRecordingActions.style.display = 'flex';
            if (audioBlobUrl) {
                downloadAudioBtn.style.display = 'inline-block';
            } else {
                downloadAudioBtn.style.display = 'none';
            }
            saveNote();
        } else {
            statusMessage.textContent = '녹음이 중지되었습니다. 인식된 내용이 없습니다.';
            postRecordingActions.style.display = 'none';
            downloadAudioBtn.style.display = 'none';
        }
    }

    function drawVisualizer() {
        if (!isRecording) return;

        requestAnimationFrame(drawVisualizer);

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteTimeDomainData(dataArray);

        visualizerCanvasCtx.fillStyle = 'rgb(200, 200, 200)';
        visualizerCanvasCtx.fillRect(0, 0, audioVisualizer.width, audioVisualizer.height);

        visualizerCanvasCtx.lineWidth = 2;
        visualizerCanvasCtx.strokeStyle = 'rgb(0, 0, 0)';

        visualizerCanvasCtx.beginPath();

        const sliceWidth = audioVisualizer.width * 1.0 / bufferLength;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {

            const v = dataArray[i] / 128.0;
            const y = v * audioVisualizer.height / 2;

            if (i === 0) {
                visualizerCanvasCtx.moveTo(x, y);
            } else {
                visualizerCanvasCtx.lineTo(x, y);
            }

            x += sliceWidth;
        }

        visualizerCanvasCtx.lineTo(audioVisualizer.width, audioVisualizer.height / 2);
        visualizerCanvasCtx.stroke();
    }

    async function generateSummary() {
        if (summaryOutputEl.innerHTML.trim().length > 0) {
            if (!confirm('이미 요약된 내용이 있습니다. 새로 요약하시겠습니까?')) {
                return;
            }
        }

        const settings = loadSettings(false);
        const apiKey = settings.geminiApiKey;

        if (!apiKey) {
            alert('Gemini API 키를 설정에서 입력해주세요.');
            return;
        }

        if (finalTranscriptEl.textContent.trim().length === 0) {
            summaryOutputEl.textContent = '요약할 내용이 없습니다.';
            return;
        }

        statusMessage.textContent = '요약을 생성합니다...';
        summaryOutputEl.textContent = '요약 중...';

        try {
            const prompt = `다음 텍스트를 요약해줘. 요약 형식: ${settings.summaryFormat}\n\n${finalTranscriptEl.innerText}`;
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error.message || 'Gemini API 호출 실패');
            }

            const data = await response.json();
            if (data.candidates && data.candidates.length > 0 && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts.length > 0) {
                const summary = data.candidates[0].content.parts[0].text;
                summaryOutputEl.innerHTML = summary.split('\n').join('<br>');
                statusMessage.textContent = '요약이 완료되었습니다.';
                saveNote(); // Save the note with the new summary
            } else {
                throw new Error('API 응답에서 요약 내용을 찾을 수 없습니다.');
            }
        } catch (error) {
            console.error('Error generating summary:', error);
            summaryOutputEl.textContent = `요약 실패: ${error.message}`;
            statusMessage.textContent = '요약 생성 중 오류가 발생했습니다.';
        }
    }

    function downloadToFile(format) {
        const settings = loadSettings(false);
        const title = noteTitleInput.value || settings.docTitleFormat.replace('[YYYY-MM-DD]', new Date().toISOString().slice(0, 10)); // Use note title
        let content = '';
        let filename = `${title}`;
        let mimeType = 'text/plain;charset=utf-8';

        const transcriptContent = finalTranscriptEl.innerText; // Use innerText for plain text
        const transcriptHtml = finalTranscriptEl.innerHTML; // Use innerHTML for HTML export
        const summaryContent = summaryOutputEl.innerText;

        switch (format) {
            case 'txt':
                content = `제목: ${title}\n\n녹음 내용:\n${transcriptContent}\n\n요약:\n${summaryContent}`;
                filename += '.txt';
                break;
            case 'md':
                content = `# ${title}\n\n## 녹음 내용\n${transcriptContent}\n\n## 요약\n${summaryContent}`;
                filename += '.md';
                break;
            case 'html':
                content = `<!DOCTYPE html>\n<html lang="ko">\n<head>\n    <meta charset="UTF-8">\n    <title>${title}</title>\n    <style>\n        body { font-family: sans-serif; line-height: 1.6; }\n        h1, h2 { color: #333; }\n        .transcript-segment { cursor: pointer; background-color: #e0e0e0; padding: 2px 5px; border-radius: 3px; margin-right: 5px; display: inline-block; }\n        .transcript-segment:hover { background-color: #c0c0c0; }\n        pre { background-color: #f4f4f4; padding: 10px; border-radius: 5px; overflow-x: auto; }\n    </style>\n</head>\n<body>\n    <h1>${title}</h1>\n    <h2>녹음 내용</h2>\n    <div>${transcriptHtml}</div>\n    <h2>요약</h2>\n    <pre>${summaryContent}</pre>\n</body>\n</html>`;
                filename += '.html';
                mimeType = 'text/html;charset=utf-8';
                break;
            default:
                content = `제목: ${title}\n\n녹음 내용:\n${transcriptContent}\n\n요약:\n${summaryContent}`;
                filename += '.txt';
                break;
        }

        const blob = new Blob([content], { type: mimeType });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        statusMessage.textContent = '파일이 저장되었습니다.';
    }


    function updateRecordButton() {
        if (isRecording) {
            recordBtn.classList.add('recording');
            recordBtn.innerHTML = '<i class="material-icons">stop</i>';
        } else {
            recordBtn.classList.remove('recording');
            recordBtn.innerHTML = '<i class="material-icons">mic</i>';
        }
    }

    function speakTranscript() {
        if ('speechSynthesis' in window) {
            const text = finalTranscriptEl.innerText;
            const utterance = new SpeechSynthesisUtterance(text);
            const settings = loadSettings(false);
            utterance.lang = settings.language; // Use selected language for TTS
            window.speechSynthesis.speak(utterance);
        } else {
            alert('죄송합니다. 이 브라우저에서는 텍스트 음성 변환(TTS)을 지원하지 않습니다.');
        }
    }

    function exportAllNotes() {
        const dataStr = JSON.stringify(notes, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'voice_notes_backup.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        statusMessage.textContent = '모든 노트가 JSON 파일로 내보내졌습니다.';
    }

    function importAllNotes(event) {
        const file = event.target.files[0];
        if (!file) {
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const importedNotes = JSON.parse(e.target.result);
                if (Array.isArray(importedNotes)) {
                    notes = importedNotes; // Overwrite existing notes
                    saveData();
                    loadData(); // Reload UI with imported notes
                    renderTagsList(); // Update tags list
                    statusMessage.textContent = '모든 노트가 성공적으로 불러와졌습니다.';
                } else {
                    alert('유효하지 않은 JSON 파일 형식입니다.');
                }
            } catch (error) {
                console.error('Error importing notes:', error);
                alert('노트 불러오기 실패: 유효한 JSON 파일이 아닙니다.');
            }
        };
        reader.readAsText(file);
    }

    function deleteAllNotes() {
        if (confirm('정말로 모든 노트를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) {
            notes = [];
            folders = [{ id: 'all', name: '모든 노트' }]; // Reset folders as well
            saveData();
            createNote(); // Create a new empty note
            renderTagsList(); // Update tags list
            statusMessage.textContent = '모든 노트가 삭제되었습니다.';
        }
    }

    // --- Settings ---
    const defaultSettings = {
        docTitleFormat: '[YYYY-MM-DD] 음성 메모',
        language: 'ko-KR',
        summaryFormat: 'bullet',
        theme: 'light',
        fontSize: 16,
        geminiApiKey: '',
        recordAudio: false,
        silenceTimeout: 30, // New setting: silence timeout in seconds
        customColors: {
            primary: '#6200EE',
            background: '#F0F2F5',
            text: '#212121'
        }
    };

    function loadSettings(applyUI = true) {
        const savedSettings = JSON.parse(localStorage.getItem('voiceNotesSettings')) || {};
        const settings = { ...defaultSettings, ...savedSettings };

        if (applyUI) {
            docTitleFormatInput.value = settings.docTitleFormat;
            languageSelect.value = settings.language;
            summaryFormatSelect.value = settings.summaryFormat;
            themeSelect.value = settings.theme;
            fontSizeSlider.value = settings.fontSize;
            geminiApiKeyInput.value = settings.geminiApiKey;
            recordAudioCheckbox.checked = settings.recordAudio;
            document.getElementById('silence-timeout').value = settings.silenceTimeout; // Added

            // Apply custom colors
            document.documentElement.style.setProperty('--primary-color', settings.customColors.primary);
            document.documentElement.style.setProperty('--background-color', settings.customColors.background);
            document.documentElement.style.setProperty('--text-color', settings.customColors.text);
            
            // Update color pickers
            document.getElementById('primary-color-picker').value = settings.customColors.primary;
            document.getElementById('background-color-picker').value = settings.customColors.background;
            document.getElementById('text-color-picker').value = settings.customColors.text;

            applyTheme(settings.theme);
            applyFontSize(settings.fontSize);
        }
        return settings;
    }

    function saveSettings() {
        const settings = {
            docTitleFormat: docTitleFormatInput.value,
            language: languageSelect.value,
            summaryFormat: summaryFormatSelect.value,
            theme: themeSelect.value,
            fontSize: fontSizeSlider.value,
            geminiApiKey: geminiApiKeyInput.value,
            recordAudio: recordAudioCheckbox.checked,
            silenceTimeout: parseInt(document.getElementById('silence-timeout').value), // Added
            customColors: {
                primary: document.getElementById('primary-color-picker').value,
                background: document.getElementById('background-color-picker').value,
                text: document.getElementById('text-color-picker').value
            }
        };
        localStorage.setItem('voiceNotesSettings', JSON.stringify(settings));
        return settings;
    }

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
    }

    function applyFontSize(size) {
        finalTranscriptEl.style.fontSize = `${size}px`;
    }

    function toggleDarkMode() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        applyTheme(newTheme);
        // Update settings in localStorage
        const settings = loadSettings(false);
        settings.theme = newTheme;
        localStorage.setItem('voiceNotesSettings', JSON.stringify(settings));
        themeSelect.value = newTheme; // Update the theme select in settings modal
    }

    // --- Event Listeners ---
    settingsBtn.addEventListener('click', () => settingsModal.style.display = 'block');
    closeModalBtn.addEventListener('click', () => settingsModal.style.display = 'none');
    window.addEventListener('click', (event) => {
        if (event.target == settingsModal) settingsModal.style.display = 'none';

        // Close sidebar if clicked outside and sidebar is open on mobile
        if (window.innerWidth <= 768 && sidebar.classList.contains('open') &&
            !sidebar.contains(event.target) && event.target !== sidebarToggleBtn) {
            sidebar.classList.remove('open');
        }
    });

    darkModeToggleBtn.addEventListener('click', toggleDarkMode);
    sidebarToggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('open');
    });

    saveSettingsBtn.addEventListener('click', () => {
        const newSettings = saveSettings();
        applyTheme(newSettings.theme); // Re-apply theme to update CSS variables
        applyFontSize(newSettings.fontSize);
        settingsModal.style.display = 'none';
        alert('설정이 저장되었습니다.');
    });

    exportAllNotesBtn.addEventListener('click', exportAllNotes);

    importAllNotesBtn.addEventListener('click', () => {
        importAllNotesFileInput.click();
    });

    importAllNotesFileInput.addEventListener('change', importAllNotes);

    deleteAllNotesBtn.addEventListener('click', deleteAllNotes);

    const exportGoogleDriveBtn = document.getElementById('export-google-drive-btn');

    if (exportGoogleDriveBtn) exportGoogleDriveBtn.addEventListener('click', shareNotesToGoogleDrive);

    recordBtn.addEventListener('click', () => {
        if (isRecording) {
            stopRecording();
        }
        else {
            startRecording();
        }
    });

    addFolderBtn.addEventListener('click', createFolder); // Add event listener for add folder button

    const undoIconBtn = document.getElementById('undo-icon-btn'); // New ID
    const redoIconBtn = document.getElementById('redo-icon-btn'); // New ID

    if (undoIconBtn) undoIconBtn.addEventListener('click', undo);
    if (redoIconBtn) redoIconBtn.addEventListener('click', redo);

    // --- Post-recording Actions ---
    summarizeBtn.addEventListener('click', async () => {
        await generateSummary();
    });

    saveToFileBtn.addEventListener('click', () => {
        const format = exportFormatSelect.value;
        downloadToFile(format);
    });

    discardBtn.addEventListener('click', () => {
        if (currentNoteId) {
            deleteNote(currentNoteId);
        }
        interimTranscriptEl.textContent = '';
        finalTranscriptEl.innerHTML = ''; // Use innerHTML to clear spans
        summaryOutputEl.innerHTML = '';
        statusMessage.textContent = '버튼을 눌러 녹음을 시작하세요';
        postRecordingActions.style.display = 'none';
        saveNote(); // Clear saved transcript
        if (audioBlobUrl) {
            URL.revokeObjectURL(audioBlobUrl);
            audioBlobUrl = null;
        }
        downloadAudioBtn.style.display = 'none'; // Hide download button on discard
    });

    ttsBtn.addEventListener('click', speakTranscript);

    downloadAudioBtn.addEventListener('click', () => {
        if (audioBlobUrl) {
            const a = document.createElement('a');
            a.href = audioBlobUrl;
            a.download = `audio_${new Date().toISOString().slice(0, 19).replace(/[-T:]/g, '')}.webm`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            statusMessage.textContent = '오디오 파일이 다운로드되었습니다.';
        } else {
            statusMessage.textContent = '다운로드할 오디오가 없습니다.';
        }
    });

    finalTranscriptEl.addEventListener('input', saveNote);
    noteTitleInput.addEventListener('input', saveNote);

    const loadFileIconBtn = document.getElementById('load-file-icon-btn'); // New ID
    if (loadFileIconBtn) {
        loadFileIconBtn.addEventListener('click', () => {
            fileInput.click();
        });
    }

    newNoteBtn.addEventListener('click', () => {
        createNote();
    });

    const uploadAudioIconBtn = document.getElementById('upload-audio-icon-btn'); // New ID
    if (uploadAudioIconBtn) {
        uploadAudioIconBtn.addEventListener('click', () => {
            audioFileInput.click();
        });
    }

    audioFileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) {
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            audioPlayer.src = e.target.result;
            audioPlayer.style.display = 'block';
            statusMessage.textContent = '오디오 파일이 로드되었습니다. 재생하면서 녹음 버튼을 눌러 필사하세요.';
        };
        reader.readAsDataURL(file);
    });

    fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) {
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            createNote(); // Create a new note for the loaded file
            finalTranscriptEl.innerHTML = e.target.result; // Use innerHTML for loaded content
            interimTranscriptEl.textContent = '';
            summaryOutputEl.innerHTML = '';
            statusMessage.textContent = '파일이 불러와졌습니다. 요약 버튼을 누르세요.';
            postRecordingActions.style.display = 'flex';
            saveNote(); // Save loaded transcript to the new note
        };
        reader.readAsText(file);
    });

    const searchIconBtn = document.getElementById('search-icon-btn'); // New ID
    if (searchIconBtn) {
        searchIconBtn.addEventListener('click', searchTranscript);
    }
    searchInput.addEventListener('keyup', (event) => {
        if (event.key === 'Enter') {
            searchTranscript();
        }
    });

    // --- Initial Load ---
    async function main() {
        console.log('main function started.');
        recordBtn.disabled = true;
        statusMessage.textContent = 'VAD 라이브러리 로딩 중...';

        try {
            // The VAD library is now loaded via a script tag in index.html
            // We just need to wait for the window.vad object to be available.
            await new Promise(resolve => {
                const interval = setInterval(() => {
                    if (window.vad) {
                        clearInterval(interval);
                        resolve();
                    }
                }, 100);
            });

            console.log('VAD library available. Initializing MicVAD...');
            vad = await window.vad.MicVAD.new({
                modelURL: 'js/silero_vad.onnx',
                workletURL: 'js/vad.worklet.min.js',

                onSpeechStart: () => {
                    isSpeaking = true;
                    console.log("Speech started");
                    if (recognition && !isRecording) {
                        recognition.start();
                    }
                },
                onSpeechEnd: (audio) => {
                    isSpeaking = false;
                    console.log("Speech ended");
                    if (recognition && isRecording) {
                        recognition.stop();
                    }
                }
            });
            console.log('MicVAD initialized.');
            recordBtn.disabled = false;
            statusMessage.textContent = '녹음 준비 완료';
        } catch (error) {
            console.error('Failed to initialize VAD:', error);
            statusMessage.textContent = 'VAD 초기화 실패. 마이크 권한을 확인하거나 페이지를 새로고침하세요.';
        }

        loadSettings();
        loadData(); // Load all notes and folders
        updateUndoRedoButtons(); // Initialize undo/redo button states
        console.log('Initial load complete.');
    }

    main();

    // Tag Input Event Listeners
    tagInput.addEventListener('keyup', (event) => {
        if (event.key === 'Enter') {
            const tags = tagInput.value.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
            if (tags.length > 0) {
                const currentTags = Array.from(tagsDisplay.querySelectorAll('.tag-item')).map(tagEl => tagEl.textContent.replace(' x', ''));
                const newTags = [...new Set([...currentTags, ...tags])]; // Add new tags, remove duplicates
                renderTags(newTags);
                saveNote();
                tagInput.value = '';
            }
        }
    });

    tagsDisplay.addEventListener('click', (event) => {
        if (event.target.classList.contains('tag-item')) {
            const clickedTag = event.target.textContent.replace(' x', '');
            currentTagFilter = clickedTag;
            renderTagsList(); // Update active state in tags filter list
            renderNotesList(); // Re-render notes with the new tag filter
        }
    });

    noteSearchInput.addEventListener('keyup', (event) => {
        renderNotesList(); // Re-render notes based on search input
    });
});

async function shareNotesToGoogleDrive() {
    if (!navigator.share) {
        alert('죄송합니다. 이 브라우저에서는 웹 공유 API를 지원하지 않습니다. 파일을 직접 다운로드하여 Google Drive에 업로드해주세요.');
        return;
    }

    try {
        const notesData = JSON.stringify(notes, null, 2);
        const blob = new Blob([notesData], { type: 'application/json' });
        const file = new File([blob], 'voice_notes_backup.json', { type: 'application/json' });

        await navigator.share({
            files: [file],
            title: '음성 필기 백업',
            text: '음성 필기 앱의 노트 백업 파일입니다.',
        });
        statusMessage.textContent = '노트가 성공적으로 공유되었습니다.';
    } catch (error) {
        console.error('Error sharing notes:', error);
        statusMessage.textContent = `노트 공유 실패: ${error.message}`;
    }
}


async function shareNotesToGoogleDrive() {
    if (!navigator.share) {
        alert('죄송합니다. 이 브라우저에서는 웹 공유 API를 지원하지 않습니다. 파일을 직접 다운로드하여 Google Drive에 업로드해주세요.');
        return;
    }

    try {
        const notesData = JSON.stringify(notes, null, 2);
        const blob = new Blob([notesData], { type: 'application/json' });
        const file = new File([blob], 'voice_notes_backup.json', { type: 'application/json' });

        await navigator.share({
            files: [file],
            title: '음성 필기 백업',
            text: '음성 필기 앱의 노트 백업 파일입니다.',
        });
        statusMessage.textContent = '노트가 성공적으로 공유되었습니다.';
    } catch (error) {
        console.error('Error sharing notes:', error);
        statusMessage.textContent = `노트 공유 실패: ${error.message}`;
    }
}