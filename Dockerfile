# Multi-arch lightweight production image for VibeLoad Media Backend
FROM python:3.12-slim

# Prevent python from buffering stdout/stderr and writing pyc
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8000

# Install system dependencies: FFmpeg, FFprobe, curl, ca-certificates, and Node.js >=22 LTS via NodeSource
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    ca-certificates \
    gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install standalone pre-compiled bgutil-pot binary for Linux x86_64
RUN curl -fsSL -o /usr/local/bin/bgutil-pot \
    https://github.com/jim60105/bgutil-ytdlp-pot-provider-rs/releases/download/v0.8.1/bgutil-pot-linux-x86_64 \
    && chmod +x /usr/local/bin/bgutil-pot

# Create non-root user and application directory
RUN useradd -m -u 1000 -s /bin/bash vibeload
WORKDIR /app

# Install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy entrypoint runner script
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

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

# Start via entrypoint script which launches bgutil-pot server daemon on port 4416 then starts uvicorn
ENTRYPOINT ["./entrypoint.sh"]
