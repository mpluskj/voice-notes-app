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
    const discardBtn = document.getElementById('discard-btn');

    const fileInput = document.getElementById('file-input');
    const loadFileBtn = document.getElementById('load-file-btn');
    const exportFormatSelect = document.getElementById('export-format-select');

    const searchInput = document.getElementById('search-input');
    const searchBtn = document.getElementById('search-btn');

    const tagInput = document.getElementById('tag-input');
    const tagsDisplay = document.getElementById('tags-display');
    const newNoteBtn = document.getElementById('new-note-btn');
    const notesListEl = document.getElementById('notes-list');
    const ttsBtn = document.getElementById('tts-btn');


    // --- State ---
    let isRecording = false;
    let recognition = null;
    let mediaRecorder = null;
    let audioChunks = [];
    let audioBlobUrl = null;
    let audioStartTime = 0;
    let notes = []; // Array to store all notes
    let currentNoteId = null; // ID of the currently active note
    let history = []; // Stores snapshots of the transcript for undo/redo
    let historyIndex = -1; // Current position in the history array

    // --- Local Storage Management ---
    function loadNotes() {
        notes = JSON.parse(localStorage.getItem('voiceNotes')) || [];
        renderNotesList();
        if (notes.length > 0) {
            loadNote(notes[0].id); // Load the first note by default
        } else {
            createNote(); // Create a new note if none exist
        }
    }

    function saveNotes() {
        localStorage.setItem('voiceNotes', JSON.stringify(notes));
    }

    function createNote() {
        const newNote = {
            id: Date.now().toString(),
            title: '새 노트',
            transcript: '',
            summary: '',
            tags: [],
            audioBlobUrl: null,
            timestamp: new Date().toISOString()
        };
        notes.unshift(newNote); // Add to the beginning
        saveNotes();
        loadNote(newNote.id);
        history = ['']; // Initialize history for new note
        historyIndex = 0;
        updateUndoRedoButtons();
    }

    function loadNote(id) {
        const note = notes.find(n => n.id === id);
        if (note) {
            currentNoteId = note.id;
            finalTranscriptEl.innerHTML = note.transcript || '';
            summaryOutputEl.innerHTML = note.summary || '';
            renderTags(note.tags || []);
            audioBlobUrl = note.audioBlobUrl || null;
            postRecordingActions.style.display = 'flex';
            statusMessage.textContent = '노트가 불러와졌습니다.';
            renderNotesList(); // Update active state in list
            history = [note.transcript || '']; // Initialize history with current transcript
            historyIndex = 0;
            updateUndoRedoButtons();
            console.error('Note not found:', id);
        }
    }

    function saveNote() {
        if (!currentNoteId) return; // No note active

        const noteIndex = notes.findIndex(n => n.id === currentNoteId);
        if (noteIndex > -1) {
            notes[noteIndex].transcript = finalTranscriptEl.innerHTML;
            notes[noteIndex].summary = summaryOutputEl.innerHTML;
            notes[noteIndex].tags = Array.from(tagsDisplay.querySelectorAll('.tag-item')).map(tagEl => tagEl.textContent.replace(' x', ''));
            notes[noteIndex].audioBlobUrl = audioBlobUrl;
            notes[noteIndex].timestamp = new Date().toISOString(); // Update timestamp on save
            saveNotes();
            renderNotesList(); // Update list to reflect changes
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

    function renderNotesList() {
        notesListEl.innerHTML = '';
        notes.forEach(note => {
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
        saveNotes();
        if (currentNoteId === id) {
            // If deleted note was active, create a new one or load another
            if (notes.length > 0) {
                loadNote(notes[0].id);
            } else {
                createNote();
            }
        } else {
            renderNotesList(); // Just re-render the list
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
                saveTranscript();
            });
            tagSpan.appendChild(removeBtn);
            tagsDisplay.appendChild(tagSpan);
        });
    }

    // --- Search Functionality ---
    function searchTranscript() {
        const searchTerm = searchInput.value.trim();
        if (!searchTerm) {
            // If search term is empty, restore original transcript
            finalTranscriptEl.innerHTML = localStorage.getItem('finalTranscript') || '';
            return;
        }

        const originalContent = localStorage.getItem('finalTranscript') || '';
        let highlightedContent = originalContent;

        // Create a regex for the search term, case-insensitive
        const regex = new RegExp(`(${searchTerm})`, 'gi');

        // Replace matches with highlighted span, avoiding re-highlighting existing spans
        highlightedContent = highlightedContent.replace(regex, '<span class="highlight">$1</span>');

        finalTranscriptEl.innerHTML = highlightedContent;
    }

    // --- Real-time Transcription ---
    function startRecording() {
        if (isRecording) return;

        const settings = loadSettings(false);
        if (!settings.geminiApiKey) {
            alert('Gemini API 키를 설정에서 입력해주세요.');
            return;
        }

        isRecording = true;
        updateRecordButton();
        statusMessage.textContent = '녹음 중...';
        interimTranscriptEl.textContent = '';
        finalTranscriptEl.textContent = '';
        summaryOutputEl.innerHTML = '';
        postRecordingActions.style.display = 'none';
        saveNote(); // Save current (empty) state

        // Audio Recording Setup
        if (settings.recordAudio) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                mediaRecorder = new MediaRecorder(stream);
                audioChunks = [];
                audioStartTime = Date.now();

                mediaRecorder.ondataavailable = (event) => {
                    audioChunks.push(event.data);
                };

                mediaRecorder.onstop = () => {
                    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                    audioBlobUrl = URL.createObjectURL(audioBlob);
                    // You might want to add a UI element to play this audio
                };

                mediaRecorder.start();
                statusMessage.textContent = '녹음 중... (오디오 기록 중)';
            } catch (error) {
                console.error('Error starting audio recording:', error);
                statusMessage.textContent = `오류: 오디오 기록 시작 실패 - ${error.message}`;
                // Proceed with speech recognition even if audio recording fails
            }
        }

        recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
        recognition.lang = settings.language;
        recognition.interimResults = true;
        recognition.continuous = true;

        recognition.onresult = (event) => {
            let interimTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    const timestamp = (Date.now() - audioStartTime) / 1000; // seconds
                    const timestampFormatted = new Date(timestamp * 1000).toISOString().substr(11, 8); // HH:MM:SS
                    const span = document.createElement('span');
                    span.textContent = event.results[i][0].transcript + '\n';
                    span.dataset.timestamp = timestamp;
                    span.classList.add('transcript-segment');
                    span.addEventListener('click', () => {
                        if (audioBlobUrl) {
                            const audio = new Audio(audioBlobUrl);
                            audio.currentTime = timestamp;
                            audio.play();
                        }
                    });
                    finalTranscriptEl.appendChild(span);
                    saveNote(); // Save after each final transcript update
                } else {
                    interimTranscript += event.results[i][0].transcript;
                }
            }
            finalTranscriptEl.textContent = finalTranscript;
            interimTranscriptEl.textContent = interimTranscript;
        };

        recognition.onend = () => {
            if (isRecording) { // Unexpected stop
                stopRecording(true);
            }
        };

        recognition.onerror = (event) => {
            console.error('Speech Recognition Error:', event.error);
            statusMessage.textContent = `오류: ${event.error}`;
            stopRecording();
        };

        recognition.start();
    }

    function stopRecording(unexpected = false) {
        if (!isRecording) return;
        isRecording = false;

        if (recognition) {
            recognition.stop();
            recognition = null;
        }

        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
        }

        updateRecordButton();

        if (unexpected) {
            statusMessage.textContent = '음성 인식이 중단되었습니다.';
            return;
        }

        if (finalTranscriptEl.textContent.trim().length > 0) {
            statusMessage.textContent = '녹음 완료.';
            postRecordingActions.style.display = 'flex';
            saveNote(); // Save final transcript on stop
        } else {
            statusMessage.textContent = '녹음이 중지되었습니다. 인식된 내용이 없습니다.';
            postRecordingActions.style.display = 'none';
        }
    }

    async function generateSummary() {
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
            const prompt = `다음 텍스트를 요약해줘. 요약 형식: ${settings.summaryFormat}

${finalTranscriptEl.innerText}`;
            const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent?key=${apiKey}`, {
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
            const summary = data.candidates[0].content.parts[0].text;
            summaryOutputEl.innerHTML = summary.split('\n').join('<br>');
            statusMessage.textContent = '요약이 완료되었습니다.';
        } catch (error) {
            console.error('Error generating summary:', error);
            summaryOutputEl.textContent = `요약 실패: ${error.message}`;
            statusMessage.textContent = '요약 생성 중 오류가 발생했습니다.';
        }
    }

    function downloadToFile(format) {
        const settings = loadSettings(false);
        const title = settings.docTitleFormat.replace('[YYYY-MM-DD]', new Date().toISOString().slice(0, 10));
        let content = '';
        let filename = `${title}`;
        let mimeType = 'text/plain;charset=utf-8';

        const transcriptContent = finalTranscriptEl.innerText; // Use innerText for plain text
        const transcriptHtml = finalTranscriptEl.innerHTML; // Use innerHTML for HTML export
        const summaryContent = summaryOutputEl.innerText;

        switch (format) {
            case 'txt':
                content = `제목: ${title}

녹음 내용:
${transcriptContent}

요약:
${summaryContent}`;
                filename += '.txt';
                break;
            case 'md':
                content = `# ${title}

## 녹음 내용
${transcriptContent}

## 요약
${summaryContent}`;
                filename += '.md';
                break;
            case 'html':
                content = `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <title>${title}</title>
    <style>
        body { font-family: sans-serif; line-height: 1.6; }
        h1, h2 { color: #333; }
        .transcript-segment { cursor: pointer; background-color: #e0e0e0; padding: 2px 5px; border-radius: 3px; margin-right: 5px; display: inline-block; }
        .transcript-segment:hover { background-color: #c0c0c0; }
        pre { background-color: #f4f4f4; padding: 10px; border-radius: 5px; overflow-x: auto; }
    </style>
</head>
<body>
    <h1>${title}</h1>
    <h2>녹음 내용</h2>
    <div>${transcriptHtml}</div>
    <h2>요약</h2>
    <pre>${summaryContent}</pre>
</body>
</html>`;
                filename += '.html';
                mimeType = 'text/html;charset=utf-8';
                break;
            default:
                content = `제목: ${title}

녹음 내용:
${transcriptContent}

요약:
${summaryContent}`;
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

    // --- Settings ---
    const defaultSettings = {
        docTitleFormat: '[YYYY-MM-DD] 음성 메모',
        language: 'ko-KR',
        summaryFormat: 'bullet',
        theme: 'light',
        fontSize: 16,
        geminiApiKey: '',
        recordAudio: false
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
            recordAudio: recordAudioCheckbox.checked
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

    // --- Event Listeners ---
    settingsBtn.addEventListener('click', () => settingsModal.style.display = 'block');
    closeModalBtn.addEventListener('click', () => settingsModal.style.display = 'none');
    window.addEventListener('click', (event) => {
        if (event.target == settingsModal) settingsModal.style.display = 'none';
    });

    saveSettingsBtn.addEventListener('click', () => {
        const newSettings = saveSettings();
        applyTheme(newSettings.theme);
        applyFontSize(newSettings.fontSize);
        settingsModal.style.display = 'none';
        alert('설정이 저장되었습니다.');
    });

    recordBtn.addEventListener('click', () => {
        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    });

    const undoBtn = document.getElementById('undo-btn');
    const redoBtn = document.getElementById('redo-btn');

    if (undoBtn) undoBtn.addEventListener('click', undo);
    if (redoBtn) redoBtn.addEventListener('click', redo);

    // --- Post-recording Actions ---
    summarizeBtn.addEventListener('click', async () => {
        await generateSummary();
        postRecordingActions.style.display = 'none';
    });

    saveToFileBtn.addEventListener('click', () => {
        const format = exportFormatSelect.value;
        downloadToFile(format);
        postRecordingActions.style.display = 'none';
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
    });

    ttsBtn.addEventListener('click', speakTranscript);

    finalTranscriptEl.addEventListener('input', saveNote);

    loadFileBtn.addEventListener('click', () => {
        fileInput.click();
    });

    newNoteBtn.addEventListener('click', () => {
        createNote();
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

    searchBtn.addEventListener('click', searchTranscript);
    searchInput.addEventListener('keyup', (event) => {
        if (event.key === 'Enter') {
            searchTranscript();
        }
    });

    // --- Initial Load ---
    loadSettings();
    loadNotes(); // Load all notes
    updateUndoRedoButtons(); // Initialize undo/redo button states
    // Remove auth check
    recordBtn.disabled = false;
    statusMessage.textContent = '버튼을 눌러 녹음을 시작하세요';

    // Tag Input Event Listeners
    tagInput.addEventListener('keyup', (event) => {
        if (event.key === 'Enter') {
            const tags = tagInput.value.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
            if (tags.length > 0) {
                const currentTags = Array.from(tagsDisplay.querySelectorAll('.tag-item')).map(tagEl => tagEl.textContent.replace(' x', ''));
                const newTags = [...new Set([...currentTags, ...tags])]; // Add new tags, remove duplicates
                renderTags(newTags);
                saveTranscript();
                tagInput.value = '';
            }
        }
    });

    tagsDisplay.addEventListener('click', (event) => {
        if (event.target.classList.contains('tag-item')) {
            const clickedTag = event.target.textContent.replace(' x', '');
            // Filter notes by tag
            const filteredNotes = notes.filter(note => note.tags.includes(clickedTag));
            renderNotesList(filteredNotes); // Render only filtered notes
        }
    });