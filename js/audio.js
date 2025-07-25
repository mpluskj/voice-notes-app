
import { MicVAD } from '@ricky0123/vad-web';
import * as ort from 'onnxruntime-web';

// /js/audio.js

/**
 * Initializes the SpeechRecognition object.
 * @param {object} settings - The application settings.
 * @param {function} onResult - Callback for recognition results.
 * @param {function} onError - Callback for recognition errors.
 * @returns {SpeechRecognition | null} The recognition object or null if not supported.
 */
export function initSpeechRecognition(settings, onResult, onError) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        console.error("Speech Recognition not supported.");
        return null;
    }

    const recognition = new SpeechRecognition();
    recognition.interimResults = true;
    recognition.continuous = true; // VAD will control the start and stop
    recognition.lang = settings.language;

    recognition.onresult = onResult;
    recognition.onerror = onError;
    // onend is handled by the VAD logic in app.js

    return recognition;
}

/**
 * Creates and starts a new VAD instance.
 * @param {object} settings - The application settings.
 * @param {HTMLElement} visualizerEl - The canvas element for visualization.
 * @param {object} callbacks - onSpeechStart, onSpeechEnd callbacks.
 * @returns {Promise<object>} A promise that resolves with the VAD instance and related components.
 */
export async function createVAD(stream, settings, callbacks) {
    // Configure onnxruntime-web for WASM paths
    ort.env.wasm.wasmPaths = 'dist/';

    const vad = await MicVAD.new({
        onSpeechStart: () => {}, // Override to prevent MicVAD from starting recognition
        ...callbacks,
        stream: stream,
        ort: ort, // Pass the ort instance to MicVAD
        positiveSpeechThreshold: 0.6, // Adjust as needed
        minSpeechFrames: 3,
        redemptionFrames: 5,
        // Add other VAD options from settings if needed
    });

    vad.start();

    return vad;
}

/**
 * Stops the VAD instance and cleans up resources.
 * @param {object} vad - The VAD instance.
 * @param {object} visualizerState - The state object for the visualizer.
 */
export function destroyVAD(vad, visualizerState) {
    if (vad) {
        vad.destroy();
    }
    if (visualizerState && visualizerState.animationFrameId) {
        cancelAnimationFrame(visualizerState.animationFrameId);
    }
}

/**
 * Draws the audio waveform on the canvas.
 * @param {object} visualizerState - The state object for the visualizer.
 */
function drawVisualizer(visualizerState) {
    const { analyser, visualizerCtx, visualizerEl } = visualizerState;

    visualizerState.animationFrameId = requestAnimationFrame(() => drawVisualizer(visualizerState));

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteTimeDomainData(dataArray);

    visualizerCtx.fillStyle = 'rgb(240, 242, 245)'; // Match background
    visualizerCtx.fillRect(0, 0, visualizerEl.width, visualizerEl.height);

    visualizerCtx.lineWidth = 2;
    visualizerCtx.strokeStyle = 'rgb(98, 0, 238)'; // Match primary color

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
