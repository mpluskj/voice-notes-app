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

    // Post-recording Action Buttons
    const postRecordingActions = document.getElementById('post-recording-actions');
    const summarizeBtn = document.getElementById('summarize-btn');
    const saveToFileBtn = document.getElementById('save-to-file-btn');
    const discardBtn = document.getElementById('discard-btn');

    const fileInput = document.getElementById('file-input');
    const loadFileBtn = document.getElementById('load-file-btn');
    const exportFormatSelect = document.getElementById('export-format-select');


    // --- State ---
    let isRecording = false;
    let recognition = null;

    // --- Local Storage Management ---
    function loadTranscript() {
        const savedTranscript = localStorage.getItem('finalTranscript');
        if (savedTranscript) {
            finalTranscriptEl.textContent = savedTranscript;
            postRecordingActions.style.display = 'flex'; // Show actions if there's saved content
        }
    }

    function saveTranscript() {
        localStorage.setItem('finalTranscript', finalTranscriptEl.textContent);
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
        saveTranscript(); // Save current (empty) state

        recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
        recognition.lang = settings.language;
        recognition.interimResults = true;
        recognition.continuous = true;

        recognition.onresult = (event) => {
            let interimTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscriptEl.textContent += event.results[i][0].transcript + '\n'; // Add newline for final transcript
                    saveTranscript(); // Save after each final transcript update
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

        updateRecordButton();

        if (unexpected) {
            statusMessage.textContent = '음성 인식이 중단되었습니다.';
            return;
        }

        if (finalTranscriptEl.textContent.trim().length > 0) {
            statusMessage.textContent = '녹음 완료.';
            postRecordingActions.style.display = 'flex';
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
            const prompt = `다음 텍스트를 요약해줘. 요약 형식: ${settings.summaryFormat}\n\n${finalTranscript}`;
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

        const transcriptContent = finalTranscriptEl.textContent;
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
        pre { background-color: #f4f4f4; padding: 10px; border-radius: 5px; overflow-x: auto; }
    </style>
</head>
<body>
    <h1>${title}</h1>
    <h2>녹음 내용</h2>
    <pre>${transcriptContent}</pre>
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
        } else {
            startRecording();
        }
    });

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
        interimTranscriptEl.textContent = '';
        finalTranscriptEl.textContent = '';
        summaryOutputEl.innerHTML = '';
        statusMessage.textContent = '버튼을 눌러 녹음을 시작하세요';
        postRecordingActions.style.display = 'none';
        saveTranscript(); // Clear saved transcript
    });

    loadFileBtn.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) {
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            finalTranscript = e.target.result;
            finalTranscriptEl.textContent = finalTranscript;
            interimTranscriptEl.textContent = '';
            summaryOutputEl.innerHTML = '';
            statusMessage.textContent = '파일이 불러와졌습니다. 요약 버튼을 누르세요.';
            postRecordingActions.style.display = 'flex';
            saveTranscript(); // Save loaded transcript
        };
        reader.readAsText(file);
    });

    // --- Initial Load ---
    loadSettings();
    loadTranscript(); // Load saved transcript
    // Remove auth check
    recordBtn.disabled = false;
    statusMessage.textContent = '버튼을 눌러 녹음을 시작하세요';
});