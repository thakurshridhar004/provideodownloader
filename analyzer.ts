import { fallbackPipedAPI } from "./piped.ts";
import { VideoMetadata, VideoFormatOption, AudioFormatOption } from "./types.ts";
import { join } from "https://deno.land/std@0.224.0/path/mod.ts";

const ROOT_DIR = import.meta.dirname ? join(import.meta.dirname, "..") : Deno.cwd();
const isWindows = Deno.build.os === "windows";
export const YTDLP_PATH = (() => {
  const localExe = join(ROOT_DIR, "bin", isWindows ? "yt-dlp.exe" : "yt-dlp");
  try {
    if (Deno.statSync(localExe).isFile) return localExe;
  } catch (_) {}
  return "yt-dlp";
})();

export const FFMPEG_PATH = (() => {
  const localExe = join(ROOT_DIR, "bin", isWindows ? "ffmpeg.exe" : "ffmpeg");
  try {
    if (Deno.statSync(localExe).isFile) return localExe;
  } catch (_) {}
  return "ffmpeg";
})();

async function isPotProviderRunning(): Promise<boolean> {
  if (!isWindows) return false;
  try {
    const res = await fetch("http://127.0.0.1:4416/ping", { signal: AbortSignal.timeout(500) });
    return res.ok;
  } catch (_) {
    return false;
  }
}

export function getCookieFilePath(): string | null {
  const userProfile = Deno.env.get("USERPROFILE") || "";
  const candidates = [
    join(ROOT_DIR, "cookies.txt"),
    join(ROOT_DIR, "data", "cookies.txt"),
    join(ROOT_DIR, "bin", "cookies.txt"),
    join(userProfile, "Downloads", "www.youtube.com_cookies.txt"),
    join(userProfile, "Downloads", "cookies.txt"),
    join(userProfile, "Downloads", "cookies1.txt.txt"),
  ];
  for (const c of candidates) {
    try {
      if (Deno.statSync(c).isFile && Deno.statSync(c).size > 100) return c;
    } catch (_e) {
      // ignore
    }
  }
  return null;
}

// ── Invidious fallback (cookie-free YouTube bypass) ─────────────────────────
// yt-dlp natively supports Invidious URLs — when Render's datacenter IP is
// blocked by YouTube, we re-route through a public Invidious instance which
// has a residential/better-reputation IP and proxies back to YouTube.
const INVIDIOUS_INSTANCES = [
  "https://inv.nadeko.net",
  "https://invidious.fdn.fr",
  "https://iv.ggtyler.dev",
  "https://yt.drgnz.club",
  "https://invidious.incogniweb.net",
];

function extractYouTubeVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtube.com")) {
      if (u.searchParams.get("v")) return u.searchParams.get("v");
      // shorts / embed
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts.length >= 2 && (parts[0] === "shorts" || parts[0] === "embed" || parts[0] === "v")) return parts[1];
    }
    if (u.hostname === "youtu.be") {
      return u.pathname.slice(1).split("?")[0] || null;
    }
  } catch (_) {}
  return null;
}

export function toInvidiousUrl(youtubeUrl: string, instance: string): string | null {
  const vid = extractYouTubeVideoId(youtubeUrl);
  if (!vid || vid.length < 5) return null;
  return `${instance}/watch?v=${vid}`;
}

export function isYouTubeUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname.includes("youtube.com") || u.hostname === "youtu.be";
  } catch (_) { return false; }
}

