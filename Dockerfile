# Multi-arch lightweight production image for VibeLoad Media Backend
FROM python:3.12-slim

# Prevent python from buffering stdout/stderr and writing pyc
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8000

# Install system dependencies: FFmpeg, FFprobe, curl for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user and application directory
RUN useradd -m -u 1000 -s /bin/bash vibeload
WORKDIR /app

# Install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source code
COPY app ./app

# Create storage directory and assign ownership
RUN mkdir -p /app/storage && chown -R vibeload:vibeload /app

# Switch to non-root user
USER vibeload

# Expose HTTP ports (8000 for standard/Render/Koyeb, 7860 for Hugging Face Spaces)
EXPOSE 8000 7860

# Container healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:${PORT:-8000}/api/health || exit 1

# Start FastAPI production server (binds to $PORT dynamically, defaults to 8000)
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
