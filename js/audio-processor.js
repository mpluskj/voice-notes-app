class AudioProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this._bufferSize = 2048;
        this._buffer = new Int16Array(this._bufferSize);
        this._bufferIndex = 0;
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];
        if (input.length > 0) {
            const inputChannel = input[0];
            for (let i = 0; i < inputChannel.length; i++) {
                // Float32 to Int16 conversion
                const s = Math.max(-1, Math.min(1, inputChannel[i]));
                this._buffer[this._bufferIndex++] = s < 0 ? s * 0x8000 : s * 0x7FFF;

                if (this._bufferIndex === this._bufferSize) {
                    this.port.postMessage(this._buffer.buffer, [this._buffer.buffer]);
                    this._buffer = new Int16Array(this._bufferSize);
                    this._bufferIndex = 0;
                }
            }
        }
        return true; // Keep the processor alive
    }
}

registerProcessor('audio-processor', AudioProcessor);
