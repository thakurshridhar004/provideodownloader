import { join, extname, dirname, basename } from "https://deno.land/std@0.224.0/path/mod.ts";
import { videoAnalyzer, getCookieFilePath } from "./analyzer.ts";
import { queueManager } from "./queue.ts";
import { historyManager } from "./history.ts";
import { settingsManager } from "./settings.ts";

const PORT = parseInt(Deno.env.get("PORT") || "3000", 10);
const ROOT_DIR = import.meta.dirname ? join(import.meta.dirname, "..") : Deno.cwd();
const PUBLIC_DIR = join(ROOT_DIR, "public");

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".opus": "audio/opus",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
};

async function streamMediaFile(filePath: string, req: Request): Promise<Response> {
  try {
    const fileInfo = await Deno.stat(filePath);
    if (!fileInfo.isFile) return new Response("Not a file", { status: 404 });

    const ext = extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "video/mp4";
    const fileSize = fileInfo.size;
    const rangeHeader = req.headers.get("range");

    if (req.method === "HEAD") {
      return new Response(null, {
        status: 200,
        headers: {
          "Content-Length": String(fileSize),
          "Content-Type": contentType,
          "Accept-Ranges": "bytes",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    if (rangeHeader) {
      const parts = rangeHeader.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;

      const file = await Deno.open(filePath, { read: true });
      await file.seek(start, Deno.SeekMode.Start);

      let bytesSent = 0;
      const limitedStream = file.readable.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, controller) {
            if (bytesSent >= chunkSize) {
              controller.terminate();
              return;
            }
            const remaining = chunkSize - bytesSent;
            if (chunk.byteLength <= remaining) {
              bytesSent += chunk.byteLength;
              controller.enqueue(chunk);
              if (bytesSent >= chunkSize) {
                controller.terminate();
              }
            } else {
              controller.enqueue(chunk.subarray(0, remaining));
              bytesSent += remaining;
              controller.terminate();
            }
          },
        })
      );

      return new Response(limitedStream, {
        status: 206,
        headers: {
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": String(chunkSize),
          "Content-Type": contentType,
          "Access-Control-Allow-Origin": "*",
        },
      });
    } else {
      const file = await Deno.open(filePath, { read: true });
      return new Response(file.readable, {
        status: 200,
        headers: {
          "Content-Length": String(fileSize),
          "Content-Type": contentType,
          "Accept-Ranges": "bytes",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
  } catch (err) {
    console.error("Stream error:", err);
    return new Response("Media file not found or inaccessible", { status: 404 });
  }
}

function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}

async function serveStatic(pathname: string): Promise<Response> {
  let filePath = pathname === "/" ? "/index.html" : pathname;
  const fullPath = join(PUBLIC_DIR, filePath);

  try {
    const fileInfo = await Deno.stat(fullPath);
    if (fileInfo.isDirectory) {
      return serveStatic(join(filePath, "index.html"));
    }

    const ext = extname(fullPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    const data = await Deno.readFile(fullPath);

    return new Response(data, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(data.length),
        "Cache-Control": "no-cache",
      },
    });
  } catch (_e) {
    try {
      const fallbackData = await Deno.readFile(join(PUBLIC_DIR, "index.html"));
      return new Response(fallbackData, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Length": String(fallbackData.length),
        },
      });
    } catch (_err2) {
      return new Response("Not Found", { status: 404 });
    }
  }
}

