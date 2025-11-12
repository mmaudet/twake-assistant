"""
TheWhisper Backend Server for Twake Assistant
FastAPI server for real-time speech-to-text transcription
"""

import base64
import os
import signal
import sys
import uuid
from contextlib import asynccontextmanager
from typing import Dict, List, Optional

import numpy as np
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Whisper imports - using faster-whisper for CPU/GPU compatibility
try:
    from faster_whisper import WhisperModel
    import librosa
    PLATFORM_AVAILABLE = True
    print("✅ faster-whisper loaded successfully")
except ImportError as e:
    print(f"⚠️  faster-whisper not available: {e}")
    PLATFORM_AVAILABLE = False

platform = os.getenv("PLATFORM", "cpu").lower()


# ============================================================================
# Models
# ============================================================================

class SessionCreateRequest(BaseModel):
    language: str = "en"


class SessionResponse(BaseModel):
    session_id: str


class Word(BaseModel):
    text: str
    timestamp: Optional[List[float]] = None


class TranscriptionResponse(BaseModel):
    committed: List[Word]
    uncommitted: List[Word]


# ============================================================================
# Streaming Manager
# ============================================================================

class StreamingManager:
    """Manages concurrent transcription sessions using faster-whisper"""

    def __init__(self, model_name: str, chunk_length_s: int = 15):
        self.model_name = model_name
        self.chunk_length_s = chunk_length_s
        self.sample_rate = 16000  # Whisper requires 16kHz
        self.sessions: Dict[str, dict] = {}

        # Load Whisper model once
        if PLATFORM_AVAILABLE:
            print(f"Loading Whisper model: {model_name}...")
            # Use base, small, medium, or large-v3
            # For faster-whisper, we use model names like "base", "small", "medium", "large-v3"
            model_size = "base"  # Start with base for faster loading
            if "large" in model_name:
                model_size = "large-v3"
            elif "medium" in model_name:
                model_size = "medium"
            elif "small" in model_name:
                model_size = "small"

            self.model = WhisperModel(model_size, device="cpu", compute_type="int8")
            print(f"✅ Model {model_size} loaded successfully")
        else:
            self.model = None

    def create_session(self, language: str = "en") -> str:
        """Create a new transcription session"""
        session_id = base64.b64encode(uuid.uuid4().bytes).decode('utf-8').rstrip('=')

        if not PLATFORM_AVAILABLE:
            raise RuntimeError("Whisper platform not available")

        self.sessions[session_id] = {
            "language": language,
            "active": True,
            "audio_buffer": np.array([], dtype=np.float32),  # Accumulate audio here
            "transcribed_length": 0,  # Track how much we've transcribed
            "committed_text": [],  # Finalized transcription
            "last_transcription": ""  # Last uncommitted chunk
        }

        print(f"✅ Session created: {session_id} (language: {language})")
        return session_id

    def add_chunk(self, session_id: str, audio_base64: str):
        """Add audio chunk to session buffer"""
        if session_id not in self.sessions:
            raise ValueError(f"Session {session_id} not found")

        # Decode base64 audio
        audio_bytes = base64.b64decode(audio_base64)
        audio_array = np.frombuffer(audio_bytes, dtype=np.float32)

        # Append to buffer
        session = self.sessions[session_id]
        session["audio_buffer"] = np.concatenate([session["audio_buffer"], audio_array])

    def process(self, session_id: str) -> TranscriptionResponse:
        """Get current transcription results"""
        if session_id not in self.sessions:
            raise ValueError(f"Session {session_id} not found")

        session = self.sessions[session_id]
        audio_buffer = session["audio_buffer"]
        language = session["language"]

        # Calculate buffer length in seconds
        buffer_length_s = len(audio_buffer) / self.sample_rate

        committed = []
        uncommitted = []

        # If we have enough audio, transcribe
        if buffer_length_s >= self.chunk_length_s:
            # Transcribe the entire buffer
            try:
                segments, info = self.model.transcribe(
                    audio_buffer,
                    language=language,
                    beam_size=1,  # Faster
                    best_of=1,
                    temperature=0.0,
                    word_timestamps=True
                )

                # Collect all segments
                all_text = []
                for segment in segments:
                    text = segment.text.strip()
                    if text:
                        all_text.append(text)

                        # Create words from segment
                        if hasattr(segment, 'words') and segment.words:
                            for word_info in segment.words:
                                committed.append(Word(
                                    text=word_info.word.strip(),
                                    timestamp=[word_info.start, word_info.end]
                                ))
                        else:
                            # No word timestamps, just add the whole segment
                            committed.append(Word(
                                text=text,
                                timestamp=[segment.start, segment.end]
                            ))

                # Update session
                session["committed_text"].extend(all_text)
                session["last_transcription"] = " ".join(all_text)

                # Clear buffer after transcription
                session["audio_buffer"] = np.array([], dtype=np.float32)

            except Exception as e:
                print(f"⚠️ Transcription error: {e}")

        else:
            # Not enough audio yet - return previous results
            for text in session["committed_text"]:
                committed.append(Word(text=text, timestamp=None))

        return TranscriptionResponse(committed=committed, uncommitted=uncommitted)

    def end_session(self, session_id: str):
        """End and cleanup session"""
        if session_id in self.sessions:
            # Final transcription of any remaining audio
            session = self.sessions[session_id]
            if len(session["audio_buffer"]) > 0:
                try:
                    segments, _ = self.model.transcribe(
                        session["audio_buffer"],
                        language=session["language"],
                        beam_size=1
                    )
                    for segment in segments:
                        if segment.text.strip():
                            session["committed_text"].append(segment.text.strip())
                except Exception as e:
                    print(f"⚠️ Final transcription error: {e}")

            del self.sessions[session_id]
            print(f"✅ Session ended: {session_id}")

    def clear_session(self, session_id: str):
        """Clear session buffers"""
        if session_id not in self.sessions:
            raise ValueError(f"Session {session_id} not found")

        session = self.sessions[session_id]
        session["audio_buffer"] = np.array([], dtype=np.float32)
        session["committed_text"] = []
        session["last_transcription"] = ""


