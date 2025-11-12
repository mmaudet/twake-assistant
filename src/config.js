/**
 * Application Configuration
 */

// Backend API URL for Whisper transcription
// Change this URL to point to your Whisper backend server
export const WHISPER_BACKEND_URL =
  process.env.WHISPER_BACKEND_URL || 'http://51.210.167.184:8000'
