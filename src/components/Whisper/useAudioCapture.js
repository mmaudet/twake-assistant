import { useState, useRef, useCallback } from 'react'

/**
 * React hook for capturing audio from microphone using AudioWorklet
 * Captures at 16kHz Float32 PCM format required by Whisper
 *
 * @returns {Object} Audio capture controls and state
 */
export const useAudioCapture = () => {
  const [isRecording, setIsRecording] = useState(false)
  const [error, setError] = useState(null)

  // Refs to persist across renders
  const audioContextRef = useRef(null)
  const sourceNodeRef = useRef(null)
  const workletNodeRef = useRef(null)
  const streamRef = useRef(null)
  const audioChunksRef = useRef([])

  /**
   * Convert Float32Array to base64 string
   * @param {Float32Array} float32Array - Audio data
   * @returns {string} Base64 encoded audio
   */
  const float32ToBase64 = float32Array => {
    // Create a buffer from Float32Array
    const buffer = float32Array.buffer
    // Convert to binary string
    const binary = String.fromCharCode(...new Uint8Array(buffer))
    // Encode to base64
    return btoa(binary)
  }

  /**
   * Start audio capture
   * @param {Function} onAudioChunk - Callback for each audio chunk (receives base64 string)
   */
  const startRecording = useCallback(async onAudioChunk => {
    try {
      setError(null)

      // Check if getUserMedia is available (requires HTTPS or localhost)
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error(
          'Accès au microphone non disponible. Pour des raisons de sécurité, votre navigateur exige HTTPS ou localhost. ' +
          'Utilisez http://localhost:8888 ou configurez HTTPS pour accéder au microphone.'
        )
      }

      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1, // Mono
          sampleRate: 16000, // 16kHz for Whisper
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      })

      streamRef.current = stream

      // Debug: Check stream status
      const tracks = stream.getAudioTracks()
      // eslint-disable-next-line no-console
      console.log('[useAudioCapture] MediaStream created:', {
        active: stream.active,
        tracks: tracks.length,
        trackStates: tracks.map(t => ({
          id: t.id,
          enabled: t.enabled,
          muted: t.muted,
          readyState: t.readyState,
          label: t.label
        }))
      })

      // Create AudioContext at 16kHz
      const audioContext = new AudioContext({ sampleRate: 16000 })
      audioContextRef.current = audioContext

      // eslint-disable-next-line no-console
      console.log('[useAudioCapture] AudioContext created:', {
        state: audioContext.state,
        sampleRate: audioContext.sampleRate
      })

      // Create source from microphone stream
      const source = audioContext.createMediaStreamSource(stream)
      sourceNodeRef.current = source

      // eslint-disable-next-line no-console
      console.log('[useAudioCapture] MediaStreamSource created')

      // Create AudioWorklet processor code as blob
      const processorCode = `
class WhisperAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.buffer = []
    this.chunkSize = 1600
    this.sampleCount = 0
    this.debugInterval = 50 // Debug every 50 calls
    this.port.onmessage = event => {
      if (event.data.command === 'clear') {
        this.buffer = []
      }
    }
  }

  process(inputs) {
    const input = inputs[0]
    if (!input || !input.length) {
      if (this.sampleCount % this.debugInterval === 0) {
        console.log('[AudioWorklet] No input or empty input array')
      }
      return true
    }

    const inputChannel = input[0]
    if (!inputChannel) {
      if (this.sampleCount % this.debugInterval === 0) {
        console.log('[AudioWorklet] No input channel')
      }
      return true
    }

    // Debug: Check audio levels
    this.sampleCount++
    if (this.sampleCount % this.debugInterval === 0) {
      const hasNonZero = inputChannel.some(sample => Math.abs(sample) > 0.001)
      const maxAmplitude = Math.max(...inputChannel.map(Math.abs))
      console.log('[AudioWorklet] Frame', this.sampleCount,
                  'Length:', inputChannel.length,
                  'Max amplitude:', maxAmplitude.toFixed(4),
                  'Has audio:', hasNonZero,
                  'Sample values:', Array.from(inputChannel.slice(0, 5)).map(v => v.toFixed(4)))
    }

    for (let i = 0; i < inputChannel.length; i++) {
      this.buffer.push(inputChannel[i])
    }

    if (this.buffer.length >= this.chunkSize) {
      const audioChunk = new Float32Array(this.buffer.splice(0, this.chunkSize))
      const hasNonZero = audioChunk.some(sample => Math.abs(sample) > 0.001)
      console.log('[AudioWorklet] Sending chunk, size:', audioChunk.length,
                  'Has audio:', hasNonZero,
                  'First 5 values:', Array.from(audioChunk.slice(0, 5)).map(v => v.toFixed(4)))
      this.port.postMessage({ type: 'audio', data: audioChunk })
    }

    return true
  }
}

registerProcessor('whisper-audio-processor', WhisperAudioProcessor)
      `

      const blob = new Blob([processorCode], { type: 'application/javascript' })
      const processorUrl = URL.createObjectURL(blob)

      // Load AudioWorklet module from blob
      await audioContext.audioWorklet.addModule(processorUrl)

      // Clean up blob URL
      URL.revokeObjectURL(processorUrl)

      // Create AudioWorklet node
      const workletNode = new AudioWorkletNode(
        audioContext,
        'whisper-audio-processor'
      )
      workletNodeRef.current = workletNode

      // Handle audio chunks from worklet
      workletNode.port.onmessage = event => {
        if (event.data.type === 'audio') {
          const audioData = event.data.data // Float32Array

          // Debug: Check received audio data
          const hasNonZero = audioData.some(sample => Math.abs(sample) > 0.001)
          const maxAmplitude = Math.max(...audioData.map(Math.abs))
          // eslint-disable-next-line no-console
          console.log(
            '[useAudioCapture] Received chunk from worklet:',
            'Size:',
            audioData.length,
            'Max amplitude:',
            maxAmplitude.toFixed(4),
            'Has audio:',
            hasNonZero,
            'First 5 values:',
            Array.from(audioData.slice(0, 5)).map(v => v.toFixed(4))
          )

          // Store chunk
          audioChunksRef.current.push(audioData)

          // Convert to base64 and call callback
          if (onAudioChunk) {
            const base64Audio = float32ToBase64(audioData)
            // eslint-disable-next-line no-console
            console.log(
              '[useAudioCapture] Sending base64 audio, length:',
              base64Audio.length
            )
            onAudioChunk(base64Audio)
          }
        }
      }

      // Connect: source -> worklet -> destination
      source.connect(workletNode)
      workletNode.connect(audioContext.destination)

      setIsRecording(true)
    } catch (err) {
      setError(err.message)
    }
  }, [])

  /**
   * Stop audio capture and cleanup resources
   */
  const stopRecording = useCallback(() => {
    try {
      // Disconnect worklet
      if (workletNodeRef.current) {
        workletNodeRef.current.disconnect()
        workletNodeRef.current = null
      }

      // Disconnect source
      if (sourceNodeRef.current) {
        sourceNodeRef.current.disconnect()
        sourceNodeRef.current = null
      }

      // Stop microphone stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
        streamRef.current = null
      }

      // Close audio context
      if (audioContextRef.current) {
        audioContextRef.current.close()
        audioContextRef.current = null
      }

      setIsRecording(false)
    } catch (err) {
      setError(err.message)
    }
  }, [])

  /**
   * Clear accumulated audio chunks
   */
  const clearChunks = useCallback(() => {
    audioChunksRef.current = []

    // Also clear worklet buffer
    if (workletNodeRef.current) {
      workletNodeRef.current.port.postMessage({ command: 'clear' })
    }
  }, [])

  /**
   * Get all accumulated audio chunks
   * @returns {Float32Array[]} Array of audio chunks
   */
  const getChunks = useCallback(() => {
    return audioChunksRef.current
  }, [])

  return {
    isRecording,
    error,
    startRecording,
    stopRecording,
    clearChunks,
    getChunks
  }
}

export default useAudioCapture