function isBotProtectionError(errText: string): boolean {
  const lower = errText.toLowerCase();
  return (
    lower.includes("not a bot") ||
    lower.includes("sign in to confirm") ||
    lower.includes("confirm you") ||
    lower.includes("requested format is not available") ||
    lower.includes("precondition check failed") ||
    lower.includes("http error 429") ||
    lower.includes("403")
  );
}
// ─────────────────────────────────────────────────────────────────────────────

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0 || isNaN(bytes)) return "Estimated upon download";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(1)} ${units[i]}`;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0 || isNaN(seconds)) return "Live / Unknown";
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function cleanCodec(codec: string | null | undefined, container?: string): string {
  if (!codec || codec === "none" || codec === "None") {
    if (container === "webm") return "AV1 Next-Gen (Best Quality • Lowest Size)";
    return "H.264 / AVC (High Profile)";
  }
  if (codec.startsWith("av01") || codec.startsWith("av1")) return "AV1 Next-Gen (Best Quality • Lowest Size)";
  if (codec.startsWith("avc1") || codec.startsWith("h264")) return "H.264 / AVC (High Profile)";
  if (codec.startsWith("hev1") || codec.startsWith("hvc1") || codec.startsWith("h265")) return "H.265 / HEVC";
  if (codec.startsWith("vp09") || codec.startsWith("vp9")) return "VP9 (WebM)";
  if (codec.startsWith("mp4a")) return "AAC Stereo";
  if (codec.includes("opus")) return "Opus";
  if (codec.includes("vorbis")) return "Vorbis";
  if (codec.includes("mp3")) return "MP3";
  return codec;
}

async function probeMediaDimensions(url: string): Promise<{ width?: number; height?: number; fps?: number } | null> {
  try {
    const cmd = new Deno.Command(FFMPEG_PATH, {
      args: ["-hide_banner", "-i", url],
      stdout: "null",
      stderr: "piped",
    });
    const proc = cmd.spawn();
    const timeout = setTimeout(() => {
      try { proc.kill(); } catch (_) {}
    }, 3500);
    const { stderr } = await proc.output();
    clearTimeout(timeout);
    const errText = new TextDecoder().decode(stderr);
    const match = errText.match(/Video:.*?,\s*(\d{2,5})x(\d{2,5})/i);
    if (match) {
      const width = parseInt(match[1], 10);
      const height = parseInt(match[2], 10);
      const fpsMatch = errText.match(/(\d+(?:\.\d+)?)\s*fps/i);
      const fps = fpsMatch ? parseFloat(fpsMatch[1]) : undefined;
      return { width, height, fps };
    }
  } catch (_e) {
    // Ignore probe errors
  }
  return null;
}

export class VideoAnalyzer {
  public async analyzeUrl(rawUrl: string): Promise<VideoMetadata> {
    const trimmed = rawUrl.trim();
    if (!trimmed) {
      throw new Error("Please enter a valid video URL.");
    }

    try {
      new URL(trimmed);
    } catch (_e) {
      throw new Error("Invalid URL format. Please enter a valid URL beginning with http:// or https://");
    }

    const hasPot = await isPotProviderRunning();
    const cf = getCookieFilePath();

    const buildArgs = (useAggressiveFallback = false, forceIpv4 = true) => {
      const a = [
        "--ffmpeg-location", FFMPEG_PATH,
        "--dump-single-json",
        "--no-warnings",
        "--no-playlist",
        "--skip-download",
        "--socket-timeout", "10",  // fail fast on network hang
      ];
      if (forceIpv4) {
        a.push("--prefer-free-formats");
      }
      if (hasPot) {
        a.push("--plugin-dirs", ROOT_DIR);
      }
      // Datacenter IP bypass for Render/Cloud environments:
      if (useAggressiveFallback) {
        a.push("--extractor-args", "youtube:player_client=mweb,android,web_embedded;formats=missing_pot");
      } else {
        a.push("--extractor-args", "youtube:player_client=default,web_safari,mweb;formats=missing_pot");
      }
      if (cf) {
        a.push("--cookies", cf);
      }
      a.push(trimmed);
      return a;
    };

    // Helper: run yt-dlp with a max wall-clock timeout (ms)
    const runWithTimeout = async (
      args: string[],
      timeoutMs = 15000
    ): Promise<{ code: number; stdout: Uint8Array; stderr: Uint8Array }> => {
      const proc = new Deno.Command(YTDLP_PATH, { args, stdout: "piped", stderr: "piped" }).spawn();
      const timer = setTimeout(() => { try { proc.kill(); } catch (_) {} }, timeoutMs);
      try {
        const result = await proc.output();
        clearTimeout(timer);
        return result;
      } catch (e) {
        clearTimeout(timer);
        throw e;
      }
    };

    // Primary extraction attempt
    let cmd = new Deno.Command(YTDLP_PATH, {
      args: buildArgs(false, true),
      stdout: "piped",
      stderr: "piped",
    });

    let process = cmd.spawn();
    const killTimer1 = setTimeout(() => { try { process.kill(); } catch (_) {} }, 15000);
    let { code, stdout, stderr } = await process.output();
    clearTimeout(killTimer1);

    // If first attempt failed, retry with multi-client fallback without force-ipv4
    if (code !== 0) {
      const firstErr = new TextDecoder().decode(stderr).trim();
      console.warn("[Analyzer] Primary extraction failed, retrying...", firstErr.slice(0, 120));

      const retryResult = await runWithTimeout(buildArgs(true, false), 6000);
      if (retryResult.code === 0) {
        code = 0;
        stdout = retryResult.stdout as any;
        stderr = retryResult.stderr as any;
      } else {
        stderr = (retryResult.stderr.length > 0 ? retryResult.stderr : stderr) as any;
      }
    }

    // ── Attempt 3: android_vr / tv_embedded — bypass datacenter bot check ────────
    if (code !== 0) {
      const clientsToTry = ["android_vr", "tv_embedded", "android_creator"];
      for (const client of clientsToTry) {
        if (code === 0) break;
        console.warn(`[Analyzer] Trying player_client=${client}...`);
        const clientArgs = [
          "--ffmpeg-location", FFMPEG_PATH,
          "--dump-single-json", "--no-warnings", "--no-playlist", "--skip-download",
          "--socket-timeout", "10",
          "--extractor-args", `youtube:player_client=${client};formats=missing_pot`,
          ...(cf ? ["--cookies", cf] : []),
          trimmed,
        ];
        try {
          const clientResult = await runWithTimeout(clientArgs, 6000);
          if (clientResult.code === 0 && clientResult.stdout.length > 10) {
            console.log(`[Analyzer] player_client=${client} succeeded!`);
            code = 0; stdout = clientResult.stdout as any; stderr = clientResult.stderr as any;
          } else {
            console.warn(`[Analyzer] client=${client} failed:`, new TextDecoder().decode(clientResult.stderr).slice(0, 80));
            if (clientResult.stderr.length > 0) stderr = clientResult.stderr as any;
          }
        } catch (e) { console.warn(`[Analyzer] client=${client} exception:`, e); }
      }
    }
    // ─────────────────────────────────────────────────────────────────────────────

    // ── Invidious Fallback (cookie-free) ─────────────────────────────────────────
    if (code !== 0 && isYouTubeUrl(trimmed)) {
      const botErr = new TextDecoder().decode(stderr).trim();
      if (isBotProtectionError(botErr)) {
        console.warn("[Analyzer] YouTube bot protection. Trying Invidious fallback instances...");
        let attempts = 0;
        for (const instance of INVIDIOUS_INSTANCES) {
          if (attempts >= 3) break; // limit to 3 instances to save time
          attempts++;
          const invUrl = toInvidiousUrl(trimmed, instance);
          if (!invUrl) break;
          console.log(`[Analyzer] Trying Invidious: ${instance}`);
          try {
            const invResult = await runWithTimeout([
              "--ffmpeg-location", FFMPEG_PATH,
              "--dump-single-json", "--no-warnings", "--no-playlist", "--skip-download",
              "--socket-timeout", "10",
              invUrl,
            ], 15000);
            if (invResult.code === 0 && invResult.stdout.length > 10) {
              console.log(`[Analyzer] Invidious fallback succeeded: ${instance}`);
              code = 0;
              stdout = invResult.stdout as any;
              stderr = invResult.stderr as any;
              break;
            }
            console.warn(`[Analyzer] ${instance} failed:`, new TextDecoder().decode(invResult.stderr).slice(0, 120));
          } catch (e) {
            console.warn(`[Analyzer] ${instance} exception:`, e);
          }
        }
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    if (code !== 0) {
      // Piped fallback
      const pipedData = await fallbackPipedAPI(trimmed);
      if (pipedData) return pipedData;

      const errText = new TextDecoder().decode(stderr).trim();
      console.error("yt-dlp error:", errText);

      const lower = errText.toLowerCase();
      if (lower.includes("not a bot") || lower.includes("sign in to confirm") || lower.includes("confirm you") || lower.includes("requested format is not available")) {
        throw new Error("YouTube Cloud Protection triggered on Render: YouTube restricts automated requests from cloud datacenters. Quick fix: Go to Settings > Platform Cookies, paste your cookies.txt from YouTube (using 'Get cookies.txt LOCALLY' Chrome extension), and click Save.");
      }
      if (errText.includes("Private video") || errText.includes("Sign in if you've been granted access")) {
        throw new Error("This video is private or requires authentication to access.");
      }
      if (errText.includes("Video unavailable") || errText.includes("This video has been removed")) {
        throw new Error("This video is unavailable or has been removed from the platform.");
      }
      if (errText.includes("DRM") || errText.includes("protected")) {
        throw new Error("This video is protected by DRM and cannot be downloaded.");
      }
      if (errText.includes("HTTP Error 403")) {
        throw new Error("Access forbidden (HTTP 403). The platform is restricting direct automated requests. Please add cookies.txt in Settings.");
      }
      if (errText.includes("HTTP Error 404")) {
        throw new Error("Video not found (HTTP 404). Please check the link and try again.");
      }
      if (errText.includes("Unsupported URL") || errText.includes("no suitable extractor")) {
        throw new Error("Unsupported website or video format. Please verify the URL points to a supported platform.");
      }

      const firstLine = errText.trim() ? errText.split("\n")[0] : "No error output from yt-dlp (Timeout because of Cloud IP block).";
      throw new Error(`Extraction failed: ${firstLine.replace(/^ERROR:\s*/, "")}`);
    }

    const jsonStr = new TextDecoder().decode(stdout);
    let data: any;
    try {
      data = JSON.parse(jsonStr);
    } catch (_err) {
      throw new Error("Received malformed metadata from extractor.");
    }

    return await this.parseMetadata(data, trimmed);
  }

  private async parseMetadata(data: any, originalUrl: string): Promise<VideoMetadata> {
    const rawFormats: any[] = Array.isArray(data.formats) ? data.formats : [];
    const duration = typeof data.duration === "number" ? data.duration : 0;

    // Probe dimensions if yt-dlp did not return height (e.g. for direct video links)
    let hasKnownHeight = typeof data.height === "number" && data.height > 0;
    if (!hasKnownHeight) {
      hasKnownHeight = rawFormats.some((f) => typeof f.height === "number" && f.height > 0);
    }
    if (!hasKnownHeight) {
      const probed = await probeMediaDimensions(originalUrl);
      if (probed && probed.height) {
        data.height = probed.height;
        if (probed.width) data.width = probed.width;
        if (probed.fps && !data.fps) data.fps = probed.fps;
        for (const f of rawFormats) {
          if (!f.height) f.height = probed.height;
          if (!f.width && probed.width) f.width = probed.width;
          if (!f.fps && probed.fps) f.fps = probed.fps;
        }
      }
    }

    // Check if standard HTTP progressive / DASH audio streams exist
    const hasStandardAudio = rawFormats.some(
      (f) => (f.vcodec === "none" || !f.vcodec) && f.acodec && f.acodec !== "none" && (!f.protocol || !f.protocol.includes("m3u8"))
    );

    const rawAudioStreams = rawFormats.filter((f) => {
      const isAudio = (f.vcodec === "none" || !f.vcodec) && f.acodec && f.acodec !== "none";
      if (!isAudio) return false;
      // Skip m3u8 audio manifests when clean HTTP audio streams exist
      if (hasStandardAudio && f.protocol && f.protocol.includes("m3u8")) return false;
      return true;
    });

    // Identify best audio stream size and bitrate to combine with video-only streams
    let bestAudioBytes = 0;
    let bestAudioBitrate = 0;
    let bestAudioFormatId = "";

    for (const a of rawAudioStreams) {
      const abr = a.abr || a.tbr || 0;
      if (abr > bestAudioBitrate) {
        bestAudioBitrate = abr;
        bestAudioFormatId = a.format_id;
        bestAudioBytes = a.filesize || a.filesize_approx || (duration > 0 && abr > 0 ? (abr * 1000 * duration) / 8 : 0);
      }
    }

    // Check if standard HTTP progressive / DASH video streams exist
    const hasStandardHttpVideo = rawFormats.some(
      (f) => f.vcodec && f.vcodec !== "none" && (!f.protocol || !f.protocol.includes("m3u8"))
    );

    // Calculate authentic maximum resolution of the source video
    let maxSourceRes = 0;
    if (typeof data.height === "number" && data.height > 0) {
      maxSourceRes = data.height;
    }
    for (const f of rawFormats) {
      const isAudioOnly = (f.vcodec === "none" && !f.height && !f.width) || (f.acodec && !f.vcodec && !f.height && !f.width);
      if (isAudioOnly) continue;
      const h = f.height || 0;
      const w = f.width || 0;
      if (h <= 0 && w <= 0) continue;
      const minDim = (w && h) ? Math.min(w, h) : h;
      const maxDim = (w && h) ? Math.max(w, h) : (w || h);

      let res = 0;
      if (maxDim >= 6000 || minDim >= 3500 || h >= 3500) res = 4320;
      else if (maxDim >= 3200 || minDim >= 1800 || h >= 1800) res = 2160;
      else if (maxDim >= 2200 || minDim >= 1300 || h >= 1300) res = 1440;
      else if (maxDim >= 1700 || minDim >= 900 || h >= 900) res = 1080;
      else if (maxDim >= 1100 || minDim >= 600 || h >= 600) res = 720;
      else if (maxDim >= 750 || minDim >= 400 || h >= 400) res = 480;
      else if (maxDim >= 550 || minDim >= 300 || h >= 300) res = 360;
      else if (maxDim >= 350 || minDim >= 200 || h >= 200) res = 240;
      else if (h > 0) res = h;

      if (res > maxSourceRes) maxSourceRes = res;
    }

    if (maxSourceRes === 0 && typeof data.resolution === "string") {
      const parts = data.resolution.split("x");
      if (parts.length === 2) {
        const parsedH = parseInt(parts[1], 10);
        if (parsedH > 0) maxSourceRes = parsedH;
      }
    }

    // Process Video Formats
    const videoFormatMap = new Map<string, VideoFormatOption>();

    for (const f of rawFormats) {
      const isAudioOnly = (f.vcodec === "none" && !f.height && !f.width) || (f.acodec && !f.vcodec && !f.height && !f.width);
      if (isAudioOnly) continue;

      const isVideoExt = ["mp4", "webm", "mkv", "mov", "avi", "flv", "m4v", "ogv", "3gp", "ts"].includes((f.ext || "").toLowerCase()) ||
                         ["mp4", "webm", "mkv", "mov"].includes((f.video_ext || "").toLowerCase());
      const hasVideoCodec = Boolean(f.vcodec && f.vcodec !== "none");
      const hasDimensions = Boolean((f.height && f.height > 0) || (f.width && f.width > 0));
      const hasVideo = hasVideoCodec || hasDimensions || isVideoExt || Boolean(data.direct);
      if (!hasVideo) continue;

      const width = f.width || null;
      const height = f.height || null;
      const fps = f.fps || null;
      const hasDirectAudio = Boolean(f.acodec && f.acodec !== "none") || Boolean(data.direct);
      const needsAudioMerge = !hasDirectAudio && bestAudioFormatId !== "";

      // Standard resolution categorization (handles both 16:9 and widescreen aspect ratios)
      let standardRes = 0;
      let resolutionLabel = "Source Stream";

      const maxDim = (width && height) ? Math.max(width, height) : (width || height || 0);
      const minDim = (width && height) ? Math.min(width, height) : (height || 0);

      if (maxDim >= 6000 || minDim >= 3500 || (height && height >= 3500)) {
        standardRes = 4320;
        resolutionLabel = "8K Ultra HD (4320p)";
      } else if (maxDim >= 3200 || minDim >= 1800 || (height && height >= 1800)) {
        standardRes = 2160;
        resolutionLabel = "4K Ultra HD (2160p)";
      } else if (maxDim >= 2200 || minDim >= 1300 || (height && height >= 1300)) {
        standardRes = 1440;
        resolutionLabel = "1440p Quad HD (2K)";
      } else if (maxDim >= 1700 || minDim >= 900 || (height && height >= 900)) {
        standardRes = 1080;
        resolutionLabel = "1080p Full HD";
      } else if (maxDim >= 1100 || minDim >= 600 || (height && height >= 600)) {
        standardRes = 720;
        resolutionLabel = "720p HD";
      } else if (maxDim >= 750 || minDim >= 400 || (height && height >= 400)) {
        standardRes = 480;
        resolutionLabel = "480p SD";
      } else if (maxDim >= 550 || minDim >= 300 || (height && height >= 300)) {
        standardRes = 360;
        resolutionLabel = "360p Data Saver";
      } else if (maxDim >= 350 || minDim >= 200 || (height && height >= 200)) {
        standardRes = 240;
        resolutionLabel = "240p Mobile";
      } else if (maxDim >= 180 || minDim >= 100 || (height && height >= 100)) {
        standardRes = 144;
        resolutionLabel = "144p Ultra Low";
      } else if (height) {
        standardRes = height;
        resolutionLabel = `${height}p`;
      }

      if (standardRes > maxSourceRes) {
        maxSourceRes = standardRes;
      }

      if (fps && fps > 30) {
        resolutionLabel += ` ${Math.round(fps)}fps`;
      }

      const rawExt = (f.ext || "mp4").toLowerCase();
      const container = ["mp4", "webm", "mkv", "mov", "avi"].includes(rawExt) ? rawExt : "mp4";
      const videoCodec = cleanCodec(f.vcodec, container);
      const audioCodec = hasDirectAudio ? cleanCodec(f.acodec) : (bestAudioFormatId ? "AAC / Opus (Merged)" : "Audio Included");

      // Approximate filesize using accurate video + audio bytes
      let vBytes = f.filesize || f.filesize_approx || null;
      if (!vBytes && duration > 0 && f.tbr) {
        vBytes = Math.round((f.tbr * 1000 * duration) / 8);
      } else if (!vBytes && duration > 0 && f.vbr) {
        vBytes = Math.round((f.vbr * 1000 * duration) / 8);
      }

      if (!vBytes || vBytes <= 0) {
        const effectiveSecs = duration > 0 ? duration : 300;
        const resForBitrate = standardRes || maxSourceRes || 480;
        const fallbackKbps = (resForBitrate >= 4320) ? 45000 :
                             (resForBitrate >= 2160) ? 20000 :
                             (resForBitrate >= 1440) ? 10000 :
                             (resForBitrate >= 1080) ? 5000 :
                             (resForBitrate >= 720) ? 2500 :
                             (resForBitrate >= 480) ? 1200 :
                             (resForBitrate >= 360) ? 700 :
                             (resForBitrate >= 240) ? 400 : 200;
        vBytes = Math.round((fallbackKbps * 1000 * effectiveSecs) / 8);
      }

      const effectiveAudioBytes = bestAudioBytes > 0 ? bestAudioBytes : Math.round((192 * 1000 * (duration > 0 ? duration : 300)) / 8);
      const totalApprox = (vBytes || 0) + (needsAudioMerge ? effectiveAudioBytes : 0);
      const finalFilesize = totalApprox > 0 ? totalApprox : Math.round((1200 * 1000 * (duration > 0 ? duration : 300)) / 8);

      const effectiveHeight = standardRes || height || (maxSourceRes > 0 ? maxSourceRes : 480);
      const formatOption: VideoFormatOption = {
        formatId: f.format_id,
        resolution: `${width || "?"}x${height || effectiveHeight || "?"}`,
        resolutionLabel: standardRes > 0 ? resolutionLabel : (height ? `${height}p` : `${effectiveHeight}p`),
        width,
        height: effectiveHeight,
        fps,
        videoCodec,
        audioCodec,
        hasAudio: true,
        needsAudioMerge,
        container,
        ext: container,
        filesize: finalFilesize,
        filesizeApprox: finalFilesize,
        filesizeFormatted: formatBytes(finalFilesize),
        bitrate: f.tbr || f.vbr || null,
      };

      const key = `${effectiveHeight}_${container}_${(videoCodec || "").toLowerCase()}`;
      videoFormatMap.set(key, formatOption);
    }

    // Standard spectrum qualities - ONLY up to the authentic max source resolution!
    // Never falsely display 8K, 4K, 1440p, or 1080p if the video was uploaded in 480p!
    // Features AV1 Next-Gen (State-of-the-Art visual quality at ~45% lower bitrate/size) for all resolutions!
    const STANDARD_SPECTRUM = [
      // 8K Ultra HD (4320p)
      { height: 4320, label: "8K Ultra HD (4320p)", bitrateKbps: 24000, container: "mp4", codec: "AV1 Next-Gen (Best Quality • Lowest Size)", formatId: "res_4320_av1", isAv1: true },

      // 4K Ultra HD (2160p)
      { height: 2160, label: "4K Ultra HD (2160p)", bitrateKbps: 11000, container: "mp4", codec: "AV1 Next-Gen (Best Quality • Lowest Size)", formatId: "res_2160_av1", isAv1: true },
      { height: 2160, label: "4K Ultra HD (2160p)", bitrateKbps: 20000, container: "mp4", codec: "VP9 / Universal (High Profile)", formatId: "res_2160", isAv1: false },

      // 1440p Quad HD (2K)
      { height: 1440, label: "1440p Quad HD (2K)", bitrateKbps: 5500, container: "mp4", codec: "AV1 Next-Gen (Best Quality • Lowest Size)", formatId: "res_1440_av1", isAv1: true },
      { height: 1440, label: "1440p Quad HD (2K)", bitrateKbps: 10000, container: "mp4", codec: "VP9 / Universal (High Profile)", formatId: "res_1440", isAv1: false },

      // 1080p Full HD
      { height: 1080, label: "1080p Full HD", bitrateKbps: 2800, container: "mp4", codec: "AV1 Next-Gen (Best Quality • Lowest Size)", formatId: "res_1080_av1", isAv1: true },
      { height: 1080, label: "1080p Full HD", bitrateKbps: 5000, container: "mp4", codec: "H.264 / AVC (Universal)", formatId: "res_1080", isAv1: false },

      // 720p HD
      { height: 720, label: "720p HD", bitrateKbps: 1400, container: "mp4", codec: "AV1 Next-Gen (Best Quality • Lowest Size)", formatId: "res_720_av1", isAv1: true },
      { height: 720, label: "720p HD", bitrateKbps: 2500, container: "mp4", codec: "H.264 / AVC (Universal)", formatId: "res_720", isAv1: false },

      // 480p SD
      { height: 480, label: "480p SD", bitrateKbps: 700, container: "mp4", codec: "AV1 Next-Gen (Best Quality • Lowest Size)", formatId: "res_480_av1", isAv1: true },
      { height: 480, label: "480p SD", bitrateKbps: 1200, container: "mp4", codec: "H.264 / AVC", formatId: "res_480", isAv1: false },

      // 360p Data Saver
      { height: 360, label: "360p Data Saver", bitrateKbps: 400, container: "mp4", codec: "AV1 Next-Gen (Best Quality • Lowest Size)", formatId: "res_360_av1", isAv1: true },
      { height: 360, label: "360p Data Saver", bitrateKbps: 700, container: "mp4", codec: "H.264 / AVC", formatId: "res_360", isAv1: false },

      // 240p Mobile
      { height: 240, label: "240p Mobile", bitrateKbps: 220, container: "mp4", codec: "AV1 Next-Gen (Best Quality • Lowest Size)", formatId: "res_240_av1", isAv1: true },
      { height: 240, label: "240p Mobile", bitrateKbps: 400, container: "mp4", codec: "H.264 / AVC", formatId: "res_240", isAv1: false },

      // 144p Ultra Low
      { height: 144, label: "144p Ultra Low", bitrateKbps: 120, container: "mp4", codec: "AV1 Next-Gen (Best Quality • Lowest Size)", formatId: "res_144_av1", isAv1: true },
      { height: 144, label: "144p Ultra Low", bitrateKbps: 200, container: "mp4", codec: "H.264 / AVC", formatId: "res_144", isAv1: false },
    ];

    for (const tier of STANDARD_SPECTRUM) {
      const isUnavailable = maxSourceRes > 0 && tier.height > maxSourceRes;

      const exists = Array.from(videoFormatMap.values()).some(
        (v) => (v.height || 0) === tier.height && (tier.isAv1 ? (v.videoCodec || "").includes("AV1") : !(v.videoCodec || "").includes("AV1"))
      );

      if (!exists || isUnavailable) {
        const effectiveSecs = duration > 0 ? duration : 300;
        const estBytes = Math.round((tier.bitrateKbps * 1000 * effectiveSecs) / 8);
        videoFormatMap.set(`tier_${tier.height}_${tier.formatId}`, {
          formatId: tier.formatId,
          resolution: tier.height >= 2160 ? `${Math.round(tier.height * 16 / 9)}x${tier.height}` : `Auto x ${tier.height}`,
          resolutionLabel: tier.label,
          width: Math.round(tier.height * 16 / 9),
          height: tier.height,
          fps: 60,
          videoCodec: tier.codec,
          audioCodec: "AAC Stereo 192k",
          hasAudio: true,
          needsAudioMerge: true,
          container: tier.container,
          ext: tier.container,
          filesize: estBytes,
          filesizeApprox: estBytes,
          filesizeFormatted: formatBytes(estBytes),
          bitrate: tier.bitrateKbps,
          isUnavailable: isUnavailable
        } as VideoFormatOption & { isUnavailable?: boolean });
      }
    }

    // Sort video formats strictly descending by resolution: Highest Quality first (8K -> 4K -> 1440p -> 1080p -> 720p -> 480p -> 360p -> 240p -> 144p)
    // Within the same resolution, AV1 (Best Quality • Lowest Size) is prioritized first!
    const videoFormats = Array.from(videoFormatMap.values()).sort((a, b) => {
      // 1. Highest resolution first
      const hDiff = (b.height || 0) - (a.height || 0);
      if (hDiff !== 0) return hDiff;

      // 2. AV1 Codec first within the same resolution (Highest Quality & Lowest File Size)
      const aIsAv1 = (a.videoCodec || "").includes("AV1") || a.formatId.includes("av1") ? 1 : 0;
      const bIsAv1 = (b.videoCodec || "").includes("AV1") || b.formatId.includes("av1") ? 1 : 0;
      if (aIsAv1 !== bIsAv1) return bIsAv1 - aIsAv1;

      // 3. Higher frame rate first
      const fpsDiff = (b.fps || 0) - (a.fps || 0);
      if (fpsDiff !== 0) return fpsDiff;

      // 4. Container: MP4 before WebM
      if (a.container === "mp4" && b.container !== "mp4") return -1;
      if (b.container === "mp4" && a.container !== "mp4") return 1;

      // 5. Higher bitrate first
      return (b.bitrate || 0) - (a.bitrate || 0);
    });

    // Mark Best Quality Video (highest available resolution)
    if (videoFormats.length > 0) {
      const bestAvailable = videoFormats.find(f => !f.isUnavailable);
      if (bestAvailable) bestAvailable.isBest = true;
    }

    // Mark Recommended Quality Video (AV1 Next-Gen: Highest Quality • Lowest Size):
    // If source has 1080p or higher: 1080p AV1 is recommended.
    // If source is lower than 1080p: The highest authentic AV1 format available is recommended!
    let recommendedVideo: VideoFormatOption | undefined;
    if (maxSourceRes >= 1080) {
      recommendedVideo = videoFormats.find((v) => !v.isUnavailable && (v.height || 0) === 1080 && ((v.videoCodec || "").includes("AV1") || v.formatId.includes("av1")));
    }
    if (!recommendedVideo) {
      // Choose highest available AV1 format
      recommendedVideo = videoFormats.find((v) => !v.isUnavailable && ((v.videoCodec || "").includes("AV1") || v.formatId.includes("av1")));
    }
    if (!recommendedVideo) {
      recommendedVideo = videoFormats.find((v) => !v.isUnavailable && v.container === "mp4") || videoFormats.find((v) => !v.isUnavailable);
    }
    if (recommendedVideo) {
      recommendedVideo.isRecommended = true;
    }

    // Process Complete Audio Studio Formats
    const audioFormats: AudioFormatOption[] = [];

    // 1. Source Original Audio
    const effectiveAudioDuration = duration > 0 ? duration : 300;
    const bestAudioStream = rawAudioStreams.find((s) => s.format_id === bestAudioFormatId) || rawAudioStreams[0];
    const rawAcodec = bestAudioStream?.acodec && bestAudioStream.acodec !== "none" ? bestAudioStream.acodec : "aac";
    const codec = cleanCodec(rawAcodec) || "AAC Stereo";
    const abr = bestAudioStream?.abr || bestAudioStream?.tbr || null;
    const asr = bestAudioStream?.asr || null;
    const ext = (bestAudioStream?.ext || "m4a").toLowerCase();
    const effectiveSourceAudioBytes = bestAudioBytes > 0 ? bestAudioBytes : Math.round((192 * 1000 * effectiveAudioDuration) / 8);

    audioFormats.push({
      formatId: bestAudioFormatId || "source_audio",
      type: "source",
      label: `Original Audio Stream (${codec})`,
      container: ext,
      ext,
      codec,
      bitrate: abr,
      bitrateFormatted: abr ? `${Math.round(abr)} kbps` : "Original source bitrate",
      sampleRate: asr,
      sampleRateFormatted: asr ? `${(asr / 1000).toFixed(1)} kHz` : "48.0 kHz",
      filesize: effectiveSourceAudioBytes,
      filesizeFormatted: formatBytes(effectiveSourceAudioBytes),
      isBest: true,
    });

    // Complete Audio Tiers
    const AUDIO_TIERS: { ext: string; codec: string; bitrate: number; label: string; isRec?: boolean }[] = [
      { ext: "mp3", codec: "MP3 (LAME CBR 320k)", bitrate: 320, label: "MP3 Studio Quality (320 kbps)", isRec: true },
      { ext: "mp3", codec: "MP3 (LAME CBR 256k)", bitrate: 256, label: "MP3 High Quality (256 kbps)" },
      { ext: "mp3", codec: "MP3 (LAME CBR 192k)", bitrate: 192, label: "MP3 Standard Quality (192 kbps)" },
      { ext: "mp3", codec: "MP3 (LAME CBR 128k)", bitrate: 128, label: "MP3 Voice / Podcast (128 kbps)" },
      { ext: "m4a", codec: "AAC (High Bitrate)", bitrate: 256, label: "M4A / AAC (256 kbps - Apple / Mobile)" },
      { ext: "m4a", codec: "AAC (Standard)", bitrate: 128, label: "M4A / AAC (128 kbps - High Efficiency)" },
      { ext: "wav", codec: "PCM 16-bit 44.1kHz", bitrate: 1411, label: "WAV Audio (Lossless Uncompressed PCM)" },
      { ext: "flac", codec: "FLAC 24-bit Hi-Res", bitrate: 960, label: "FLAC Lossless (Studio Master Audio)" },
      { ext: "opus", codec: "Opus Audio", bitrate: 160, label: "Opus Next-Gen (160 kbps - Ultra Efficient)" },
    ];

    for (const at of AUDIO_TIERS) {
      const approxBytes = Math.round((at.bitrate * 1000 * effectiveAudioDuration) / 8);
      audioFormats.push({
        formatId: `audio_${at.ext}_${at.bitrate}`,
        type: "convert",
        label: at.label,
        container: at.ext,
        ext: at.ext,
        codec: at.codec,
        bitrate: at.bitrate,
        bitrateFormatted: `${at.bitrate} kbps${at.ext === 'wav' || at.ext === 'flac' ? ' (Lossless)' : ''}`,
        sampleRate: at.ext === "wav" ? 44100 : 48000,
        sampleRateFormatted: at.ext === "wav" ? "44.1 kHz" : "48.0 kHz",
        filesize: approxBytes,
        filesizeFormatted: formatBytes(approxBytes),
        isRecommended: at.isRec,
      });
    }

    // Thumbnail selection
    let thumbnail = data.thumbnail || "";
    if (Array.isArray(data.thumbnails) && data.thumbnails.length > 0) {
      // Pick highest resolution thumbnail
      const sortedThumbs = [...data.thumbnails].sort(
        (a, b) => ((b.width || 0) * (b.height || 0)) - ((a.width || 0) * (a.height || 0))
      );
      if (sortedThumbs[0] && sortedThumbs[0].url) {
        thumbnail = sortedThumbs[0].url;
      }
    }

    return {
      id: String(data.id || Date.now()),
      url: originalUrl,
      title: data.title || "Untitled Video",
      description: data.description ? data.description.slice(0, 300) : "",
      uploader: data.uploader || data.channel || data.creator || "Unknown Creator",
      uploaderUrl: data.uploader_url || data.channel_url || undefined,
      channel: data.channel || data.uploader,
      duration,
      durationFormatted: formatDuration(duration),
      thumbnail,
      viewCount: data.view_count,
      extractor: data.extractor || "generic",
      extractorKey: data.extractor_key || "Generic",
      uploadDate: data.upload_date,
      videoFormats,
      audioFormats,
      bestVideoFormat: videoFormats.find(f => !f.isUnavailable) || videoFormats[0],
      recommendedVideoFormat: recommendedVideo,
      bestAudioFormat: audioFormats[0],
      isDirectLink: Boolean(data.direct),
      maxSourceRes,
      maxSourceResLabel: maxSourceRes > 0 ? (maxSourceRes >= 4320 ? "8K Ultra HD" : maxSourceRes >= 2160 ? "4K Ultra HD" : maxSourceRes >= 1440 ? "1440p Quad HD" : `${maxSourceRes}p Full HD`) : "Standard",
    };
  }
}

export const videoAnalyzer = new VideoAnalyzer();


