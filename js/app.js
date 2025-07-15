
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
        recognition: null,
        vad: null, // VAD instance
        visualizerState: null, // To control the visualizer animation
        history: [],
        historyIndex: -1,
        recordingStartTime: 0,
        audioChunks: [],
        audioBlobUrl: null, // To store the URL of the complete recording
        saveTimeout: null,
        currentSpeaker: 1,
        lastSpeechEndTime: 0,
        speakerChangeThresholdMs: 2000,
    };

    // --- DOM Elements ---
    const elements = ui.getDOMElements();

    // --- Initialization ---
    function main() {
        const { notes, folders } = storage.loadNotesAndFolders();
        state.notes = notes;
        state.folders = folders;
        state.settings = storage.loadSettings();

        ui.applyTheme(state.settings.theme);
        ui.applyFontSize(state.settings.fontSize);
        // updateSettingsModal(); // This should be implemented

        renderAllUI();

        state.recognition = audio.initSpeechRecognition(
            state.settings,
            handleRecognitionResult,
            handleRecognitionError
        );

        if (!state.recognition) {
            elements.recordBtn.disabled = true;
            elements.statusMessage.textContent = "Browser doesn't support SpeechRecognition.";
        }

        setupEventListeners();

        if (state.notes.length > 0) {
            loadNote(state.notes[0].id);
        } else {
            createNewNote();
        }
    }

    // --- UI Update Functions ---
    function renderAllUI() {
        ui.renderFoldersList(state.folders, state.currentFolderId, switchFolder, deleteFolder);
        ui.renderTagsFilterList(state.notes, state.currentTagFilter, switchTagFilter);
        ui.renderNotesList(state.notes, state.currentNoteId, elements.noteSearchInput.value, state.currentFolderId, state.currentTagFilter, loadNote, deleteNote);
    }

    // --- Event Listeners ---
    function setupEventListeners() {
        elements.recordBtn.addEventListener('click', toggleRecording);
        elements.newNoteBtn.addEventListener('click', createNewNote);
        elements.noteTitleInput.addEventListener('input', saveCurrentNote);
        elements.finalTranscriptEl.addEventListener('input', saveCurrentNote);
        // ... other listeners
    }

    // --- Recording Logic ---
    function toggleRecording() {
        if (state.isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    }

    async function startRecording() {
        if (!state.recognition) {
            ui.showToast("Speech recognition is not available.", "error");
            return;
        }

        state.isRecording = true;
        state.audioChunks = [];
        state.audioBlobUrl = null;
        state.recordingStartTime = Date.now();

        ui.updateRecordButton(true);
        elements.statusMessage.textContent = 'Initializing...';

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            state.visualizerState = ui.createVisualizer(stream, elements.audioVisualizer);
            state.vad = await audio.createVAD(stream, state.settings, {
                onSpeechStart: handleSpeechStart,
                onSpeechEnd: handleSpeechEnd,
            });
            state.recognition.start();
            elements.statusMessage.textContent = 'Listening for speech...';
        } catch (error) {
            console.error("Failed to start VAD or Recognition:", error);
            elements.statusMessage.textContent = `Error: ${error.message}`;
            ui.showToast(`VAD Error: ${error.message}`, 'error');
            state.isRecording = false;
            ui.updateRecordButton(false);
        }
    }

    function stopRecording() {
        if (!state.isRecording) return;

        state.isRecording = false;
        ui.updateRecordButton(false);

        if (state.vad) {
            audio.destroyVAD(state.vad, state.visualizerState);
            state.vad = null;
            state.visualizerState = null;
        }
        // Ensure recognition is stopped if it was running
        if (state.recognition) {
            state.recognition.stop();
        }

        elements.audioVisualizer.style.display = 'none';

        if (state.audioChunks.length > 0 && state.settings.recordAudio) {
            const audioBlob = new Blob(state.audioChunks, { type: 'audio/wav' });
            const reader = new FileReader();
            reader.onload = () => {
                state.audioBlobUrl = reader.result;
                elements.audioPlayer.src = state.audioBlobUrl;
                elements.audioPlayer.style.display = 'block';
                elements.downloadAudioBtn.style.display = 'block';
                saveCurrentNote(); // Save note after audio is processed
            };
            reader.readAsDataURL(audioBlob);
        } else {
             if (elements.finalTranscriptEl.textContent.trim().length > 0) {
                elements.statusMessage.textContent = 'Recording complete.';
                elements.postRecordingActions.style.display = 'flex';
                saveCurrentNote();
            } else {
                elements.statusMessage.textContent = 'Click the mic to start.';
                elements.postRecordingActions.style.display = 'none';
            }
        }
    }

    // --- VAD & Recognition Callbacks ---
    function handleSpeechStart() {
        console.log("Speech started");
        elements.statusMessage.textContent = 'Recording...';
        // Recognition is now started in startRecording()
    }

    function handleSpeechEnd(audio) {
        console.log("Speech ended");
        // The VAD library provides the audio chunk in the correct format
        state.audioChunks.push(audio);
        elements.statusMessage.textContent = 'Processing...';
    }

    function handleRecognitionResult(event) {
        let interim_transcript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            const result = event.results[i];
            const transcript = result[0].transcript;
            if (result.isFinal) {
                const timestamp = Date.now() - state.recordingStartTime;
                const span = document.createElement('span');
                span.textContent = transcript + ' ';
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
        ui.showToast(`Recognition Error: ${event.error}`, 'error');
    }

    // --- Note Management ---
    function createNewNote() {
        const newNote = {
            id: Date.now().toString(),
            title: '새 노트',
            transcript: '',
            summary: '',
            tags: [],
            audioBlobUrl: null,
            timestamp: new Date().toISOString(),
            folderId: state.currentFolderId === 'all' ? null : state.currentFolderId
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
            state.currentFolderId = note.folderId || 'all';
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

            elements.finalTranscriptEl.querySelectorAll('.transcript-segment').forEach(span => {
                span.addEventListener('click', () => seekAudio(parseInt(span.dataset.timestamp)));
            });

            elements.postRecordingActions.style.display = note.transcript ? 'flex' : 'none';
            elements.statusMessage.textContent = 'Note loaded.';
            renderAllUI();
        }
    }

    function saveCurrentNote() {
        if (!state.currentNoteId) return;

        elements.statusMessage.textContent = 'Saving...';

        clearTimeout(state.saveTimeout);
        state.saveTimeout = setTimeout(() => {
            const noteIndex = state.notes.findIndex(n => n.id === state.currentNoteId);
            if (noteIndex > -1) {
                const note = state.notes[noteIndex];
                note.title = elements.noteTitleInput.value;
                note.transcript = elements.finalTranscriptEl.innerHTML;
                note.summary = elements.summaryOutputEl.innerHTML;
                if (state.settings.recordAudio) {
                    note.audioBlobUrl = state.audioBlobUrl; // Save the audio URL
                } else {
                    note.audioBlobUrl = null; // Do not save audio if setting is off
                }
                note.timestamp = new Date().toISOString();
                storage.saveNotes(state.notes);
                elements.statusMessage.textContent = 'Saved.';
                renderAllUI();
            }
        }, 500);
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

    function deleteFolder(id) { /* Implementation needed */ }

    function switchTagFilter(tag) {
        state.currentTagFilter = tag;
        renderAllUI();
    }

    function seekAudio(timestamp) {
        const audioPlayer = elements.audioPlayer;
        if (audioPlayer && audioPlayer.src) {
            audioPlayer.currentTime = timestamp / 1000; // ms to seconds
            audioPlayer.play();
        }
    }

    // --- Run Application ---
    main();
});
