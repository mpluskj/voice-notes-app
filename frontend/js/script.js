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
    const geminiApiKeyInput = document.getElementById('gemini-api-key');

    // --- State ---
    let isLoggedIn = false;
    let isRecording = false;
    let socket;
    let audioContext;
    let audioStream;
    let processorNode;
    let currentDocId = null;

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
    async function startRecording() {
        if (isRecording || !isLoggedIn) return;

        isRecording = true;
        currentDocId = null;
        updateRecordButton();
        statusMessage.textContent = '연결 중...';
        interimTranscriptEl.textContent = '';
        finalTranscriptEl.textContent = '';
        summaryOutputEl.innerHTML = '';

        socket = new WebSocket(`ws://${window.location.host}/ws/transcribe`);

        socket.onopen = async () => {
            statusMessage.textContent = '마이크 접근 중...';
            try {
                const settings = loadSettings(false);
                const docTitle = settings.docTitleFormat
                    .replace('YYYY', new Date().getFullYear())
                    .replace('MM', String(new Date().getMonth() + 1).padStart(2, '0'))
                    .replace('DD', String(new Date().getDate()).padStart(2, '0'));

                socket.send(JSON.stringify({
                    language: settings.language,
                    docTitle: docTitle
                }));

                audioStream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, sampleRate: 16000 } });
                audioContext = new AudioContext({ sampleRate: 16000 });
                await audioContext.audioWorklet.addModule('/js/audio-processor.js');
                
                const source = audioContext.createMediaStreamSource(audioStream);
                processorNode = new AudioWorkletNode(audioContext, 'audio-processor');
                processorNode.port.onmessage = (event) => {
                    if (socket && socket.readyState === WebSocket.OPEN) {
                        socket.send(event.data);
                    }
                };
                source.connect(processorNode).connect(audioContext.destination);
                statusMessage.textContent = '녹음 중... 말하기 시작하세요.';
            } catch (error) {
                console.error('Error starting recording:', error);
                statusMessage.textContent = `오류: ${error.message}`;
                stopRecording(); // Removed await
            }
        };

        socket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'transcript') {
                if (data.is_final) {
                    finalTranscriptEl.textContent += data.text + ' ';
                    interimTranscriptEl.textContent = '';
                } else {
                    interimTranscriptEl.textContent = data.text;
                }
            } else if (data.type === 'doc_created') {
                currentDocId = data.doc_id;
                console.log(`Document created: ${currentDocId}`);
            }
        };

        socket.onerror = (error) => {
            console.error('WebSocket Error:', error);
            statusMessage.textContent = '연결 오류가 발생했습니다.';
            stopRecording(); // Removed await
        };

        socket.onclose = (event) => {
            console.log('WebSocket closed:', event.reason);
            if (isRecording) { // Unexpected close
                stopRecording(true); // Pass flag to indicate it was unexpected
            }
        };
    }

    async function stopRecording(unexpected = false) {
        if (!isRecording) return;
        isRecording = false;

        if (socket) {
            if (socket.readyState === WebSocket.OPEN) socket.close();
            socket = null;
        }
        if (audioStream) {
            audioStream.getTracks().forEach(track => track.stop());
            audioStream = null;
        }
        if (audioContext) {
            if (audioContext.state !== 'closed') await audioContext.close();
            audioContext = null;
        }

        updateRecordButton();

        if (unexpected) {
            statusMessage.textContent = '연결이 끊어졌습니다.';
            return;
        }

        if (currentDocId) {
            statusMessage.textContent = '녹음 완료. 요약을 생성합니다...';
            await generateSummary();
        } else {
            statusMessage.textContent = '녹음이 중지되었습니다.';
        }
    }

    async function generateSummary() {
        if (!currentDocId) return;
        
        try {
            const settings = loadSettings(false);
            const response = await fetch('/summarize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    doc_id: currentDocId,
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

    recordBtn.addEventListener('click', () => {
        if (isRecording) {
            stopRecording();
        }
        else {
            startRecording();
        }
    });

    // --- Initial Load ---
    loadSettings();
    checkAuthStatus();
});