# ============================================================================
# FastAPI Application
# ============================================================================

# Global manager instance
manager: Optional[StreamingManager] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    global manager

    # Startup
    print("🚀 Starting TheWhisper Backend...")
    model_name = os.getenv("MODEL_NAME", "TheStageAI/thewhisper-large-v3-turbo")
    chunk_length = int(os.getenv("CHUNK_LENGTH_S", "15"))

    if PLATFORM_AVAILABLE:
        manager = StreamingManager(model_name=model_name, chunk_length_s=chunk_length)
        print(f"✅ Model loaded: {model_name}")
        print(f"✅ Chunk length: {chunk_length}s")
    else:
        print("⚠️  Running in mock mode - transcription not available")

    yield

    # Shutdown
    print("🛑 Shutting down TheWhisper Backend...")
    if manager:
        # End all active sessions
        for session_id in list(manager.sessions.keys()):
            manager.end_session(session_id)


# Create FastAPI app
app = FastAPI(
    title="TheWhisper Backend",
    description="Real-time speech-to-text transcription server for Twake Assistant",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict to your Cozy domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================================
# API Endpoints
# ============================================================================

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "TheWhisper Backend for Twake Assistant",
        "status": "running",
        "platform": platform,
        "available": PLATFORM_AVAILABLE
    }


@app.get("/health")
async def health():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "platform": platform,
        "available": PLATFORM_AVAILABLE,
        "active_sessions": len(manager.sessions) if manager else 0
    }


@app.post("/session/create/", response_model=SessionResponse)
async def create_session(request: SessionCreateRequest):
    """Create a new transcription session"""
    if not manager:
        raise HTTPException(status_code=503, detail="Service not available")

    try:
        session_id = manager.create_session(language=request.language)
        return SessionResponse(session_id=session_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/session/{session_id}/add_chunk")
async def add_chunk(session_id: str, base64: str = Query(...)):
    """Add audio chunk to session"""
    if not manager:
        raise HTTPException(status_code=503, detail="Service not available")

    try:
        manager.add_chunk(session_id, base64)
        return {"status": "success"}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/session/{session_id}/process", response_model=TranscriptionResponse)
async def process_session(session_id: str):
    """Get current transcription results"""
    if not manager:
        raise HTTPException(status_code=503, detail="Service not available")

    try:
        result = manager.process(session_id)
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/session/{session_id}/end")
async def end_session(session_id: str):
    """End transcription session"""
    if not manager:
        raise HTTPException(status_code=503, detail="Service not available")

    try:
        manager.end_session(session_id)
        return {"status": "ended"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/session/{session_id}/clear")
async def clear_session(session_id: str):
    """Clear session buffers"""
    if not manager:
        raise HTTPException(status_code=503, detail="Service not available")

    try:
        manager.clear_session(session_id)
        return {"status": "cleared"}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Signal Handlers
# ============================================================================

def signal_handler(signum, frame):
    """Handle shutdown signals"""
    print(f"\n🛑 Received signal {signum}, shutting down gracefully...")
    sys.exit(0)


signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)


# ============================================================================
# Main
# ============================================================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
