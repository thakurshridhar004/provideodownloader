import { DownloadItem, DownloadStatus } from "./types.ts";
import { historyManager } from "./history.ts";
import { settingsManager } from "./settings.ts";
import { formatBytes, getCookieFilePath, toInvidiousUrl, isYouTubeUrl } from "./analyzer.ts";

import { join } from "https://deno.land/std@0.224.0/path/mod.ts";

const ROOT_DIR = import.meta.dirname ? join(import.meta.dirname, "..") : Deno.cwd();
const isWindows = Deno.build.os === "windows";
const YTDLP_PATH = (() => {
  const localExe = join(ROOT_DIR, "bin", isWindows ? "yt-dlp.exe" : "yt-dlp");
  try {
    if (Deno.statSync(localExe).isFile) return localExe;
  } catch (_) {}
  return "yt-dlp";
})();

const FFMPEG_PATH = (() => {
  const localExe = join(ROOT_DIR, "bin", isWindows ? "ffmpeg.exe" : "ffmpeg");
  try {
    if (Deno.statSync(localExe).isFile) return localExe;
  } catch (_) {}
  return "ffmpeg";
})();

const ARIA2_PATH = (() => {
  const localExe = join(ROOT_DIR, "bin", isWindows ? "aria2c.exe" : "aria2c");
  try {
    if (Deno.statSync(localExe).isFile) return localExe;
  } catch (_) {}
  return "aria2c";
})();

export type DownloadListener = (item: DownloadItem) => void;

export class DownloadTask {
  public item: DownloadItem;
  private process: Deno.ChildProcess | null = null;
  private isUserPaused = false;
  private isUserCancelled = false;
  private currentStreamIndex = 0;
  private fragIndex = 0;
  private fragTotal = 0;
  private listeners: Set<DownloadListener> = new Set();
  private botProtectionDetected = false;


  constructor(item: DownloadItem) {
    this.item = { ...item };
  }

  public subscribe(listener: DownloadListener) {
    this.listeners.add(listener);
    listener(this.item);
  }

  public unsubscribe(listener: DownloadListener) {
    this.listeners.delete(listener);
  }

  private notify() {
    for (const listener of this.listeners) {
      try {
        listener(this.item);
      } catch (err) {
        console.error("Listener error:", err);
      }
    }
  }

