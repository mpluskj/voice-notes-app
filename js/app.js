
// /js/app.js

import * as storage from './storage.js';
import * as audio from './audio.js';
import * as ui from './ui.js';


document.addEventListener('DOMContentLoaded', () => {

    // --- Central State Management ---
    const state = {
        notes: [],
        folders: [],
        settings: {},
        currentNoteId: null,
        currentFolderId: 'all',
        currentTagFilter: null,
        isRecording: false,
        vadIsRunning: false,
        recognition: null,
        vad: null,
        history: [],
        historyIndex: -1,
        recordingStartTime: 0, // To track timestamps
        audioChunks: [],
        saveTimeout: null, // For debouncing save operations
        currentSpeaker: 1, // Current speaker for diarization (Speaker 1, Speaker 2)
        lastSpeechEndTime: 0, // Timestamp of the last speech segment end
        speakerChangeThresholdMs: 2000, // Threshold for detecting speaker change (2 seconds of silence)
    };

    // --- DOM Elements ---
    const elements = ui.getDOMElements();

    // --- Initialization ---
    function main() {
        // Load data and settings
        const { notes, folders } = storage.loadNotesAndFolders();
        state.notes = notes;
        state.folders = folders;
        state.settings = storage.loadSettings();

        // Apply UI settings
        ui.applyTheme(state.settings.theme);
        ui.applyFontSize(state.settings.fontSize);
        updateSettingsModal();

        // Initial Render
        renderAllUI();

        // Setup Speech Recognition
        state.recognition = audio.initAudio(
            state.settings,
            handleSpeechStart,
            handleSpeechEnd,
            handleRecognitionResult,
            handleRecognitionError
        );

        if (!state.recognition) {
            elements.recordBtn.disabled = true;
            elements.statusMessage.textContent = "Browser doesn't support SpeechRecognition.";
        }

        // Setup Event Listeners
        setupEventListeners();

        // Load first note or create a new one
        if (state.notes.length > 0) {
            loadNote(state.notes[0].id);
        } else {
            createNewNote();
        }
    }

    // --- State & UI Update Functions ---
    function renderAllUI() {
        ui.renderFoldersList(state.folders, state.currentFolderId, switchFolder, deleteFolder);
        ui.renderTagsFilterList(state.notes, state.currentTagFilter, switchTagFilter);
        ui.renderNotesList(state.notes, state.currentNoteId, elements.noteSearchInput.value, state.currentFolderId, state.currentTagFilter, loadNote, deleteNote);
    }

    function updateSettingsModal() {
        // Populate settings modal with current state.settings
    }

    // --- Event Handlers ---
    function setupEventListeners() {
        elements.recordBtn.addEventListener('click', toggleRecording);
        elements.newNoteBtn.addEventListener('click', createNewNote);
        elements.noteTitleInput.addEventListener('input', saveCurrentNote);
        elements.finalTranscriptEl.addEventListener('input', saveCurrentNote);
        // ... add all other event listeners here, calling the handler functions below
    }

    function toggleRecording() {
        if (state.isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    }

    async function startRecording() {
        state.isRecording = true;
        state.recordingStartTime = Date.now(); // Set start time
        state.currentSpeaker = 1; // Reset speaker to 1
        state.lastSpeechEndTime = Date.now(); // Reset last speech end time
        ui.updateRecordButton(true);
        elements.statusMessage.textContent = 'Listening for speech...';

        try {
            state.vad = await audio.startVAD(state.settings, elements.audioVisualizer, elements.statusMessage, {
                onSpeechStart: handleSpeechStart,
                onSpeechEnd: handleSpeechEnd,
            });
            state.vadIsRunning = true;
        } catch (error) {
            state.isRecording = false;
            ui.updateRecordButton(false);
        }
    }

    function stopRecording() {
        if (!state.isRecording) return;

        state.isRecording = false;
        state.vadIsRunning = false;
        ui.updateRecordButton(false);
        audio.stopVAD();

        if (state.audioChunks.length > 0) {
            const audioBlob = new Blob(state.audioChunks, { type: 'audio/wav' });
            const audioUrl = URL.createObjectURL(audioBlob);
            state.audioBlobUrl = audioUrl; // Save URL to state
            elements.audioPlayer.src = audioUrl;
            elements.audioPlayer.style.display = 'block';
            elements.downloadAudioBtn.style.display = 'block';
        }

        if (elements.finalTranscriptEl.textContent.trim().length > 0) {
            elements.statusMessage.textContent = 'Recording complete.';
            elements.postRecordingActions.style.display = 'flex';
            saveCurrentNote();
        } else {
            elements.statusMessage.textContent = 'Recording stopped.';
            elements.postRecordingActions.style.display = 'none';
        }
        
        // Clear chunks for the next recording
        state.audioChunks = [];
    }

    function handleSpeechStart() {
        console.log("Speech started");
        const now = Date.now();
        if (state.lastSpeechEndTime > 0 && (now - state.lastSpeechEndTime) > state.speakerChangeThresholdMs) {
            // If silence was longer than threshold, switch speaker
            state.currentSpeaker = state.currentSpeaker === 1 ? 2 : 1;
        }
        elements.statusMessage.textContent = 'Recording...';
        if (state.recognition) {
            state.recognition.start();
        }
    }

    function handleSpeechEnd(audio) {
        console.log("Speech ended");
        state.audioChunks.push(audio);
        state.lastSpeechEndTime = Date.now(); // Record speech end time
        elements.statusMessage.textContent = 'Processing...';
        if (state.recognition) {
            state.recognition.stop();
        }
    }

    function handleRecognitionResult(event) {
        let interim_transcript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            const result = event.results[i];
            const transcript = result[0].transcript;
            if (result.isFinal) {
                const timestamp = Date.now() - state.recordingStartTime;
                const speakerLabel = `화자 ${state.currentSpeaker}: `;
                const span = document.createElement('span');
                span.textContent = speakerLabel + transcript + ' '; // Add speaker label and space
                span.dataset.timestamp = timestamp;
                span.classList.add('transcript-segment');
                span.addEventListener('click', () => seekAudio(timestamp));
                elements.finalTranscriptEl.appendChild(span);
            } else {
                interim_transcript += transcript;
            }
        }
        elements.interimTranscriptEl.textContent = interim_transcript;
    }

    function handleRecognitionError(event) {
        console.error('Speech recognition error:', event.error);
        elements.statusMessage.textContent = `Recognition Error: ${event.error}`;
    }

    function createNewNote() {
        const newNote = {
            id: Date.now().toString(),
            title: '새 노트',
            transcript: '',
            summary: '',
            tags: [],
            audioBlobUrl: null,
            timestamp: new Date().toISOString(),
            folderId: state.currentFolderId || 'all'
        };
        state.notes.unshift(newNote);
        storage.saveNotes(state.notes);
        loadNote(newNote.id);
        renderAllUI();
    }

    function loadNote(id) {
        const note = state.notes.find(n => n.id === id);
        if (note) {
            state.currentNoteId = note.id;
            state.currentFolderId = note.folderId;
            elements.noteTitleInput.value = note.title || '새 노트';
            elements.finalTranscriptEl.innerHTML = note.transcript || '';
            elements.summaryOutputEl.innerHTML = note.summary || '';
            state.audioBlobUrl = note.audioBlobUrl;
            if (note.audioBlobUrl) {
                elements.audioPlayer.src = note.audioBlobUrl;
                elements.audioPlayer.style.display = 'block';
                elements.downloadAudioBtn.style.display = 'block';
            } else {
                elements.audioPlayer.style.display = 'none';
                elements.downloadAudioBtn.style.display = 'none';
            }
            // Re-add event listeners to the loaded transcript segments
            elements.finalTranscriptEl.querySelectorAll('.transcript-segment').forEach(span => {
                span.addEventListener('click', () => seekAudio(parseInt(span.dataset.timestamp)));
            });

            // renderTags(note.tags || []); // This needs to be implemented in ui.js
            elements.postRecordingActions.style.display = 'flex';
            elements.statusMessage.textContent = 'Note loaded.';
            renderAllUI();
        }
    }

    function saveCurrentNote() {
        if (!state.currentNoteId) return;

        elements.statusMessage.textContent = 'Saving...'; // Show saving status

        // Debounce the save operation
        clearTimeout(state.saveTimeout);
        state.saveTimeout = setTimeout(() => {
            const noteIndex = state.notes.findIndex(n => n.id === state.currentNoteId);
            if (noteIndex > -1) {
                const note = state.notes[noteIndex];
                note.title = elements.noteTitleInput.value;
                note.transcript = elements.finalTranscriptEl.innerHTML;
                note.summary = elements.summaryOutputEl.innerHTML;
                note.audioBlobUrl = state.audioBlobUrl;
                note.timestamp = new Date().toISOString();
                storage.saveNotes(state.notes);
                elements.statusMessage.textContent = 'Saved.'; // Show saved status
                // ui.showToast('Note saved!'); // Toast can be redundant if we have status bar
                renderAllUI(); // Re-render to update note list preview if needed
            }
        }, 500); // Save after 500ms of inactivity
    }

    function deleteNote(id) {
        state.notes = state.notes.filter(note => note.id !== id);
        storage.saveNotes(state.notes);
        if (state.currentNoteId === id) {
            if (state.notes.length > 0) {
                loadNote(state.notes[0].id);
            } else {
                createNewNote();
            }
        }
        renderAllUI();
        ui.showToast('Note deleted.', 'error');
    }

    function switchFolder(id) {
        state.currentFolderId = id;
        renderAllUI();
    }
    function deleteFolder(id) { /* ... */ }
    function switchTagFilter(tag) {
        state.currentTagFilter = tag;
        renderAllUI();
    }

    function seekAudio(timestamp) {
        const audioPlayer = elements.audioPlayer;
        if (audioPlayer && audioPlayer.src) {
            audioPlayer.currentTime = timestamp / 1000; // Convert ms to seconds
            audioPlayer.play();
        }
    }


    // --- Run Application ---
    main();
});
