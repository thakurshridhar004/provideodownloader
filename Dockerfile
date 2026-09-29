FROM denoland/deno:alpine-1.45.0

# Install FFmpeg, Python3, curl, and aria2
RUN apk add --no-cache ffmpeg python3 py3-pip curl aria2

# Install latest standalone Linux yt-dlp binary
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /app

# Copy application files
COPY . .

# Auto-organize files if uploaded directly to root without folders
RUN if [ -f "app.ts" ] && [ ! -f "server/app.ts" ]; then \
      mkdir -p server public/js public/css && \
      mv analyzer.ts downloader.ts history.ts queue.ts settings.ts types.ts app.ts server/ 2>/dev/null || true && \
      mv index.html public/ 2>/dev/null || true && \
      mv style.css public/css/ 2>/dev/null || true && \
      mv api.js app.js sse.js theme.js ui.js public/js/ 2>/dev/null || true; \
    fi

# Ensure data and downloads directories exist with full write permissions
RUN mkdir -p data downloads && chmod -R 777 /app

# Default port for Hugging Face Spaces (7860)
ENV PORT=7860
EXPOSE 7860 3000

CMD ["deno", "run", "--allow-net", "--allow-read", "--allow-write", "--allow-run", "--allow-env", "server/app.ts"]
