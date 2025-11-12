import React, { useState, useCallback, useEffect, useRef } from 'react'
import Typography from 'cozy-ui/transpiled/react/Typography'
import Card from 'cozy-ui/transpiled/react/Card'
import Box from 'cozy-ui/transpiled/react/Box'
import Button from 'cozy-ui/transpiled/react/Buttons'
import Alert from 'cozy-ui/transpiled/react/Alert'
import Spinner from 'cozy-ui/transpiled/react/Spinner'
import { useClient } from 'cozy-client'
import { TRANSCRIPTIONS_DOCTYPE } from 'src/doctypes'
import { useAudioCapture } from './useAudioCapture'
import TranscriptionHistory from './TranscriptionHistory'
import { WHISPER_BACKEND_URL } from 'src/config'

// Backend API URL
const BACKEND_URL = WHISPER_BACKEND_URL

/**
 * Whisper Transcription Component
 * Real-time speech-to-text using TheWhisper-api backend
 */
const WhisperTranscription = () => {
  // Cozy client for persistence
  const client = useClient()

  // Audio capture hook
  const {
    isRecording,
    error: audioError,
    startRecording,
    stopRecording,
    clearChunks
  } = useAudioCapture()

  // Component state
  const [sessionId, setSessionId] = useState(null)
  const [committedSegments, setCommittedSegments] = useState([])
  const [uncommittedSegments, setUncommittedSegments] = useState([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState(null)
  const [language, setLanguage] = useState('fr') // Français par défaut
  const [copied, setCopied] = useState(false) // Feedback pour copie
  const [shouldSave, setShouldSave] = useState(false) // Flag pour sauvegarder après arrêt

  // Ref pour stocker l'ID de l'intervalle afin de pouvoir l'arrêter manuellement
  const intervalRef = useRef(null)

  // Language options
  const languageOptions = [
    { value: 'fr', label: 'Français' },
    { value: 'en', label: 'English' }
  ]

  /**
   * Create transcription session
   */
  const createSession = useCallback(async () => {
    try {
      setError(null)
      const response = await fetch(`${BACKEND_URL}/session/create/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language })
      })

      if (!response.ok) {
        throw new Error('Failed to create session')
      }

      const data = await response.json()
      setSessionId(data.session_id)
      return data.session_id
    } catch (err) {
      setError(err.message)
      return null
    }
  }, [language])

  /**
   * Process session and get transcription
   */
  const processSession = useCallback(async () => {
    if (!sessionId) return

    try {
      setIsProcessing(true)
      const response = await fetch(
        `${BACKEND_URL}/session/${sessionId}/process`,
        {
          method: 'POST'
        }
      )

      if (!response.ok) {
        throw new Error('Failed to process session')
      }

      const data = await response.json()

      // Update committed segments (finalized transcription)
      if (data.committed && data.committed.length > 0) {
        setCommittedSegments(data.committed)
      }

      // Update uncommitted segments (provisional transcription)
      if (data.uncommitted) {
        setUncommittedSegments(data.uncommitted)
      } else {
        setUncommittedSegments([])
      }

      setIsProcessing(false)
    } catch (err) {
      setError(err.message)
      setIsProcessing(false)
    }
  }, [sessionId])

  /**
   * End session
   */
  const endSession = useCallback(async () => {
    if (!sessionId) return

    try {
      // Process one last time
      await processSession()

      // End session
      await fetch(`${BACKEND_URL}/session/${sessionId}/end`, {
        method: 'POST'
      })

      setSessionId(null)
    } catch (err) {
      setError(err.message)
    }
  }, [sessionId, processSession])

  /**
   * Start recording handler
   */
  const handleStartRecording = useCallback(async () => {
    try {
      setError(null)
      setCommittedSegments([])
      setUncommittedSegments([])
      setShouldSave(false)
      clearChunks()

      // Clear any existing interval
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }

      // Create session
      const newSessionId = await createSession()
      if (!newSessionId) return

      // Create inline callback with fresh sessionId to avoid closure issues
      const sendChunk = async audioBase64 => {
        // eslint-disable-next-line no-console
        console.log(
          '[sendChunk] Called with sessionId:',
          newSessionId,
          'audio length:',
          audioBase64?.length
        )

        try {
          // eslint-disable-next-line no-console
          console.log(
            '[sendChunk] Sending to:',
            `${BACKEND_URL}/session/${newSessionId}/add_chunk`
          )

          const response = await fetch(
            `${BACKEND_URL}/session/${newSessionId}/add_chunk`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ audio_base64: audioBase64 })
            }
          )

          // eslint-disable-next-line no-console
          console.log('[sendChunk] Response status:', response.status)

          if (!response.ok) {
            throw new Error('Failed to send audio chunk')
          }
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('[sendChunk] Error:', err)
          setError(err.message)
        }
      }

      // Start audio capture with inline callback
      await startRecording(sendChunk)
    } catch (err) {
      setError(err.message)
    }
  }, [createSession, startRecording, clearChunks])

  /**
   * Stop recording handler
   */
  const handleStopRecording = useCallback(async () => {
    try {
      // Stop the interval immediately
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }

      // Stop audio capture
      stopRecording()

      // Mark that we should save after processing is complete
      setShouldSave(true)

      // End session and get final transcription
      await endSession()
    } catch (err) {
      setError(err.message)
    }
  }, [stopRecording, endSession])

  /**
   * Get full transcription text (committed only)
   */
  const getTranscriptionText = useCallback(() => {
    return committedSegments.map(s => s.text).join(' ')
  }, [committedSegments])

  /**
   * Copy transcription to clipboard
   */
  const handleCopyTranscription = useCallback(async () => {
    const text = getTranscriptionText()
    if (!text) return

    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000) // Reset after 2s
    } catch (err) {
      setError('Impossible de copier le texte')
    }
  }, [getTranscriptionText])

  /**
   * Download transcription as .txt file
   */
  const handleDownloadTranscription = useCallback(() => {
    const text = getTranscriptionText()
    if (!text) return

    // Create blob and download
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `transcription-${new Date().toISOString().slice(0, 10)}.txt`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }, [getTranscriptionText])

  // Auto-process frequently during recording for real-time display
  useEffect(() => {
    if (!isRecording || !sessionId) return

    intervalRef.current = setInterval(() => {
      processSession()
    }, 1000) // 1 second (like Electron app)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [isRecording, sessionId, processSession])

  // Save transcription after recording is stopped and session is ended
  useEffect(() => {
    if (!shouldSave || sessionId) return

    const saveTranscription = async () => {
      const text = committedSegments.map(s => s.text).join(' ')
      if (text && text.trim()) {
        try {
          await client.save({
            _type: TRANSCRIPTIONS_DOCTYPE,
            text: text,
            language: language,
            createdAt: new Date().toISOString(),
            wordCount: committedSegments.length
          })
        } catch (err) {
          setError('Erreur lors de la sauvegarde: ' + err.message)
        }
      }
      // Reset flag
      setShouldSave(false)
    }

    saveTranscription()
  }, [shouldSave, sessionId, committedSegments, client, language])

  return (
    <Box p={3}>
      <Card>
        <Box p={4}>
          {/* Header with language selector */}
          <Box
            className="u-flex u-flex-items-center u-flex-justify-between"
            style={{ marginBottom: '8px' }}
          >
            <Typography variant="h3">Transcription en temps réel</Typography>
            <Box className="u-flex u-flex-items-center">
              <Typography
                variant="body2"
                style={{ marginRight: '8px', whiteSpace: 'nowrap' }}
              >
                Langue :
              </Typography>
              <select
                value={language}
                onChange={e => setLanguage(e.target.value)}
                disabled={isRecording}
                style={{
                  padding: '6px 10px',
                  fontSize: '14px',
                  borderRadius: '4px',
                  border: '1px solid #ccc',
                  cursor: isRecording ? 'not-allowed' : 'pointer',
                  opacity: isRecording ? 0.6 : 1
                }}
              >
                {languageOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Box>
          </Box>
          <Typography variant="body1" color="textSecondary" paragraph>
            Utilisez votre microphone pour transcrire votre voix en texte
          </Typography>

          {/* Error display */}
          {(error || audioError) && (
            <Alert severity="error" className="u-mb-1">
              {error || audioError}
            </Alert>
          )}

          {/* Controls */}
          <Box className="u-flex u-flex-justify-center u-mv-2">
            {!isRecording ? (
              <Button
                label="🎤 Lancer la transcription"
                onClick={handleStartRecording}
                size="large"
                theme="primary"
              />
            ) : (
              <Button
                label="⏹️ Arrêter l'enregistrement"
                onClick={handleStopRecording}
                size="large"
                theme="danger"
              />
            )}
          </Box>

          {/* Recording indicator */}
          {isRecording && (
            <Box className="u-flex u-flex-justify-center u-flex-items-center u-mb-1">
              <Box
                className="u-mr-half"
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  backgroundColor: '#ff0000',
                  animation: 'pulse 1.5s ease-in-out infinite'
                }}
              />
              <Typography variant="body2" color="error">
                Enregistrement en cours...
              </Typography>
            </Box>
          )}

          {/* Status area - fixed height to prevent jumping */}
          <Box
            className="u-flex u-flex-justify-center u-flex-items-center u-mb-1"
            style={{ minHeight: '24px' }}
          >
            {isRecording && isProcessing && (
              <>
                <Spinner size="small" className="u-mr-half" />
                <Typography variant="body2">Traitement en cours...</Typography>
              </>
            )}
          </Box>

          {/* Transcription results */}
          {(committedSegments.length > 0 || uncommittedSegments.length > 0) && (
            <Box className="u-mt-2">
              {/* Header with export buttons */}
              <Box
                className="u-flex u-flex-items-center u-flex-justify-between"
                style={{ marginBottom: '12px' }}
              >
                <Typography variant="h5">Transcription</Typography>
                {committedSegments.length > 0 && (
                  <Box className="u-flex" style={{ gap: '8px' }}>
                    <Button
                      label={copied ? 'Copié !' : 'Copier'}
                      onClick={handleCopyTranscription}
                      size="small"
                      theme={copied ? 'success' : 'secondary'}
                      disabled={copied}
                    />
                    <Button
                      label="Télécharger"
                      onClick={handleDownloadTranscription}
                      size="small"
                      theme="secondary"
                    />
                  </Box>
                )}
              </Box>
              <Card
                className="u-p-1"
                style={{
                  backgroundColor: '#f5f5f5',
                  maxHeight: '400px',
                  overflowY: 'auto',
                  padding: '16px',
                  fontSize: '16px',
                  lineHeight: '1.6'
                }}
              >
                <Typography variant="body1" component="div">
                  {/* Committed text in black */}
                  <span style={{ color: '#000000' }}>
                    {committedSegments.map(s => s.text).join(' ')}
                  </span>
                  {/* Space between committed and uncommitted */}
                  {committedSegments.length > 0 &&
                    uncommittedSegments.length > 0 &&
                    ' '}
                  {/* Uncommitted text in gray */}
                  <span style={{ color: '#999999' }}>
                    {uncommittedSegments.map(s => s.text).join(' ')}
                  </span>
                </Typography>
              </Card>
            </Box>
          )}

          {/* No transcription message */}
          {!isRecording &&
            committedSegments.length === 0 &&
            uncommittedSegments.length === 0 && (
              <Box className="u-ta-center u-mt-2">
                <Typography variant="body2" color="textSecondary">
                  Cliquez sur &quot;Lancer la transcription&quot; pour commencer
                </Typography>
              </Box>
            )}
        </Box>
      </Card>

      {/* Transcription History */}
      <Box className="u-mt-2">
        <Typography variant="h3" gutterBottom>
          Historique
        </Typography>
        <TranscriptionHistory />
      </Box>

      {/* Inline styles for pulse animation */}
      <style>
        {`
          @keyframes pulse {
            0%, 100% {
              opacity: 1;
            }
            50% {
              opacity: 0.3;
            }
          }
        `}
      </style>
    </Box>
  )
}

export default WhisperTranscription
