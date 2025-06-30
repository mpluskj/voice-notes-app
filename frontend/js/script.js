document.addEventListener('DOMContentLoaded', () => {
    // --- UI Elements ---
    const settingsBtn = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    const recordBtn = document.getElementById('record-btn');
    const statusMessage = document.getElementById('status-message');
    const header = document.querySelector('header');
    const interimTranscriptEl = document.getElementById('interim-transcript');
    const finalTranscriptEl = document.getElementById('final-transcript');
    const summaryOutputEl = document.getElementById('summary-output');

    // Settings Inputs
    const docTitleFormatInput = document.getElementById('doc-title-format');
    const languageSelect = document.getElementById('language-select');
    const summaryFormatSelect = document.getElementById('summary-format');
    const themeSelect = document.getElementById('theme-select');
    const fontSizeSlider = document.getElementById('font-size-slider');
    const newDocRadio = document.getElementById('new-doc');
    const appendDocRadio = document.getElementById('append-doc');
    const docIdInput = document.getElementById('doc-id-input');
    const geminiApiKeyInput = document.getElementById('gemini-api-key');

    // Document Selection Modal Elements
    const docSelectionModal = document.getElementById('doc-selection-modal');
    const closeDocSelectionModalBtn = document.getElementById('close-doc-selection-modal-btn');
    const newDocRadioPopup = document.getElementById('new-doc-popup');
    const appendDocRadioPopup = document.getElementById('append-doc-popup');
    const docIdInputPopup = document.getElementById('doc-id-input-popup');
    const startRecordingFromPopupBtn = document.getElementById('start-recording-from-popup-btn');

    // Post-recording Action Buttons
    const postRecordingActions = document.getElementById('post-recording-actions');
    const summarizeBtn = document.getElementById('summarize-btn');
    const saveToGoogleDocsBtn = document.getElementById('save-to-google-docs-btn');
    const discardBtn = document.getElementById('discard-btn');


    // --- State ---
    let isLoggedIn = false;
    let isRecording = false;
    let ws = null; // WebSocket instance
    let finalTranscript = ''; // To accumulate final transcripts
    let currentDocId = null; // Store the ID of the current Google Doc

    // --- Authentication ---
    async function checkAuthStatus() {
        try {
            const response = await fetch('/auth/status');
            const data = await response.json();
            isLoggedIn = data.logged_in;
            updateUIForAuthState();
        } catch (error) {
            console.error('Error checking auth status:', error);
            isLoggedIn = false;
            updateUIForAuthState();
        }
    }

    function updateUIForAuthState() {
        const existingLoginBtn = document.getElementById('login-btn');
        if (existingLoginBtn) existingLoginBtn.remove();
        const existingLogoutBtn = document.getElementById('logout-btn');
        if (existingLogoutBtn) existingLogoutBtn.remove();

        if (isLoggedIn) {
            const logoutBtn = document.createElement('button');
            logoutBtn.id = 'logout-btn';
            logoutBtn.className = 'btn';
            logoutBtn.textContent = '로그아웃';
            logoutBtn.addEventListener('click', async () => {
                if(isRecording) await stopRecording();
                await fetch('/logout', { method: 'POST' });
                isLoggedIn = false;
                updateUIForAuthState();
            });
            header.appendChild(logoutBtn);
            recordBtn.disabled = false;
            statusMessage.textContent = '버튼을 눌러 녹음을 시작하세요';
        } else {
            const loginBtn = document.createElement('button');
            loginBtn.id = 'login-btn';
            loginBtn.className = 'btn';
            loginBtn.textContent = 'Google 계정으로 로그인';
            loginBtn.addEventListener('click', () => window.location.href = '/login');
            header.appendChild(loginBtn);
            recordBtn.disabled = true;
            statusMessage.textContent = '먼저 로그인해주세요';
        }
    }

    // --- Real-time Transcription & Summarization ---
    async function startRecording(docMode, docId) {
        if (isRecording || !isLoggedIn) return;

        isRecording = true;
        updateRecordButton();
        statusMessage.textContent = '마이크 접근 중...';
        interimTranscriptEl.textContent = '';
        finalTranscriptEl.textContent = '';
        summaryOutputEl.innerHTML = '';
        finalTranscript = ''; // Reset for new recording
        postRecordingActions.style.display = 'none'; // Hide action buttons

        const settings = loadSettings(false);
        const docTitle = settings.docTitleFormat.replace('[YYYY-MM-DD]', new Date().toISOString().slice(0, 10));

        // WebSocket 연결
        ws = new WebSocket(`ws://${window.location.host}/ws/transcribe`);

        ws.onopen = async () => {
            statusMessage.textContent = '서버 연결됨. 마이크 접근 중...';
            // Send configuration to backend
            ws.send(JSON.stringify({
                language: settings.language,
                docTitle: docTitle,
                docMode: docMode,
                docId: docId
            }));

            // Start audio processing
            try {
                const audioStream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, sampleRate: 16000 } });
                const audioContext = new AudioContext({ sampleRate: 16000 });
                await audioContext.audioWorklet.addModule('/js/audio-processor.js');
                
                const source = audioContext.createMediaStreamSource(audioStream);
                const processorNode = new AudioWorkletNode(audioContext, 'audio-processor');
                processorNode.port.onmessage = (event) => {
                    if (ws && ws.readyState === WebSocket.OPEN) {
                        ws.send(event.data);
                    }
                };
                source.connect(processorNode).connect(audioContext.destination);
                statusMessage.textContent = '녹음 중... 말하기 시작하세요.';
            } catch (error) {
                console.error('Error starting audio processing:', error);
                statusMessage.textContent = `오류: ${error.message}`;
                stopRecording();
            }
        };

        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'transcript') {
                if (data.is_final) {
                    finalTranscript += data.text + ' '; // Add space for readability
                    finalTranscriptEl.textContent = finalTranscript;
                    interimTranscriptEl.textContent = ''; // Clear interim after final
                } else {
                    interimTranscriptEl.textContent = data.text;
                }
            } else if (data.type === 'doc_created') {
                currentDocId = data.doc_id;
                // Display the created document ID if in new doc mode
                if (docMode === 'new') {
                    statusMessage.textContent = `새 문서 생성됨: ${data.doc_id}`;
                }
            }
        };

        ws.onclose = (event) => {
            console.log('WebSocket closed:', event.code, event.reason);
            statusMessage.textContent = '녹음 중지됨.';
            if (isRecording) {
                stopRecording(true); // Stop recording if WebSocket closes unexpectedly
            }
        };

        ws.onerror = (error) => {
            console.error('WebSocket Error:', error);
            statusMessage.textContent = 'WebSocket 오류 발생.';
            stopRecording();
        };
    }

    async function stopRecording(unexpected = false) {
        if (!isRecording) return;
        isRecording = false;

        if (ws) {
            ws.close();
            ws = null;
        }
        
        // finalTranscript should already contain all final segments.
        // Just ensure the display is updated with the final accumulated text.
        finalTranscriptEl.textContent = finalTranscript;

        updateRecordButton();

        if (unexpected) {
            statusMessage.textContent = '음성 인식이 중단되었습니다.';
            return;
        }

        if (finalTranscript.trim().length > 0) {
            statusMessage.textContent = '녹음 완료.';
            postRecordingActions.style.display = 'flex'; // Show action buttons
        } else {
            statusMessage.textContent = '녹음이 중지되었습니다. 인식된 내용이 없습니다.';
            postRecordingActions.style.display = 'none';
        }
    }

    async function generateSummary() {
        if (!currentDocId) {
            summaryOutputEl.textContent = '요약할 문서 ID가 없습니다.';
            statusMessage.textContent = '요약할 문서 ID가 없습니다.';
            return;
        }
        
        try {
            const settings = loadSettings(false);
            // Call the serverless function for summarization
            const response = await fetch('/summarize', { // Assuming /summarize is the endpoint for your backend
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    doc_id: currentDocId, // Pass the current docId for summarization context
                    summary_format: settings.summaryFormat,
                    api_key: settings.geminiApiKey
                })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.detail || '요약 생성 실패');
            }

            const data = await response.json();
            summaryOutputEl.innerHTML = data.summary.replace(/\n/g, '<br>');
            statusMessage.textContent = '요약이 완료되었습니다.';

        } catch (error) {
            console.error('Error generating summary:', error);
            summaryOutputEl.textContent = `요약 실패: ${error.message}`;
            statusMessage.textContent = '요약 생성 중 오류가 발생했습니다.';
        }
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

    // --- Settings ---
    const defaultSettings = {
        docTitleFormat: '[YYYY-MM-DD] 음성 메모',
        language: 'ko-KR',
        summaryFormat: 'bullet',
        theme: 'light',
        fontSize: 16,
        docMode: 'new',
        docId: '',
        geminiApiKey: ''
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
            newDocRadio.checked = (settings.docMode === 'new');
            appendDocRadio.checked = (settings.docMode === 'append');
            docIdInput.value = settings.docId;
            docIdInput.disabled = (settings.docMode === 'new');
            // Gemini API Key
            geminiApiKeyInput.value = settings.geminiApiKey;
            
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
            docMode: newDocRadio.checked ? 'new' : 'append',
            docId: docIdInput.value,
            geminiApiKey: geminiApiKeyInput.value
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

    newDocRadio.addEventListener('change', () => docIdInput.disabled = true);
    appendDocRadio.addEventListener('change', () => docIdInput.disabled = false);

    recordBtn.addEventListener('click', () => {
        if (isRecording) {
            stopRecording();
        }
        else {
            // Show document selection modal before starting recording
            docSelectionModal.style.display = 'block';
            // Initialize popup radio buttons based on saved settings
            const settings = loadSettings(false);
            if (settings.docMode === 'new') {
                newDocRadioPopup.checked = true;
                docIdInputPopup.disabled = true;
            } else {
                appendDocRadioPopup.checked = true;
                docIdInputPopup.disabled = false;
                docIdInputPopup.value = settings.docId; // Pre-fill with saved docId
            }
        }
    });

    // Document Selection Modal Event Listeners
    closeDocSelectionModalBtn.addEventListener('click', () => docSelectionModal.style.display = 'none');
    newDocRadioPopup.addEventListener('change', () => docIdInputPopup.disabled = true);
    appendDocRadioPopup.addEventListener('change', () => docIdInputPopup.disabled = false);
    startRecordingFromPopupBtn.addEventListener('click', () => {
        const docMode = newDocRadioPopup.checked ? 'new' : 'append';
        const docId = docIdInputPopup.value;
        docSelectionModal.style.display = 'none';
        startRecording(docMode, docId);
    });

    // --- Post-recording Actions ---
    summarizeBtn.addEventListener('click', async () => {
        statusMessage.textContent = '요약을 생성합니다...';
        await generateSummary(); // No need to pass finalTranscript, it's already in currentDocId
        postRecordingActions.style.display = 'none'; // Hide buttons after action
    });

    saveToGoogleDocsBtn.addEventListener('click', async () => {
        statusMessage.textContent = 'Google 문서에 저장되었습니다.'; // Transcription is already sent via WebSocket
        postRecordingActions.style.display = 'none';
    });

    discardBtn.addEventListener('click', () => {
        finalTranscript = '';
        interimTranscriptEl.textContent = '';
        finalTranscriptEl.textContent = '';
        summaryOutputEl.innerHTML = '';
        statusMessage.textContent = '버튼을 눌러 녹음을 시작하세요';
        postRecordingActions.style.display = 'none';
    });

    // --- Initial Load ---
    loadSettings();
    checkAuthStatus();
});