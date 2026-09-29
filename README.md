---
title: Universal Video Downloader
emoji: 🎬
colorFrom: indigo
colorTo: purple
sdk: docker
app_port: 7860
pinned: false
---

# Downloader Pro — Universal Video & Audio Downloader

A professional, production-ready, universal media downloading application with a desktop-grade UI, real-time live download progress, multi-threaded queue management, and high-fidelity video and audio extraction.

---

## 🌟 Key Features

### 1. Universal URL Input & Automatic Detection
- **Manual Input & Quick Paste:** Enter any video or stream link, or click **Paste** to grab from clipboard.
- **Drag & Drop:** Drag links or text directly into the glowing input area.
- **Auto-Clipboard Detection:** When enabled, Downloader Pro automatically detects when you copy a video link and shows a non-intrusive prompt to analyze it instantly.
- **Duplicate Prevention & Validation:** Disables duplicate submissions while an analysis is in progress.
- **Quick Platform Chips:** Instant sample links for testing direct MP4 streams and YouTube 4K 60fps clips.

### 2. High-Fidelity Video Quality Selection
- **Resolutions up to 8K (4320p):** Dynamically detects and lists all legitimate formats provided by the source:
  - 8K (4320p)
  - 4K (2160p / 60fps)
  - 1440p (2K QHD)
  - 1080p (Full HD)
  - 720p (HD)
  - 480p, 360p, 240p, 144p
- **Accurate Metadata per Format:**
  - True resolution dimensions (e.g. `3840x2160`)
  - Video codecs: AV1, VP9, H.264/AVC, H.265/HEVC
  - Frame rate (e.g. 60fps)
  - Container format (`.mp4`, `.webm`, `.mkv`)
  - Audio status: Indicates whether audio is already included or will be merged with the best audio track
  - Approximate and exact file sizes
- **Smart Presets:** One-click **Best Quality** and **Recommended (1080p MP4)** presets.

### 3. Dedicated Audio Extraction
- **Original Source Audio:** Direct extraction of untouched Opus or AAC streams.
- **MP3 (High Quality 320 kbps):** CBR LAME encoding for universal automotive, phone, and speaker compatibility.
- **M4A (AAC 256 kbps):** Optimized for Apple devices and iOS playback.
- **WAV (Lossless PCM 16-bit 44.1 kHz):** Studio-grade uncompressed audio for editing and production.

### 4. Interactive Download Queue
- **Live Progress & Speeds:** Real-time speed indicator (e.g. `5.2 MB/s`), percentage, and countdown ETA.
- **State Badges:** Queued, Downloading, Merging Audio/Video, Converting Audio, Completed, Paused, Failed, Cancelled.
- **Full Process Control:**
  - Pause & Resume (resumes partially downloaded chunks via `--continue`)
  - Cancel & Retry failed downloads
  - Remove from queue
  - Clear completed items
- **Concurrency Management:** Configurable simultaneous download slots (1, 2, 3, or 5).

### 5. Download History & Windows Integration
- **Persistent History:** Automatically catalogs completed downloads with file size, resolution, and timestamp.
- **Play File:** Opens the downloaded file immediately with your system's default media player.
- **Show in Folder:** Opens Windows File Explorer with the downloaded file pre-selected.
- **Search & Filter:** Find past downloads by title or container format.

### 6. Professional Desktop Aesthetics
- **Dark & Light Mode:** Tailored color tokens with glassmorphic cards and smooth transitions.
- **Toast Notifications:** Non-blocking status updates for completions, errors, and system events.
- **Mobile & Tablet Responsive:** Fluid CSS Grid layout adapting seamlessly across screen sizes.

---

## 🚀 Running Downloader Pro

### Easy Launch:
Double-click `start.bat` in `d:\VIDEO DOWNLOADER\`:
```cmd
start.bat
```
This launches the server and opens `http://localhost:3000` in your default browser.

### Manual Launch via Terminal:
```powershell
& "d:\VIDEO DOWNLOADER\bin\deno.exe" run --allow-net --allow-read --allow-write --allow-run --allow-env server/app.ts
```

---

## 📁 Project Structure

```
d:\VIDEO DOWNLOADER\
├── bin\                     # Embedded self-contained binaries
│   ├── deno.exe             # High-performance server runtime
│   ├── ffmpeg.exe           # Audio/video muxer and transcoder
│   ├── yt-dlp.exe           # Universal metadata & stream engine
│   └── _internal\           # PyInstaller runtime dependencies
├── data\                    # JSON persistent state
│   ├── history.json         # Download history log
│   └── settings.json        # User preferences and configuration
├── downloads\               # Default downloads directory
├── public\                  # Client Single Page Application (SPA)
│   ├── index.html           # Desktop-style interface
│   ├── css\
│   │   └── style.css        # Design system, glassmorphism, responsive grid
│   ├── js\
│   │   ├── app.js           # Core state and UI event orchestrator
│   │   ├── api.js           # REST API client
│   │   ├── sse.js           # Real-time Server-Sent Events client
│   │   ├── ui.js            # Format cards, queue, history, and toast renderers
│   │   └── theme.js         # Dark/Light theme manager
│   └── assets\
│       └── logo.svg         # Vector logo icon
├── server\                  # Backend TypeScript services
│   ├── app.ts               # HTTP server & REST/SSE routes
│   ├── analyzer.ts          # yt-dlp metadata parser and format grouper
│   ├── downloader.ts        # Child process manager with live progress parsing
│   ├── queue.ts             # Concurrency manager and SSE event broadcaster
│   ├── history.ts           # History persistence manager
│   ├── settings.ts          # Settings persistence manager
│   └── types.ts             # TypeScript definitions
└── start.bat                # One-click Windows launcher
```

---

## 🔒 Compliance & Security Notice
Downloader Pro extracts only legitimately provided media streams published by content authors. Downloads are subject to each website's terms, copyright restrictions, and technical limitations. This software does not bypass DRM, paywalls, or private access controls.
