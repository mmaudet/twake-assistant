# TheWhisper Backend for Twake Assistant

Real-time speech-to-text transcription server using TheWhisper model.

## 🎯 Features

- **Real-time streaming transcription** with low latency
- **Multi-language support** (9 languages)
- **Session-based architecture** for concurrent users
- **Committed/Uncommitted results** for progressive transcription
- **Docker containerized** for easy deployment

## 📋 Prerequisites

- Docker and Docker Compose
- Python 3.11+ (for local development)
- **For Apple Silicon**: MLX will be automatically installed
- **For NVIDIA GPUs**: CUDA-compatible Docker setup

## 🚀 Quick Start

### 1. Build and Run with Docker Compose

```bash
# From project root
docker-compose up whisper-backend
```

The backend will be available at `http://localhost:8000`

### 2. Test the API

```bash
# Health check
curl http://localhost:8000/health

# Expected response:
# {
#   "status": "healthy",
#   "platform": "apple",
#   "available": true,
#   "active_sessions": 0
# }
```

## 🧪 Testing the Transcription API

### Create a Session

```bash
curl -X POST "http://localhost:8000/session/create/" \
  -H "Content-Type: application/json" \
  -d '{"language": "en"}'

# Response: {"session_id": "abc123..."}
```

### Add Audio Chunk

```bash
# Note: You need Base64-encoded audio data
curl -X POST "http://localhost:8000/session/YOUR_SESSION_ID/add_chunk?base64=YOUR_BASE64_AUDIO"
```

### Get Transcription

```bash
curl -X POST "http://localhost:8000/session/YOUR_SESSION_ID/process"

# Response:
# {
#   "committed": [
#     {"text": "Hello", "timestamp": [0.0, 0.5]},
#     {"text": "world", "timestamp": [0.5, 1.0]}
#   ],
#   "uncommitted": [
#     {"text": "how", "timestamp": [1.0, 1.3]}
#   ]
# }
```

### End Session

```bash
curl -X POST "http://localhost:8000/session/YOUR_SESSION_ID/end"
```

## 🏗️ Local Development (without Docker)

### 1. Install Dependencies

```bash
cd backend

# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# For Apple Silicon
pip install mlx mlx-whisper

# For NVIDIA GPU
pip install torch transformers thewhisper
```

### 2. Run Server

```bash
# Set environment variables
export PLATFORM=apple
export MODEL_NAME=TheStageAI/thewhisper-large-v3-turbo
export CHUNK_LENGTH_S=15

# Run with uvicorn
uvicorn server:app --reload --host 0.0.0.0 --port 8000
```

## 🔧 Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PLATFORM` | `apple` | Platform: `apple` or `nvidia` |
| `MODEL_NAME` | `TheStageAI/thewhisper-large-v3-turbo` | Whisper model to use |
| `CHUNK_LENGTH_S` | `15` | Audio chunk length in seconds |

### Supported Languages

- `en` - English
- `fr` - French
- `es` - Spanish
- `de` - German
- `it` - Italian
- `pt` - Portuguese
- `ja` - Japanese
- `ko` - Korean
- `zh` - Chinese

## 📊 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Root info |
| `/health` | GET | Health check |
| `/session/create/` | POST | Create new session |
| `/session/{id}/add_chunk` | POST | Add audio chunk |
| `/session/{id}/process` | POST | Get transcription |
| `/session/{id}/end` | POST | End session |
| `/session/{id}/clear` | POST | Clear session buffers |

## 🐛 Troubleshooting

### MLX not available

If you see "MLX not available", ensure you're on Apple Silicon and have installed:

```bash
pip install mlx mlx-whisper
```

### Model download issues

Models are automatically downloaded from Hugging Face. If you encounter issues:

1. Check internet connection
2. Verify Hugging Face Hub access
3. Check disk space (models can be several GB)

### Out of memory

If transcription fails with OOM errors:

- Reduce `CHUNK_LENGTH_S` (try 10 instead of 15)
- Close other applications
- Restart Docker container

## 📝 Notes

- First run will download the model (~1.5GB for large-v3-turbo)
- Transcription quality depends on audio quality
- Lower `CHUNK_LENGTH_S` = lower latency but potentially lower accuracy

## 🔗 Related Links

- [TheWhisper GitHub](https://github.com/TheStageAI/TheWhisper)
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [MLX Whisper](https://github.com/ml-explore/mlx-examples/tree/main/whisper)