  public async start(): Promise<void> {
    if (this.item.status === "downloading" || this.item.status === "completed") {
      return;
    }

    this.isUserPaused = false;
    this.isUserCancelled = false;
    this.currentStreamIndex = 0;
    this.item.status = "downloading";
    this.item.errorMessage = undefined;
    const settings = settingsManager.getSettings();
    const threads = this.item.threads || settings.downloadThreads || 8;
    this.item.threads = threads;
    if (!this.item.downloadSpeed || this.item.downloadSpeed === "0 B/s") {
      this.item.downloadSpeed = `Connecting (${threads} threads)...`;
    }
    this.notify();

    const hasAria2 = (() => {
      try {
        if (ARIA2_PATH !== "aria2c") return Deno.statSync(ARIA2_PATH).isFile;
        return true;
      } catch (_e) {
        return false;
      }
    })();

    const isYouTube = this.item.url.includes("youtube.com") || this.item.url.includes("youtu.be");
    const safeFragments = isYouTube ? Math.min(threads, 3) : threads;

    const args: string[] = [
      "--ffmpeg-location", FFMPEG_PATH,
      "--continue",
      "--no-playlist",
      "--newline",
      "--concurrent-fragments", String(safeFragments),
      "--buffer-size", "64K",
      "--retries", "30",
      "--fragment-retries", "30",
      "--file-access-retries", "10",
      "--extractor-retries", "5",
      "--retry-sleep", "exp=1:15",
      "--socket-timeout", "25",
      "--no-mtime",
      "--print", "before_dl:TITLE|%(title)s",
      "--print", "before_dl:THUMBNAIL|%(thumbnail)s",
      "--print", "after_move:FINAL_FILE|%(filepath)s",
      "--progress",
      "--progress-template", "PROGRESS|%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s|%(progress._total_bytes_str)s|%(progress._downloaded_bytes_str)s|%(progress.status)s",
    ];

    if (isWindows) {
      args.push("--plugin-dirs", ROOT_DIR);
    }

    if (isYouTube) {
      args.push("--extractor-args", "youtube:player_client=default,web_safari,mweb;formats=missing_pot");
    }

    const cookieFile = getCookieFilePath();
    if (cookieFile) {
      args.push("--cookies", cookieFile);
    }

    // Multi-threaded chunk acceleration via aria2c for non-YouTube sites.
    // YouTube CDNs block parallel range requests (HTTP 403), so we rely on
    // --concurrent-fragments above for YouTube, which works natively.
    if (hasAria2 && !isYouTube) {
      args.push(
        "--downloader", ARIA2_PATH,
        "--downloader-args", `aria2c:-s ${threads} -x ${threads} -j ${threads} -k 1M --summary-interval=1`
      );
    }

    // Video vs Audio formatting
    if (this.item.type === "video") {
      const formatId = this.item.selectedFormat.formatId;
      const needsAudio = this.item.selectedFormat.needsAudioMerge !== false;

      if (formatId && formatId !== "best") {
        if (formatId.startsWith("res_")) {
          const parts = formatId.split("_");
          const height = parseInt(parts[1], 10);
          const isAv1 = parts.includes("av1");
          let v1 = "";
          let v2 = `bestvideo[height<=${height}]`;
          if (isAv1) {
             v1 = `bestvideo[height<=${height}][vcodec~="av01|av1"]`;
          } else if (height > 1080) {
             // 1440p, 4K, 8K on YouTube are encoded in VP9 or AV1 (never AVC/h264)
             v1 = `bestvideo[height<=${height}]`;
          } else {
             v1 = `bestvideo[height<=${height}][vcodec~="^avc|^h264"]`;
          }
          if (needsAudio) {
            args.push("-f", `${v1}+bestaudio[protocol^=http][ext=m4a]/${v1}+bestaudio[protocol^=http]/${v1}+bestaudio/${v2}+bestaudio[protocol^=http][ext=m4a]/${v2}+bestaudio[protocol^=http]/${v2}+bestaudio/best`);
          } else {
            args.push("-f", `${v1}/${v2}`);
          }
        } else {
          if (needsAudio) {
            // Instruct yt-dlp to pair with standard HTTP audio (m4a/aac or opus) and avoid bloated m3u8 audio
            args.push("-f", `${formatId}+bestaudio[protocol^=http][ext=m4a]/${formatId}+bestaudio[protocol^=http]/${formatId}+bestaudio/best`);
          } else {
            args.push("-f", formatId);
          }
        }
      } else {
        args.push("-f", "bestvideo[protocol^=http]+bestaudio[protocol^=http]/bestvideo+bestaudio/best");
      }

      if (needsAudio) {
        const allowedMergeFormats = ["mp4", "mkv", "webm", "ogg", "flv"];
        const container = (this.item.selectedFormat.container || "mp4").toLowerCase();
        const mergeFormat = allowedMergeFormats.includes(container) ? container : "mp4";
        args.push("--merge-output-format", mergeFormat);
      }
      args.push("--windows-filenames");
    } else {
      // Audio extraction
      args.push("-x");
      const audioOpt = this.item.selectedFormat.audioOption || "mp3";
      if (audioOpt === "mp3" || audioOpt.includes("mp3")) {
        args.push("--audio-format", "mp3", "--audio-quality", "0");
      } else if (audioOpt === "m4a" || audioOpt.includes("m4a")) {
        args.push("--audio-format", "m4a", "--audio-quality", "0");
      } else if (audioOpt === "wav" || audioOpt.includes("wav")) {
        args.push("--audio-format", "wav");
      } else {
        // Keep source format
      }
    }

    // Output template
    const destDir = this.item.destinationDir || join(ROOT_DIR, "downloads");
    try {
      Deno.mkdirSync(destDir, { recursive: true });
    } catch (_e) {
      // ignore
    }

    // Sanitize title in filename template
    args.push("-o", join(destDir, "%(title).150B [%(id)s].%(ext)s"));
    args.push(this.item.url);

    try {
      const cmd = new Deno.Command(YTDLP_PATH, {
        args,
        stdout: "piped",
        stderr: "piped",
      });

      this.process = cmd.spawn();
      this.item.pid = this.process.pid;
      this.notify();

      // Read stdout and stderr in background
      const stdoutPromise = this.readStream(this.process.stdout, false);
      const stderrPromise = this.readStream(this.process.stderr, true);

      let status = await this.process.status;
      await Promise.all([stdoutPromise, stderrPromise]);

      this.item.pid = undefined;
      this.process = null;

      if (this.isUserCancelled) {
        this.item.status = "cancelled";
        this.notify();
        return;
      }

      if (this.isUserPaused) {
        this.item.status = "paused";
        this.notify();
        return;
      }

      // On Windows, yt-dlp or antivirus file locking during FFmpeg merger can cause WinError 32 rename failure
      // Even if exit code is non-zero, check if .temp file is present and rename it safely
      if (!status.success) {
        try {
          const videoIdMatch = this.item.url.match(/(?:v=|\/)([a-zA-Z0-9_-]{11})/);
          const videoId = videoIdMatch ? videoIdMatch[1] : "";
          const searchKey = this.item.title ? this.item.title.slice(0, 15).toLowerCase() : "";
          for (const entry of Deno.readDirSync(destDir)) {
            if (!entry.isFile) continue;
            if (entry.name.endsWith(".temp.mp4") || entry.name.endsWith(".temp.mkv")) {
              if ((videoId && entry.name.includes(videoId)) || (searchKey && entry.name.toLowerCase().includes(searchKey))) {
                const tempPath = join(destDir, entry.name).replaceAll("/", "\\");
                const targetPath = tempPath.replace(/\.temp\.(mp4|mkv)$/i, ".$1");
                await new Promise((r) => setTimeout(r, 600));
                try {
                  Deno.renameSync(tempPath, targetPath);
                  this.item.destinationFile = targetPath;
                  status = { success: true, code: 0, signal: null };
                  console.log(`[Task ${this.item.id}] Recovered from Windows file lock rename: ${targetPath}`);
                  break;
                } catch (_e) {
                  await new Promise((r) => setTimeout(r, 1200));
                  try {
                    Deno.renameSync(tempPath, targetPath);
                    this.item.destinationFile = targetPath;
                    status = { success: true, code: 0, signal: null };
                    console.log(`[Task ${this.item.id}] Recovered from Windows file lock rename (pass 2): ${targetPath}`);
                    break;
                  } catch (_e2) {}
                }
              }
            }
          }
        } catch (_err) {}
      }

      if (status.success) {
        let resolvedPath = this.item.destinationFile;
        let fileExists = false;
        if (resolvedPath) {
          try {
            fileExists = Deno.statSync(resolvedPath).isFile;
          } catch (_e) {
            fileExists = false;
          }
        }

        // If file not confirmed or was pointing to an intermediate fragment (.f270.mp4 etc), find true final file
        if (!fileExists || resolvedPath?.match(/\.f\d+\.\w+$/i)) {
          try {
            const candidates: { path: string; mtime: number }[] = [];
            const searchKey = this.item.title ? this.item.title.slice(0, 15).toLowerCase() : "";
            const videoIdMatch = this.item.url.match(/(?:v=|\/)([a-zA-Z0-9_-]{11})/);
            const videoId = videoIdMatch ? videoIdMatch[1] : "";

            for (const entry of Deno.readDirSync(destDir)) {
              if (!entry.isFile) continue;
              const name = entry.name;
              // Skip temporary fragments
              if (name.endsWith(".part") || name.endsWith(".ytdl") || name.match(/\.f\d+\.\w+$/i) || name.includes(".temp.")) {
                continue;
              }
              if ((videoId && name.includes(videoId)) || (searchKey && name.toLowerCase().includes(searchKey))) {
                const fullPath = join(destDir, name).replaceAll("/", "\\");
                try {
                  const stat = Deno.statSync(fullPath);
                  candidates.push({ path: fullPath, mtime: stat.mtime?.getTime() || 0 });
                } catch (_e) {
                  // ignore
                }
              }
            }

            candidates.sort((a, b) => b.mtime - a.mtime);
            if (candidates.length > 0) {
              resolvedPath = candidates[0].path;
              this.item.destinationFile = resolvedPath;
              fileExists = true;
            }
          } catch (_err) {
            // ignore
          }
        }

        if (!resolvedPath) {
          resolvedPath = join(destDir, `${this.item.title}.${this.item.selectedFormat.container || "mp4"}`).replaceAll("/", "\\");
          this.item.destinationFile = resolvedPath;
        }

        if (resolvedPath && !fileExists) {
          try {
            fileExists = Deno.statSync(resolvedPath).isFile;
          } catch (_e) {
            fileExists = false;
          }
        }

        if (!fileExists) {
          this.item.status = "failed";
          this.item.progress = 0;
          this.item.errorMessage = "Download finished, but the final video/audio file was not found on disk.";
          this.notify();
          return;
        }

        this.item.status = "completed";
        this.item.progress = 100;
        this.item.eta = "00:00";
        this.item.completedAt = Date.now();
        this.notify();

        // Register to history
        let finalFileSize = "Unknown";
        let finalFileSizeBytes = 0;
        try {
          if (resolvedPath && Deno.statSync(resolvedPath).isFile) {
            finalFileSizeBytes = Deno.statSync(resolvedPath).size;
            finalFileSize = formatBytes(finalFileSizeBytes);
          } else if (this.item.totalBytes > 0) {
            finalFileSizeBytes = this.item.totalBytes;
            finalFileSize = formatBytes(this.item.totalBytes);
          }
        } catch (_err) {
          finalFileSizeBytes = this.item.totalBytes;
          finalFileSize = formatBytes(this.item.totalBytes);
        }

        // Update the item with final file info
        this.item.downloadSpeed = `✅ Done — ${finalFileSize} (${this.item.threads || 8} threads)`;
        this.item.downloadedFormatted = finalFileSize;
        this.item.totalFormatted = finalFileSize;
        this.item.downloadedBytes = finalFileSizeBytes;
        this.item.totalBytes = finalFileSizeBytes;
        this.notify();

        const fileName = resolvedPath.split(/[\/\\]/).pop() || `${this.item.title}.${this.item.selectedFormat.container || "mp4"}`;

        historyManager.addItem({
          id: this.item.id,
          url: this.item.url,
          title: this.item.title,
          thumbnail: this.item.thumbnail,
          type: this.item.type,
          resolutionLabel: this.item.selectedFormat.resolutionLabel || (this.item.type === "video" ? "Video" : "Audio"),
          container: this.item.selectedFormat.container || "mp4",
          fileSizeFormatted: finalFileSize,
          filePath: resolvedPath,
          fileName,
          duration: this.item.duration,
          downloadDate: Date.now(),
          status: "completed",
          clientId: this.item.clientId,
        });
      } else {
        // ── Invidious fallback for YouTube bot-protection (no cookies needed) ────
        if (this.botProtectionDetected && isYouTubeUrl(this.item.url)) {
          const INVIDIOUS_INSTANCES = [
            "https://inv.nadeko.net",
            "https://invidious.fdn.fr",
            "https://iv.ggtyler.dev",
            "https://yt.drgnz.club",
            "https://invidious.incogniweb.net",
          ];
          let invSucceeded = false;

          for (const instance of INVIDIOUS_INSTANCES) {
            if (this.isUserCancelled) break;
            const invUrl = toInvidiousUrl(this.item.url, instance);
            if (!invUrl) break;

            console.log(`[Task ${this.item.id}] Trying Invidious fallback: ${instance}`);
            this.botProtectionDetected = false;
            this.item.errorMessage = undefined;
            this.item.status = "downloading";
            this.item.progress = 0;
            this.item.downloadSpeed = `Retrying via ${new URL(instance).hostname}...`;
            this.notify();

            // Build clean args with Invidious URL (drop youtube extractor-args)
            const invArgs = args
              .slice(0, -1) // remove original URL at the end
              .filter((_a, i, arr) => {
                // Remove --extractor-args youtube:... pair
                if (arr[i] === "--extractor-args" && i + 1 < arr.length && arr[i + 1].includes("youtube:")) return false;
                if (i > 0 && arr[i - 1] === "--extractor-args" && arr[i].includes("youtube:")) return false;
                return true;
              });
            invArgs.push(invUrl);

            try {
              const invCmd = new Deno.Command(YTDLP_PATH, {
                args: invArgs,
                stdout: "piped",
                stderr: "piped",
              });
              this.process = invCmd.spawn();
              this.item.pid = this.process.pid;
              this.notify();

              const invStdoutP = this.readStream(this.process.stdout, false);
              const invStderrP = this.readStream(this.process.stderr, true);
              const invStatus = await this.process.status;
              await Promise.all([invStdoutP, invStderrP]);
              this.item.pid = undefined;
              this.process = null;

              if (invStatus.success) {
                console.log(`[Task ${this.item.id}] Invidious fallback succeeded: ${instance}`);
                invSucceeded = true;
                break;
              }
              console.warn(`[Task ${this.item.id}] Invidious ${instance} failed, trying next...`);
            } catch (e) {
              console.warn(`[Task ${this.item.id}] Invidious ${instance} exception:`, e);
            }
          }

          if (!invSucceeded) {
            this.item.status = "failed";
            if (!this.item.errorMessage) {
              this.item.errorMessage = "YouTube is restricting this server's IP. All fallback routes exhausted. Please try again later.";
            }
            this.notify();
            return;
          }

          // Invidious succeeded — complete the download normally
          {
            const resolvedPathInv = this.item.destinationFile;
            let fileExistsInv = false;
            if (resolvedPathInv) {
              try { fileExistsInv = Deno.statSync(resolvedPathInv).isFile; } catch (_e) {}
            }
            if (!fileExistsInv) {
              // Search destDir for recently-written file
              try {
                const candidates: { path: string; mtime: number }[] = [];
                const videoIdMatchInv = this.item.url.match(/(?:v=|\/)([a-zA-Z0-9_-]{11})/);
                const videoIdInv = videoIdMatchInv ? videoIdMatchInv[1] : "";
                const searchKeyInv = this.item.title ? this.item.title.slice(0, 15).toLowerCase() : "";
                for (const entry of Deno.readDirSync(destDir)) {
                  if (!entry.isFile || entry.name.endsWith(".part") || entry.name.endsWith(".ytdl")) continue;
                  if ((videoIdInv && entry.name.includes(videoIdInv)) || (searchKeyInv && entry.name.toLowerCase().includes(searchKeyInv))) {
                    const fp = join(destDir, entry.name).replaceAll("/", "\\");
                    try { candidates.push({ path: fp, mtime: Deno.statSync(fp).mtime?.getTime() || 0 }); } catch (_e) {}
                  }
                }
                candidates.sort((a, b) => b.mtime - a.mtime);
                if (candidates.length > 0) { this.item.destinationFile = candidates[0].path; fileExistsInv = true; }
              } catch (_err) {}
            }
            if (!fileExistsInv) {
              this.item.status = "failed";
              this.item.errorMessage = "Invidious download finished, but file not found on disk.";
              this.notify();
              return;
            }
            this.item.status = "completed";
            this.item.progress = 100;
            this.item.eta = "00:00";
            this.item.completedAt = Date.now();
            let finalFileSizeInv = "Unknown";
            let finalFileSizeBytesInv = 0;
            try {
              if (this.item.destinationFile && Deno.statSync(this.item.destinationFile).isFile) {
                finalFileSizeBytesInv = Deno.statSync(this.item.destinationFile).size;
                finalFileSizeInv = formatBytes(finalFileSizeBytesInv);
              }
            } catch (_err) {}
            this.item.downloadSpeed = `✅ Done (via Invidious) — ${finalFileSizeInv}`;
            this.item.downloadedFormatted = finalFileSizeInv;
            this.item.totalFormatted = finalFileSizeInv;
            this.item.downloadedBytes = finalFileSizeBytesInv;
            this.item.totalBytes = finalFileSizeBytesInv;
            this.notify();
            const fileNameInv = this.item.destinationFile!.split(/[\/\\]/).pop() || `${this.item.title}.mp4`;
            historyManager.addItem({
              id: this.item.id,
              url: this.item.url,
              title: this.item.title,
              thumbnail: this.item.thumbnail,
              type: this.item.type,
              resolutionLabel: this.item.selectedFormat.resolutionLabel || (this.item.type === "video" ? "Video" : "Audio"),
              container: this.item.selectedFormat.container || "mp4",
              fileSizeFormatted: finalFileSizeInv,
              filePath: this.item.destinationFile!,
              fileName: fileNameInv,
              duration: this.item.duration,
              downloadDate: Date.now(),
              status: "completed",
              clientId: this.item.clientId,
            });
          }
          return;

        }
        // ──────────────────────────────────────────────────────────────────────
        this.item.status = "failed";
        if (!this.item.errorMessage) {
          this.item.errorMessage = `Download process exited with error code ${status.code}.`;
        }
        this.notify();
      }
    } catch (err: any) {
      if (this.isUserCancelled) {
        this.item.status = "cancelled";
      } else if (this.isUserPaused) {
        this.item.status = "paused";
      } else {
        this.item.status = "failed";
        this.item.errorMessage = err.message || "Failed to execute download task.";
      }
      this.notify();
    }
  }

