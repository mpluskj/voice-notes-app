
// /js/audio.js
import { MicVAD } from 'https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.24/dist/web.mjs';

let vad = null;
let recognition = null;
let audioContext = null;
let analyser = null;
let visualizerCanvasCtx = null;
let audioStream = null;

export function initAudio(settings, onSpeechStart, onSpeechEnd, onResult, onError) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        return null;
    }

    recognition = new SpeechRecognition();
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.lang = settings.language;

    recognition.onresult = onResult;
    recognition.onerror = onError;
    recognition.onend = () => {
        // The VAD will handle restarting.
    };

    return recognition;
}

export async function startVAD(settings, visualizer, statusMessage, callbacks) {
    try {
        vad = await MicVAD.new({
            ...callbacks,
            modelURL: 'https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.24/dist/silero_vad.onnx',
            positiveSpeechThreshold: 0.6,
        });
        vad.start();

        // Setup visualizer
        visualizer.style.display = 'block';
        visualizerCanvasCtx = visualizer.getContext('2d');
        audioStream = vad.audioStream;
        audioContext = vad.audioContext;
        analyser = audioContext.createAnalyser();
        const source = audioContext.createMediaStreamSource(audioStream);
        source.connect(analyser);
        drawVisualizer(visualizer);

        return vad;
    } catch (error) {
        console.error('Error starting VAD:', error);
        statusMessage.textContent = `Error: Failed to start VAD - ${error.message}`;
        throw error; // Re-throw to be caught by the caller
    }
}

export function stopVAD() {
    if (vad) {
        vad.destroy();
        vad = null;
    }
    if (recognition && recognition.recognizing) {
        recognition.stop();
    }
    if (audioStream) {
        audioStream.getTracks().forEach(track => track.stop());
        audioStream = null;
    }
    if (audioContext) {
        audioContext.close();
        audioContext = null;
    }
}

function drawVisualizer(visualizer) {
    if (!vad) return; // Stop if VAD is not running

    requestAnimationFrame(() => drawVisualizer(visualizer));

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteTimeDomainData(dataArray);

    visualizerCanvasCtx.fillStyle = 'rgb(200, 200, 200)';
    visualizerCanvasCtx.fillRect(0, 0, visualizer.width, visualizer.height);

    visualizerCanvasCtx.lineWidth = 2;
    visualizerCanvasCtx.strokeStyle = 'rgb(0, 0, 0)';

    visualizerCanvasCtx.beginPath();

    const sliceWidth = visualizer.width * 1.0 / bufferLength;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = v * visualizer.height / 2;

        if (i === 0) {
            visualizerCanvasCtx.moveTo(x, y);
        } else {
            visualizerCanvasCtx.lineTo(x, y);
        }

        x += sliceWidth;
    }

    visualizerCanvasCtx.lineTo(visualizer.width, visualizer.height / 2);
    visualizerCanvasCtx.stroke();
}