async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const pathname = url.pathname;
  const method = req.method;

  // Handle CORS preflight
  if (method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  // --- API ROUTES ---

  // Health
  if (pathname === "/api/health" && method === "GET") {
    return jsonResponse({ status: "healthy", timestamp: Date.now() });
  }

  // Analyze URL
  if (pathname === "/api/analyze" && method === "POST") {
    try {
      const body = await req.json();
      if (!body.url) {
        return errorResponse("URL is required.");
      }
      const metadata = await videoAnalyzer.analyzeUrl(body.url);
      return jsonResponse(metadata);
    } catch (err: any) {
      return errorResponse(err.message || "Failed to analyze URL.");
    }
  }

  // Fetch Playlist / Channel video list
  if (pathname === "/api/playlist/info" && method === "POST") {
    try {
      const body = await req.json();
      if (!body.url) return errorResponse("URL is required.");

      const ytdlpPath = join(ROOT_DIR, "bin", "yt-dlp.exe");
      // Use --flat-playlist to quickly get list of entries without downloading
      const args = [
        "--force-ipv4",
        "--flat-playlist",
        "--yes-playlist",
        "--print", "%(id)s\t%(title)s\t%(duration)s\t%(thumbnail)s\t%(webpage_url)s",
        "--no-warnings",
        "--no-playlist-reverse",
      ];
      
      const { getCookieFilePath } = await import("./analyzer.ts");
      const cookieFile = getCookieFilePath();
      if (cookieFile) {
        args.push("--cookies", cookieFile);
      }
      args.push(body.url);

      const proc = new Deno.Command(ytdlpPath, {
        args,
        stdout: "piped",
        stderr: "piped",
        stdin: "null",
      });
      const { code, stdout, stderr } = await proc.output();
      const out = new TextDecoder().decode(stdout).trim();
      const errOut = new TextDecoder().decode(stderr).trim();

      if (code !== 0 && !out) {
        return errorResponse(`yt-dlp error: ${errOut.slice(0, 300)}`);
      }

      const entries = out.split("\n").filter(Boolean).map((line) => {
        const parts = line.split("\t");
        return {
          id: parts[0] || "",
          title: parts[1] || "Untitled",
          duration: parts[2] || "",
          thumbnail: parts[3] || "",
          url: parts[4] || `https://www.youtube.com/watch?v=${parts[0]}`,
        };
      });

      return jsonResponse({ success: true, count: entries.length, entries });
    } catch (err: any) {
      return errorResponse(err.message || "Failed to fetch playlist.");
    }
  }


  // Get active queue
  if (pathname === "/api/downloads" && method === "GET") {
    const host = req.headers.get("host") || "";
    const isLocalhost = host.startsWith("localhost") || host.startsWith("127.0.0.1") || host.startsWith("[::1]");
    const clientId = url.searchParams.get("clientId");
    const allItems = queueManager.getItems();

    if (!isLocalhost) {
      if (!clientId) return jsonResponse({ items: [] });
      return jsonResponse({ items: allItems.filter((i: any) => i.clientId === clientId) });
    }
    return jsonResponse({ items: allItems });
  }

  // Enqueue new download
  if (pathname === "/api/downloads/queue" && method === "POST") {
    try {
      const body = await req.json();
      const result = queueManager.enqueue(body);
      if (!result.success) {
        return errorResponse(result.error || "Failed to enqueue item.");
      }
      return jsonResponse({ success: true, item: result.item, alreadyQueued: (result as any).alreadyQueued });
    } catch (err: any) {
      return errorResponse(err.message || "Invalid payload.");
    }
  }

  // Cancel item
  const cancelMatch = pathname.match(/^\/api\/downloads\/([^/]+)\/cancel$/);
  if (cancelMatch && method === "POST") {
    const id = cancelMatch[1];
    const ok = queueManager.cancel(id);
    return jsonResponse({ success: ok });
  }

  // Pause item
  const pauseMatch = pathname.match(/^\/api\/downloads\/([^/]+)\/pause$/);
  if (pauseMatch && method === "POST") {
    const id = pauseMatch[1];
    const ok = queueManager.pause(id);
    return jsonResponse({ success: ok });
  }

  // Resume item
  const resumeMatch = pathname.match(/^\/api\/downloads\/([^/]+)\/resume$/);
  if (resumeMatch && method === "POST") {
    const id = resumeMatch[1];
    const ok = queueManager.resume(id);
    return jsonResponse({ success: ok });
  }

  // Retry item
  const retryMatch = pathname.match(/^\/api\/downloads\/([^/]+)\/retry$/);
  if (retryMatch && method === "POST") {
    const id = retryMatch[1];
    const ok = queueManager.retry(id);
    return jsonResponse({ success: ok });
  }

  // Remove item from queue
  const removeMatch = pathname.match(/^\/api\/downloads\/([^/]+)$/);
  if (removeMatch && method === "DELETE") {
    const id = removeMatch[1];
    const ok = queueManager.remove(id);
    return jsonResponse({ success: ok });
  }

  // Clear completed downloads from queue
  if (pathname === "/api/downloads/clear-completed" && method === "POST") {
    queueManager.clearCompleted();
    return jsonResponse({ success: true });
  }

  // Clear all from queue
  if (pathname === "/api/downloads/clear-all" && method === "POST") {
    queueManager.clearAll();
    return jsonResponse({ success: true });
  }

  // Server-Sent Events (SSE) stream for real-time progress
  if (pathname === "/api/downloads/events" && method === "GET") {
    let subscriber: ((event: any) => void) | null = null;
    let pingTimer: number | null = null;

    const stream = new ReadableStream({
      start(controller) {
        subscriber = (eventData: any) => {
          try {
            const data = `data: ${JSON.stringify(eventData)}\n\n`;
            controller.enqueue(new TextEncoder().encode(data));
          } catch (_e) {
            // Client closed stream
          }
        };
        queueManager.subscribe(subscriber);

        // Keep-alive heartbeat ping every 15s to prevent Cloudflare tunnel 100s timeout
        pingTimer = setInterval(() => {
          try {
            controller.enqueue(new TextEncoder().encode(": ping\n\n"));
          } catch (_e) {
            if (pingTimer) clearInterval(pingTimer);
          }
        }, 15000);
      },
      cancel() {
        if (pingTimer) {
          clearInterval(pingTimer);
        }
        if (subscriber) {
          queueManager.unsubscribe(subscriber);
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  // History routes
  if (pathname === "/api/history" && method === "GET") {
    const host = req.headers.get("host") || "";
    const isLocalhost = host.startsWith("localhost") || host.startsWith("127.0.0.1") || host.startsWith("[::1]");
    const clientId = url.searchParams.get("clientId");
    const allHistory = historyManager.getHistory();

    if (!isLocalhost) {
      // Remote visitors ONLY see their own downloads
      if (!clientId) return jsonResponse({ history: [] });
      return jsonResponse({ history: allHistory.filter((h: any) => h.clientId === clientId) });
    }
    return jsonResponse({ history: allHistory });
  }

  const deleteHistoryMatch = pathname.match(/^\/api\/history\/([^/]+)$/);
  if (deleteHistoryMatch && method === "DELETE") {
    const id = deleteHistoryMatch[1];
    const ok = historyManager.removeItem(id);
    return jsonResponse({ success: ok });
  }

  if (pathname === "/api/history" && method === "DELETE") {
    historyManager.clearAll();
    return jsonResponse({ success: true });
  }

  // Settings routes
  if (pathname === "/api/settings" && method === "GET") {
    const host = req.headers.get("host") || "";
    const isLocalhost = host.startsWith("localhost") || host.startsWith("127.0.0.1") || host.startsWith("[::1]");
    const s = settingsManager.getSettings();
    if (!isLocalhost) {
      // Hide local Windows paths from remote users
      return jsonResponse({
        ...s,
        downloadPath: "Downloads (Default)",
      });
    }
    return jsonResponse(s);
  }

  if (pathname === "/api/settings" && method === "POST") {
    try {
      const body = await req.json();
      const updated = settingsManager.updateSettings(body);
      return jsonResponse(updated);
    } catch (err: any) {
      return errorResponse(err.message || "Failed to update settings.");
    }
  }

  // Cookies management routes
  if (pathname === "/api/cookies/status" && method === "GET") {
    const cp = getCookieFilePath();
    if (!cp) {
      return jsonResponse({ configured: false, path: null, size: 0 });
    }
    try {
      const s = Deno.statSync(cp);
      return jsonResponse({
        configured: true,
        path: cp,
        size: s.size,
        modifiedAt: s.mtime ? s.mtime.toISOString() : null,
      });
    } catch (_e) {
      return jsonResponse({ configured: false, path: null, size: 0 });
    }
  }

  if (pathname === "/api/cookies/save" && method === "POST") {
    try {
      const body = await req.json();
      if (!body.content || typeof body.content !== "string") {
        return errorResponse("Cookie content is required.");
      }
      const target = join(ROOT_DIR, "cookies.txt");
      Deno.writeTextFileSync(target, body.content.trim());
      return jsonResponse({ success: true, path: target, size: body.content.trim().length });
    } catch (err: any) {
      return errorResponse(err.message || "Failed to save cookies.");
    }
  }

  if (pathname === "/api/cookies/delete" && method === "POST") {
    try {
      const cp = getCookieFilePath();
      if (cp && cp.startsWith(ROOT_DIR)) {
        Deno.removeSync(cp);
      }
      return jsonResponse({ success: true });
    } catch (err: any) {
      return errorResponse(err.message || "Failed to delete cookies.");
    }
  }

  // Stream media file for in-app browser playback
  if (pathname === "/api/media/stream" && method === "GET") {
    let filePath = url.searchParams.get("path");
    if (!filePath) return errorResponse("Path parameter is required.");

    if (!filePath.includes(":") && !filePath.startsWith("/")) {
      filePath = join(settingsManager.getSettings().downloadPath, filePath);
    }

    return await streamMediaFile(filePath, req);
  }

  // Direct Browser Download endpoint (saves directly to user's computer via browser)
  if (pathname === "/api/media/download" && method === "GET") {
    let filePath = url.searchParams.get("path");
    if (!filePath) return errorResponse("Path parameter is required.");

    if (!filePath.includes(":") && !filePath.startsWith("/")) {
      filePath = join(settingsManager.getSettings().downloadPath, filePath);
    }

    try {
      const fileInfo = await Deno.stat(filePath);
      if (!fileInfo.isFile) return errorResponse("Specified path is not a file.");

      const filename = basename(filePath);
      const file = await Deno.open(filePath, { read: true });
      return new Response(file.readable, {
        status: 200,
        headers: {
          "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
          "Content-Length": String(fileInfo.size),
          "Content-Type": "application/octet-stream",
        },
      });
    } catch (_err) {
      return errorResponse("File not found or cannot be read.");
    }
  }

  // List all downloaded files on disk
  if (pathname === "/api/system/downloads-files" && method === "GET") {
    const host = req.headers.get("host") || "";
    const isLocalhost = host.startsWith("localhost") || host.startsWith("127.0.0.1") || host.startsWith("[::1]");
    if (!isLocalhost) return errorResponse("Action restricted to host PC.");
    try {
      const defaultDownloadDir = settingsManager.getSettings().downloadPath || join(ROOT_DIR, "downloads");
      const files: any[] = [];

      try {
        for (const entry of Deno.readDirSync(defaultDownloadDir)) {
          if (entry.isFile && !entry.name.endsWith(".part") && !entry.name.endsWith(".ytdl")) {
            try {
              const fullPath = join(defaultDownloadDir, entry.name).replaceAll("/", "\\");
              const stat = Deno.statSync(fullPath);
              const ext = entry.name.split(".").pop()?.toLowerCase() || "";
              const size = stat.size || 0;
              const formatUnits = ["B", "KB", "MB", "GB"];
              let s = size;
              let uIdx = 0;
              while (s >= 1024 && uIdx < formatUnits.length - 1) {
                s /= 1024;
                uIdx++;
              }
              const sizeFormatted = `${s.toFixed(1)} ${formatUnits[uIdx]}`;

              files.push({
                name: entry.name,
                path: fullPath,
                size,
                sizeFormatted,
                ext,
                mtime: stat.mtime ? stat.mtime.getTime() : Date.now(),
              });
            } catch (_statErr) {
              // ignore
            }
          }
        }
      } catch (_readErr) {
        // ignore
      }

      files.sort((a, b) => b.mtime - a.mtime);

      return jsonResponse({
        success: true,
        folder: defaultDownloadDir.replaceAll("/", "\\"),
        count: files.length,
        files,
      });
    } catch (err: any) {
      return errorResponse(err.message || "Failed to list downloaded files.");
    }
  }

  // System actions (open folder / open file in Windows)
  if (pathname === "/api/system/open-folder" && method === "POST") {
    const host = req.headers.get("host") || "";
    const isLocalhost = host.startsWith("localhost") || host.startsWith("127.0.0.1") || host.startsWith("[::1]");
    if (!isLocalhost) return errorResponse("Action restricted to host PC.");
    try {
      const body = await req.json().catch(() => ({}));
      const defaultDownloadDir = settingsManager.getSettings().downloadPath || join(ROOT_DIR, "downloads");
      let targetPath = (body.path && typeof body.path === "string" ? body.path.trim() : "") || defaultDownloadDir;

      if (targetPath === "undefined" || targetPath === "null") {
        targetPath = defaultDownloadDir;
      }

      targetPath = targetPath.replaceAll("/", "\\");

      if (!targetPath.includes(":") && !targetPath.startsWith("\\\\")) {
        targetPath = join(defaultDownloadDir, targetPath).replaceAll("/", "\\");
      }

      let isFile = false;
      let finalDir = targetPath;
      let fileToSelect: string | null = null;

      try {
        const stat = await Deno.stat(targetPath);
        if (stat.isFile) {
          isFile = true;
          fileToSelect = targetPath;
          finalDir = dirname(targetPath).replaceAll("/", "\\");
        } else if (stat.isDirectory) {
          finalDir = targetPath;
        }
      } catch (_e) {
        try {
          const parent = dirname(targetPath).replaceAll("/", "\\");
          const pStat = await Deno.stat(parent);
          if (pStat.isDirectory) {
            finalDir = parent;
          } else {
            finalDir = defaultDownloadDir.replaceAll("/", "\\");
          }
        } catch (_e2) {
          finalDir = defaultDownloadDir.replaceAll("/", "\\");
        }
      }

      try {
        Deno.mkdirSync(finalDir, { recursive: true });
      } catch (_err) {
        // ignore
      }

      console.log(`[System] Opening in Explorer: isFile=${isFile}, file=${fileToSelect}, folder=${finalDir}`);

      // Open Windows Explorer using explorer.exe directly via PowerShell
      // We use PowerShell Start-Process to ensure it escapes the background service session 
      // and appears on the user's interactive desktop.
      try {
        let psArgs: string[];
        if (isFile && fileToSelect) {
          psArgs = ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", `Start-Process 'explorer.exe' -ArgumentList '/select,"${fileToSelect.replaceAll('"', '`"')}"'`];
        } else {
          psArgs = ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", `Start-Process 'explorer.exe' -ArgumentList '"${finalDir.replaceAll('"', '`"')}"'`];
        }

        const p = new Deno.Command("powershell.exe", {
          args: psArgs,
          stdout: "null", stderr: "null", stdin: "null",
        }).spawn();
        if (p.unref) p.unref();
      } catch (procErr) {
        console.error("[System] Explorer spawn error:", procErr);
      }

      // Read files currently in this directory
      const folderFiles: any[] = [];
      try {
        for (const entry of Deno.readDirSync(finalDir)) {
          if (entry.isFile && !entry.name.endsWith(".part") && !entry.name.endsWith(".ytdl")) {
            try {
              const fullPath = join(finalDir, entry.name).replaceAll("/", "\\");
              const stat = Deno.statSync(fullPath);
              const ext = entry.name.split(".").pop()?.toLowerCase() || "";
              const size = stat.size || 0;
              const formatUnits = ["B", "KB", "MB", "GB"];
              let s = size;
              let uIdx = 0;
              while (s >= 1024 && uIdx < formatUnits.length - 1) {
                s /= 1024;
                uIdx++;
              }
              const sizeFormatted = `${s.toFixed(1)} ${formatUnits[uIdx]}`;

              folderFiles.push({
                name: entry.name,
                path: fullPath,
                size,
                sizeFormatted,
                ext,
                mtime: stat.mtime ? stat.mtime.getTime() : Date.now(),
              });
            } catch (_statErr) {
              // ignore
            }
          }
        }
      } catch (_readErr) {
        // ignore
      }
      folderFiles.sort((a, b) => b.mtime - a.mtime);

      return jsonResponse({
        success: true,
        folder: finalDir,
        file: fileToSelect,
        count: folderFiles.length,
        files: folderFiles,
        message: isFile ? `Selected in Explorer: ${fileToSelect}` : `Opened folder: ${finalDir}`,
      });
    } catch (err: any) {
      console.error("[System] open-folder error:", err);
      return errorResponse(err.message || "Failed to open folder.");
    }
  }

  if (pathname === "/api/system/open-file" && method === "POST") {
    const host = req.headers.get("host") || "";
    const isLocalhost = host.startsWith("localhost") || host.startsWith("127.0.0.1") || host.startsWith("[::1]");
    if (!isLocalhost) return errorResponse("Action restricted to host PC.");
    try {
      const body = await req.json();
      let targetPath = body.path;
      if (!targetPath) return errorResponse("Path is required.");

      // Check if file exists
      let exists = false;
      try {
        exists = (await Deno.stat(targetPath)).isFile;
      } catch (_e) {
        exists = false;
      }

      if (!exists) {
        // Fallback: check in default downloads folder
        const downloadDir = settingsManager.getSettings().downloadPath;
        const candidate = join(downloadDir, basename(targetPath));
        try {
          if ((await Deno.stat(candidate)).isFile) {
            targetPath = candidate;
            exists = true;
          }
        } catch (_e2) {
          exists = false;
        }
      }

      if (!exists) {
        return errorResponse(`File not found: ${targetPath}`);
      }

      if (Deno.build.os === "windows") {
        console.log(`[System] Opening file in default player: ${targetPath}`);
        const p = new Deno.Command("cmd.exe", {
          args: ["/c", "start", "", targetPath],
          stdout: "null",
          stderr: "null",
          stdin: "null",
        }).spawn();
        if (p.unref) p.unref();
      }
      return jsonResponse({ success: true, path: targetPath, message: `File ready on server` });
    } catch (err: any) {
      return errorResponse(err.message || "Failed to open file.");
    }
  }

  // Serve static UI assets
  return await serveStatic(pathname);
}

function startPotProviderServer() {
  if (Deno.build.os !== "windows") return;
  const potExe = join(ROOT_DIR, "bin", "bgutil-pot.exe");
  try {
    if (Deno.statSync(potExe).isFile) {
      console.log("Starting BGUtils POT Provider on port 4416...");
      const cmd = new Deno.Command(potExe, {
        args: ["server", "--port", "4416", "--host", "127.0.0.1"],
        stdout: "null",
        stderr: "null",
        stdin: "null",
      });
      const p = cmd.spawn();
      if (p.unref) p.unref();
    }
  } catch (err) {
    console.warn("Could not start POT provider:", err);
  }
}

startPotProviderServer();
console.log(`Starting Universal Video Downloader server on http://localhost:${PORT}...`);
Deno.serve({ port: PORT }, handleRequest);