  private async readStream(stream: ReadableStream<Uint8Array>, isError: boolean) {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        // Handle concatenated aria2 and yt-dlp lines as well as carriage return \r and newline \n
        const preprocessed = buffer
          .replaceAll("][download]", "]\n[download]")
          .replaceAll("]FINAL_FILE", "]\nFINAL_FILE")
          .replaceAll("]PROGRESS", "]\nPROGRESS")
          .replaceAll("][Merger]", "]\n[Merger]");
        const lines = preprocessed.split(/[\r\n]+/);
        buffer = lines.pop() || "";

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line) continue;

          if (line.startsWith("FINAL_FILE|")) {
            const p = line.replace("FINAL_FILE|", "").trim().replaceAll("/", "\\");
            if (p) {
              this.item.destinationFile = p;
              console.log(`[Task ${this.item.id}] FINAL_FILE confirmed: ${p}`);
            }
          } else if (line.startsWith("TITLE|")) {
            const trueTitle = line.replace("TITLE|", "").trim();
            if (trueTitle && (!this.item.title || this.item.title.startsWith("Video #") || this.item.title.startsWith("YouTube Video") || this.item.title.includes("http") || this.item.title.startsWith("Test Video"))) {
              this.item.title = trueTitle;
              this.notify();
            }
          } else if (line.startsWith("THUMBNAIL|")) {
            const trueThumb = line.replace("THUMBNAIL|", "").trim();
            if (trueThumb && (!this.item.thumbnail || this.item.thumbnail.includes("mqdefault"))) {
              this.item.thumbnail = trueThumb;
              this.notify();
            }
          } else if (line.startsWith("PROGRESS|")) {
            this.handleProgressLine(line);
          } else if (line.includes("CN:") && line.includes("DL:")) {
            this.handleAriaProgressLine(line);
          } else if (line.startsWith("[download]") && (line.includes("%") || line.includes("Destination:"))) {
            // Parse fragment info from lines like: [download]  45.2% of 73.39MiB at 2.50MiB/s ETA 00:16 (frag 8/45)
            const fragMatch = line.match(/\(frag\s+(\d+)\/(\d+)\)/i);
            if (fragMatch) {
              this.fragIndex = parseInt(fragMatch[1], 10);
              this.fragTotal = parseInt(fragMatch[2], 10);
            }
            this.handleStandardProgressLine(line);
          } else if (line.includes("[Merger]") || line.includes("Merging formats")) {
            this.item.status = "merging";
            this.item.progress = Math.max(this.item.progress, 96);
            this.item.downloadSpeed = "Merging video & audio with FFmpeg...";
            this.notify();
            const match = line.match(/into "([^"]+)"/);
            if (match && match[1]) {
              this.item.destinationFile = match[1].trim().replaceAll("/", "\\");
            }
          } else if (line.includes("Destination:")) {
            const match = line.match(/Destination:\s*(.+)$/);
            if (match && match[1]) {
              const cand = match[1].trim().replaceAll("/", "\\");
              if (!cand.match(/\.f\d+\.\w+$/i) && !cand.endsWith(".part") && !cand.endsWith(".ytdl")) {
                this.item.destinationFile = cand;
              } else if (cand.includes(".f140.") || cand.includes(".f251.") || cand.includes(".m4a") || cand.includes(".webm")) {
                this.currentStreamIndex = 1;
              }
            }
          } else if (isError) {
            console.error(`[Task ${this.item.id} ERR]:`, line);
            if (!this.item.errorMessage) {
              const lower = line.toLowerCase();
              if (
                lower.includes("not a bot") || lower.includes("confirm you") ||
                lower.includes("sign in to confirm") || lower.includes("precondition check failed") ||
                lower.includes("http error 429") || lower.includes("requested format is not available")
              ) {
                this.botProtectionDetected = true;
                this.item.errorMessage = "YouTube bot protection triggered. Retrying via Invidious mirror...";
              } else if (line.includes("ERROR:")) {
                this.item.errorMessage = line.replace(/^ERROR:\s*/, "");
              }
            }
          }
        }
      }

      if (buffer.trim()) {
        const remaining = buffer.trim();
        if (remaining.startsWith("FINAL_FILE|")) {
          const p = remaining.replace("FINAL_FILE|", "").trim().replaceAll("/", "\\");
          if (p) {
            this.item.destinationFile = p;
          }
        }
      }
    } catch (_err) {
      // Stream closed
    }
  }

  private handleAriaProgressLine(line: string) {
    // Regex matches both with and without percentage and ETA:
    // [#acaf9a 3.2MiB/4.1MiB(78%) CN:8 DL:374KiB ETA:2s]
    // [#a45a8b 8.1MiB/9.7MiB(82%) CN:6 DL:2.1MiB]
    // [#29e7bc 0B/0B CN:1 DL:0B]
    const ariaMatch = line.match(/\[#[a-f0-9]+\s+([0-9.]+[A-Za-z]+)\/([0-9.]+[A-Za-z]+)(?:\((\d+)%\))?\s+CN:(\d+)\s+DL:([0-9.]+[A-Za-z/]+)(?:\s+ETA:([0-9a-z:]+))?/i);
    if (!ariaMatch) return;

    const downloadedStr = ariaMatch[1];
    const totalStr = ariaMatch[2];
    const rawPct = ariaMatch[3] ? parseFloat(ariaMatch[3]) : 0;
    const connCount = parseInt(ariaMatch[4] || "8", 10);
    const rawSpeed = ariaMatch[5];
    const speed = rawSpeed.includes("/s") ? rawSpeed : `${rawSpeed}/s`;
    const eta = ariaMatch[6] || "";

    const activeThreads = Math.max(connCount, this.item.threads || 8);
    this.item.threads = activeThreads;
    this.item.downloadSpeed = `${speed} (${activeThreads} threads)`;
    this.item.downloadedFormatted = downloadedStr;
    if (totalStr && totalStr !== "0B") {
      this.item.totalFormatted = totalStr;
    }
    if (eta && eta !== "Unknown") this.item.eta = eta;

    // Scale progress: Stream 0 (video) is 0-85%, Stream 1 (audio) is 85-95%, Merger is 95-99%
    if (rawPct > 0) {
      let scaled = rawPct;
      if (this.item.type === "video" && this.item.selectedFormat.needsAudioMerge) {
        if (this.currentStreamIndex === 0) {
          scaled = Math.min(85, rawPct * 0.85);
        } else {
          scaled = 85 + Math.min(10, rawPct * 0.10);
        }
      } else {
        scaled = Math.min(99, rawPct);
      }
      this.item.progress = Math.min(99, Math.max(this.item.progress, scaled));
    }

    if (this.item.status !== "merging") {
      this.item.status = "downloading";
    }
    this.notify();
  }

  private handleProgressLine(line: string) {
    const parts = line.split("|");
    if (parts.length >= 7) {
      const percentStr = parts[1].replace("%", "").trim();
      const speedStr = parts[2].trim();
      const etaStr = parts[3].trim();
      const totalStr = parts[4].trim();
      const downloadedStr = parts[5].trim();
      const progressStatus = parts[6].trim();

      const rawPercent = parseFloat(percentStr);
      let scaledPercent = rawPercent;

      if (!isNaN(rawPercent)) {
        if (this.item.type === "video" && this.item.selectedFormat.needsAudioMerge) {
          if (this.currentStreamIndex === 0) {
            scaledPercent = Math.min(85, rawPercent * 0.85);
          } else {
            scaledPercent = 85 + Math.min(10, rawPercent * 0.10);
          }
        } else {
          scaledPercent = Math.min(99, rawPercent);
        }
        this.item.progress = Math.min(99, Math.max(this.item.progress, scaledPercent));
      }

      if (speedStr && speedStr !== "NA" && speedStr !== "Unknown B/s") {
        const threads = this.item.threads || settingsManager.getSettings().downloadThreads || 8;
        const fragInfo = (this.fragTotal > 0) ? ` • Part ${this.fragIndex}/${this.fragTotal}` : "";
        this.item.downloadSpeed = `${speedStr} (${threads} threads${fragInfo})`;
      }

      if (etaStr && etaStr !== "NA" && etaStr !== "Unknown") {
        this.item.eta = etaStr;
      }

      if (totalStr && totalStr !== "NA" && totalStr !== "Unknown") {
        this.item.totalFormatted = totalStr;
      } else if (!this.item.totalFormatted || this.item.totalFormatted === "Estimating...") {
        this.item.totalFormatted = this.item.selectedFormat.filesizeFormatted || "Calculating...";
      }

      if (downloadedStr && downloadedStr !== "NA" && downloadedStr !== "Unknown") {
        this.item.downloadedFormatted = downloadedStr;
      }

      if (progressStatus === "finished") {
        if (this.item.type === "video" && this.item.selectedFormat.needsAudioMerge) {
          if (this.currentStreamIndex === 0) {
            this.currentStreamIndex = 1;
            this.item.progress = 85;
            this.item.downloadSpeed = "Downloading audio track...";
          } else {
            this.item.status = "merging";
            this.item.progress = 96;
            this.item.downloadSpeed = "Merging video & audio with FFmpeg...";
          }
        }
      } else {
        if (this.item.status !== "merging") {
          this.item.status = "downloading";
        }
      }

      this.notify();
    }
  }

  private handleStandardProgressLine(line: string) {
    // If line signals 100% of a stream component, transition gracefully instead of falsely finishing
    const isStream100 = line.includes("100%") || line.includes("100.0%");
    if (isStream100 && this.item.type === "video" && this.item.selectedFormat.needsAudioMerge) {
      if (this.currentStreamIndex === 0) {
        this.currentStreamIndex = 1;
        this.item.progress = 85;
        this.item.downloadSpeed = "Downloading audio track...";
        this.notify();
        return;
      } else {
        this.item.status = "merging";
        this.item.progress = 96;
        this.item.downloadSpeed = "Merging video & audio with FFmpeg...";
        this.notify();
        return;
      }
    }

    const percentMatch = line.match(/(\d+(?:\.\d+)?)%/);
    if (percentMatch) {
      const p = parseFloat(percentMatch[1]);
      if (!isNaN(p)) {
        let scaled = p;
        if (this.item.type === "video" && this.item.selectedFormat.needsAudioMerge) {
          if (this.currentStreamIndex === 0) {
            scaled = Math.min(85, p * 0.85);
          } else {
            scaled = 85 + Math.min(10, p * 0.10);
          }
        } else {
          scaled = Math.min(99, p);
        }
        this.item.progress = Math.min(99, Math.max(this.item.progress, scaled));
      }
    }

    const speedMatch = line.match(/at\s+([~0-9.]+[A-Za-z/]+)/);
    if (speedMatch) {
      const threads = this.item.threads || settingsManager.getSettings().downloadThreads || 8;
      const fragInfo = (this.fragTotal > 0) ? ` • Part ${this.fragIndex}/${this.fragTotal}` : "";
      this.item.downloadSpeed = `${speedMatch[1]} (${threads} threads${fragInfo})`;
    }

    const etaMatch = line.match(/ETA\s+([0-9:]+)/);
    if (etaMatch) {
      this.item.eta = etaMatch[1];
    }

    const totalMatch = line.match(/of\s+~?\s*([0-9.]+[A-Za-z]+)/);
    if (totalMatch) {
      this.item.totalFormatted = totalMatch[1];
    }

    if (this.item.status !== "merging") {
      this.item.status = "downloading";
    }
    this.notify();
  }

  public pause(): boolean {
    if (this.item.status !== "downloading" && this.item.status !== "merging") {
      return false;
    }
    this.isUserPaused = true;
    this.killProcess();
    this.item.status = "paused";
    this.notify();
    return true;
  }

  public cancel(): boolean {
    if (this.item.status === "completed" || this.item.status === "cancelled") {
      return false;
    }
    this.isUserCancelled = true;
    this.killProcess();
    this.item.status = "cancelled";
    this.notify();
    return true;
  }

  private killProcess() {
    if (this.process) {
      try {
        this.process.kill("SIGTERM");
      } catch (_e) {
        try {
          this.process.kill("SIGKILL");
        } catch (_err) {
          // ignore
        }
      }
    }
  }
}
