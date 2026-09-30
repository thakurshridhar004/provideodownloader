FROM denoland/deno:alpine-1.45.0

# Install FFmpeg, Python3, py3-pip, curl, aria2, and nodejs (for YouTube JS challenge solvers)
RUN apk add --no-cache ffmpeg python3 py3-pip curl aria2 nodejs

# Install yt-dlp with full dependencies (cryptography, brotli, websockets, etc.)
RUN python3 -m pip install --no-cache-dir --break-system-packages -U "yt-dlp[default]"

# Ensure yt-dlp is accessible in /usr/local/bin
RUN if [ -f /usr/bin/yt-dlp ]; then ln -sf /usr/bin/yt-dlp /usr/local/bin/yt-dlp; fi

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

# Default port for Hugging Face Spaces (7860), Render (10000 or PORT env)
ENV PORT=7860
EXPOSE 7860 3000 10000

CMD ["deno", "run", "--allow-net", "--allow-read", "--allow-write", "--allow-run", "--allow-env", "server/app.ts"]
