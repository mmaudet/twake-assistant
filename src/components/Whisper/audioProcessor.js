/**
 * AudioWorklet Processor for real-time audio capture
 * Captures microphone audio at 16kHz (Whisper requirement)
 * Converts to Float32 PCM mono format
 * Sends chunks to main thread for backend transmission
 */

class WhisperAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super()

    // Buffer to accumulate audio samples before sending to main thread
    this.buffer = []
    // Send chunks every ~100ms (1600 samples at 16kHz)
    this.chunkSize = 1600

    // Listen for messages from main thread
    this.port.onmessage = event => {
      if (event.data.command === 'clear') {
        this.buffer = []
      }
    }
  }

  /**
   * Process audio in 128-sample frames
   * Called automatically by the browser for each audio frame
   *
   * @param {Float32Array[][]} inputs - Input audio channels
   * @param {Float32Array[][]} outputs - Output audio channels (unused)
   * @param {Object} parameters - Audio parameters (unused)
   * @returns {boolean} - true to keep processor alive
   */
  // eslint-disable-next-line no-unused-vars
  process(inputs, outputs, parameters) {
    const input = inputs[0]

    // Check if we have input audio
    if (!input || !input.length) {
      return true
    }

    // Get first channel (mono)
    const inputChannel = input[0]

    if (!inputChannel) {
      return true
    }

    // Accumulate samples in buffer
    for (let i = 0; i < inputChannel.length; i++) {
      this.buffer.push(inputChannel[i])
    }

    // When buffer reaches chunk size, send to main thread
    if (this.buffer.length >= this.chunkSize) {
      // Create Float32Array from buffer
      const audioChunk = new Float32Array(this.buffer.splice(0, this.chunkSize))

      // Send to main thread
      this.port.postMessage({
        type: 'audio',
        data: audioChunk
      })
    }

    // Keep processor alive
    return true
  }
}

// Register the processor
registerProcessor('whisper-audio-processor', WhisperAudioProcessor)
