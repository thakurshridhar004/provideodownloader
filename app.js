import { API } from "./api.js?v=1.4";
import { UI } from "./ui.js?v=1.4";
import { sseClient } from "./sse.js?v=1.4";
import { themeManager } from "./theme.js?v=1.4";

class App {
  constructor() {
    this.currentMetadata = null;
    this.isAnalyzing = false;
    this.queueItems = [];
    this.historyItems = [];
    this.settings = null;
    this.clipboardCheckInterval = null;
    this.lastDetectedClipboardUrl = "";
  }

  async init() {
    this.bindNavigation();
    this.bindUrlInput();
    this.bindThemeToggle();
    this.bindQueueControls();
    this.bindHistoryControls();
    this.bindSettingsForm();
    this.bindFolderButtons();

    // Fetch initial settings
    await this.loadSettings();

    // Fetch initial queue and history
    await this.loadQueue();
    await this.loadHistory();

    // Setup SSE real-time listener
    this.setupSSE();

    // Setup auto-clipboard detection
    this.setupClipboardWatcher();

    // Privacy & Security: Hide local Windows folder buttons if accessed remotely
    this.applyPrivacyRestrictions();

    console.log("Downloader Pro initialized successfully.");
  }

  applyPrivacyRestrictions() {
    const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    if (!isLocalhost) {
      document.querySelectorAll(".download-location-banner, .btn-quick-open-folder, #header-open-folder-btn").forEach((el) => {
        el.style.display = "none";
      });
      const pathGroup = document.getElementById("setting-download-path")?.closest(".form-group");
      if (pathGroup) pathGroup.style.display = "none";
    }
  }

  // --- NAVIGATION ---
  bindNavigation() {
    const tabBtns = document.querySelectorAll(".nav-tab-btn");
    tabBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const targetId = btn.getAttribute("data-tab");
        this.switchTab(targetId);
      });
    });
  }

  switchTab(tabId) {
    document.querySelectorAll(".nav-tab-btn").forEach((b) => {
      b.classList.toggle("active", b.getAttribute("data-tab") === tabId);
    });

    document.querySelectorAll(".tab-pane").forEach((pane) => {
      pane.classList.toggle("active", pane.id === `tab-${tabId}`);
    });

    if (tabId === "queue") {
      this.loadQueue();
    } else if (tabId === "history") {
      this.loadHistory();
    } else if (tabId === "settings") {
      this.loadSettings();
    }
  }

  // --- THEME ---
  bindThemeToggle() {
    const btn = document.getElementById("theme-toggle-btn");
    if (btn) {
      btn.onclick = () => {
        const next = themeManager.toggleTheme();
        UI.showToast(`Switched to ${next} mode`, "info", 2000);
      };
    }
  }

  // --- URL INPUT & DETECTION ---
  bindUrlInput() {
    const input = document.getElementById("video-url-input");
    const analyzeBtn = document.getElementById("analyze-btn");
    const analyzePlaylistBtn = document.getElementById("analyze-playlist-btn");
    const pasteBtn = document.getElementById("paste-btn");
    const clearBtn = document.getElementById("clear-btn");
    const container = document.getElementById("url-input-container");

    if (!input || !analyzeBtn) return;

    this.initTextareaResize();

    // Ctrl+Enter submits analysis
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && e.ctrlKey) {
        e.preventDefault();
        this.handleAnalyze();
      }
    });

    // Real-time input validation feedback
    input.addEventListener("input", () => {
      const val = input.value.trim();
      container.classList.remove("is-valid", "is-invalid");
      if (!val) return;
      
      const lines = val.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      let allValid = true;
      let anyInvalid = false;
      
      for (const line of lines) {
        try {
          const u = new URL(line);
          if (u.protocol !== "http:" && u.protocol !== "https:") {
            anyInvalid = true;
            allValid = false;
          }
        } catch(e) {
          anyInvalid = true;
          allValid = false;
        }
      }

      if (allValid && lines.length > 0) {
        container.classList.add("is-valid");
      } else if (anyInvalid) {
        container.classList.add("is-invalid");
      }
    });

    // Analyze button click
    analyzeBtn.addEventListener("click", () => {
      this.handleAnalyze();
    });

    if (analyzePlaylistBtn) {
      analyzePlaylistBtn.addEventListener("click", () => {
        this.handleAnalyzePlaylist();
      });
    }

    // Make entire container click-to-focus and auto-paste if empty
    if (container) {
      container.addEventListener("click", (e) => {
        if (!e.target.closest("button")) {
          input.focus();
          if (!input.value.trim()) {
            this.checkClipboardForVideoUrl(true);
          }
        }
      });
    }

    // Auto-validate and focus on manual paste
    input.addEventListener("paste", () => {
      setTimeout(() => {
        const val = input.value.trim();
        if (val) {
          container.classList.remove("is-invalid");
          container.classList.add("is-valid");
        }
      }, 30);
    });

    // Paste button with mobile/desktop compatibility
    if (pasteBtn) {
      pasteBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        try {
          if (navigator.clipboard && navigator.clipboard.readText) {
            const text = (await navigator.clipboard.readText()).trim();
            if (text) {
              input.value = text;
              container.classList.remove("is-invalid");
              container.classList.add("is-valid");
              input.dispatchEvent(new Event("input"));
              UI.showToast("⚡ Link pasted from clipboard!", "success", 1800);
              this.handleAnalyze();
              return;
            } else {
              UI.showToast("Clipboard is empty. Please copy a video URL first.", "warning", 2500);
              input.focus();
              return;
            }
          }
        } catch (err) {
          console.warn("Clipboard access error:", err);
          input.focus();
          UI.showToast("🔒 Permission: Browser address bar me 🔒 Lock icon par click karke Clipboard 'Allow' karein, ya Ctrl+V dabayein.", "warning", 6000);
          return;
        }
        
        input.focus();
        UI.showToast("Press Ctrl+V (ya box par tap karke hold karein) to Paste", "info", 4000);
      });
    }

    // Clear button
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        input.value = "";
        container.classList.remove("is-valid", "is-invalid", "is-processing");
        input.focus();
        this.resetResults();
      });
    }

    // Drag and Drop
    if (container) {
      container.addEventListener("dragover", (e) => {
        e.preventDefault();
        container.classList.add("drag-active");
      });

      container.addEventListener("dragleave", (e) => {
        e.preventDefault();
        container.classList.remove("drag-active");
      });

      container.addEventListener("drop", (e) => {
        e.preventDefault();
        container.classList.remove("drag-active");

        const droppedText = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain");
        if (droppedText) {
          input.value = droppedText.trim();
          this.handleAnalyze();
        }
      });
    }

    // Chip quick links
    document.querySelectorAll(".chip-link").forEach((chip) => {
      chip.addEventListener("click", (e) => {
        e.preventDefault();
        const sampleUrl = chip.getAttribute("data-sample-url");
        if (sampleUrl) {
          input.value = sampleUrl;
          this.handleAnalyze();
        }
      });
    });
  }

  // Auto Clipboard Detection
  setupClipboardWatcher() {
    const triggerCheck = () => {
      if (this.settings && this.settings.autoClipboard !== false) {
        this.checkClipboardForVideoUrl(true);
      }
    };

    window.addEventListener("focus", triggerCheck);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        triggerCheck();
      }
    });

    // Also trigger on first interaction if input is still empty
    document.addEventListener("click", () => {
      const input = document.getElementById("video-url-input");
      if (input && !input.value.trim()) {
        triggerCheck();
      }
    }, { once: true });
  }

  async checkClipboardForVideoUrl(forceAutoPaste = false) {
    try {
      if (!navigator.clipboard || !navigator.clipboard.readText) return;
      const text = (await navigator.clipboard.readText()).trim();
      if (!text || text === this.lastDetectedClipboardUrl) return;

      const isLikelyVideoUrl =
        (text.startsWith("http://") || text.startsWith("https://")) &&
        (text.includes("youtube.com") ||
          text.includes("youtu.be") ||
          text.includes("vimeo.com") ||
          text.includes("tiktok.com") ||
          text.includes("instagram.com") ||
          text.includes("twitter.com") ||
          text.includes("x.com") ||
          text.includes("reddit.com") ||
          text.includes(".mp4") ||
          text.includes(".m3u8") ||
          text.includes(".webm"));

      if (isLikelyVideoUrl) {
        this.lastDetectedClipboardUrl = text;
        const input = document.getElementById("video-url-input");
        const container = document.getElementById("url-input-container");

        // If input is empty or auto-paste requested, paste directly & analyze!
        if (input && (!input.value.trim() || forceAutoPaste)) {
          input.value = text;
          if (container) {
            container.classList.remove("is-invalid");
            container.classList.add("is-valid");
          }
          UI.showToast("⚡ Link automatically pasted from clipboard!", "success", 2000);
          this.handleAnalyze();
        } else {
          this.showClipboardBanner(text);
        }
      }
    } catch (_e) {
      // Permission blocked by browser policy until user clicks
    }
  }

  showClipboardBanner(url) {
    const banner = document.getElementById("clipboard-banner");
    const textEl = document.getElementById("clipboard-url-text");
    const useBtn = document.getElementById("clipboard-use-btn");
    const dismissBtn = document.getElementById("clipboard-dismiss-btn");

    if (!banner || !textEl || !useBtn || !dismissBtn) return;

    textEl.textContent = url;
    banner.style.display = "flex";

    useBtn.onclick = () => {
      const input = document.getElementById("video-url-input");
      if (input) {
        input.value = url;
        banner.style.display = "none";
        this.handleAnalyze();
      }
    };

    dismissBtn.onclick = () => {
      banner.style.display = "none";
    };
  }

  // --- AUTO-RESIZE TEXTAREA ---
  initTextareaResize() {
    const input = document.getElementById("video-url-input");
    if (input) {
      input.addEventListener("input", function() {
        this.style.height = "auto";
        this.style.height = (this.scrollHeight) + "px";
      });
    }
  }

  // --- ANALYZE PLAYLIST FLOW ---
  async handleAnalyzePlaylist() {
    const input = document.getElementById("video-url-input");
    const analyzePlaylistBtn = document.getElementById("analyze-playlist-btn");
    const rawUrlString = input.value.trim();
    if (!rawUrlString) {
      UI.showToast("Please enter a playlist or channel URL.", "warning");
      input.focus();
      return;
    }

    const rawUrls = rawUrlString.split(/\r?\n/).map(u => u.trim()).filter(Boolean);
    if (rawUrls.length > 1) {
      UI.showToast("For playlists, please enter only one URL at a time.", "warning");
      return;
    }

    const rawUrl = rawUrls[0];
    const originalText = analyzePlaylistBtn.innerHTML;
    analyzePlaylistBtn.disabled = true;
    analyzePlaylistBtn.innerHTML = `<span style="display:inline-block; animation:spin 1s linear infinite;">⏳</span> Fetching Playlist...`;

    try {
      const data = await API.getPlaylistInfo(rawUrl);
      if (data.entries && data.entries.length > 0) {
        UI.showToast(`Found ${data.entries.length} videos! Starting batch analysis...`, "success", 4000);
        // Extract all URLs and trigger batch analyze
        const urls = data.entries.map(e => e.url);
        // Clear input to look clean
        input.value = "";
        input.style.height = "auto";
        this.handleBatchAnalyze(urls);
      } else {
        UI.showToast("No videos found in this playlist or channel.", "warning");
      }
    } catch (err) {
      UI.showToast(err.message || "Failed to fetch playlist info.", "error", 5000);
    } finally {
      analyzePlaylistBtn.disabled = false;
      analyzePlaylistBtn.innerHTML = originalText;
    }
  }

  // --- ANALYZE URL FLOW ---
  async handleAnalyze() {
    const input = document.getElementById("video-url-input");
    const analyzeBtn = document.getElementById("analyze-btn");
    const skeleton = document.getElementById("analysis-skeleton");
    const errorCard = document.getElementById("analysis-error");
    const metadataContainer = document.getElementById("metadata-container");

    const rawUrlString = input.value.trim();
    if (!rawUrlString) {
      UI.showToast("Please enter or paste a video URL.", "warning");
      input.focus();
      return;
    }

    const rawUrls = rawUrlString.split(/\r?\n/).map(u => u.trim()).filter(Boolean);
    
    // Batch Mode
    if (rawUrls.length > 1) {
      this.handleBatchAnalyze(rawUrls);
      return;
    }

    const rawUrl = rawUrls[0];
    
    // Set Analyzing State
    this.isAnalyzing = true;
    analyzeBtn.disabled = true;
    analyzeBtn.innerHTML = `<span style="display:inline-block; animation:spin 1s linear infinite;">⏳</span> Analyzing...`;
    const container = document.getElementById("url-input-container");
    if (container) container.classList.add("is-processing");

    if (errorCard) errorCard.classList.remove("active");
    if (metadataContainer) metadataContainer.style.display = "none";
    if (skeleton) skeleton.classList.add("active");

    try {
      const data = await API.analyzeUrl(rawUrl);
      this.currentMetadata = data;

      if (skeleton) skeleton.classList.remove("active");

      // Render format selection interface
      UI.renderMetadata(data, (type, format) => {
        this.handleDownload(type, format);
      });

      UI.showToast("Video metadata extracted successfully!", "success");
    } catch (err) {
      if (skeleton) skeleton.classList.remove("active");
      this.showAnalysisError(err.message || "Failed to analyze URL.");
    } finally {
      this.isAnalyzing = false;
      analyzeBtn.disabled = false;
      if (container) container.classList.remove("is-processing");
      analyzeBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
        Analyze Link
      `;
    }
  }

  // --- BATCH ANALYZE FLOW ---
  async handleBatchAnalyze(urls) {
    const input = document.getElementById("video-url-input");
    const container = document.getElementById("url-input-container");
    
    if (input) {
      input.value = ""; // clear input
      input.style.height = "auto"; // reset height
    }
    if (container) container.classList.remove("is-valid", "is-invalid");

    const overlay   = document.getElementById("batch-panel-overlay");
    const cards     = document.getElementById("batch-panel-cards");
    const subtitle  = document.getElementById("batch-panel-subtitle");
    const progWrap  = document.getElementById("batch-panel-progress-wrap");
    const progBar   = document.getElementById("batch-progress-bar");
    const progCount = document.getElementById("batch-progress-count");
    const dlAllBtn  = document.getElementById("batch-download-all-btn");
    const readyCnt  = document.getElementById("batch-ready-count");

    if (!overlay || !cards) return;

    this.batchItems = [];
    cards.innerHTML = "";
    
    if (progWrap) progWrap.style.display = "block";
    if (progBar)  progBar.style.width = "0%";
    if (progCount) progCount.textContent = `0 / ${urls.length}`;
    if (subtitle) subtitle.textContent = `Analyzing ${urls.length} links...`;
    if (readyCnt) readyCnt.textContent = `0 videos ready`;
    if (dlAllBtn) dlAllBtn.disabled = true;

    // Show popup immediately
    overlay.classList.add("active");

    // Close button
    const closeBtn = document.getElementById("batch-panel-close-btn");
    if (closeBtn) closeBtn.onclick = () => {
      overlay.classList.remove("active");
      this.batchItems = [];
    };

    // "Apply to all" global quality
    const applyAllBtn   = document.getElementById("batch-apply-all-btn");
    const globalQuality = document.getElementById("batch-global-quality");
    if (applyAllBtn) {
      applyAllBtn.onclick = () => {
        const q = globalQuality?.value;
        if (!q) { UI.showToast("Choose a quality first.", "warning"); return; }
        this.batchItems.forEach(item => {
          if (!item || item.queued) return;
          const sel = document.getElementById(`bp-fmt-${item.idx}`);
          if (!sel) return;
          const opts = Array.from(sel.options);
          let pick = null;
          if (q === "best_av1") pick = opts.find(o => o.text.includes("AV1") && o.value.startsWith("video:")) || opts.find(o => o.value.startsWith("video:"));
          else if (q === "best") pick = opts.find(o => o.text.includes("Recommended") && o.value.startsWith("video:")) || opts.find(o => o.value === "video:best") || opts.find(o => o.value.startsWith("video:"));
          else if (q === "1080p") pick = opts.find(o => o.text.includes("1080") && o.value.startsWith("video:")) || opts.find(o => o.value === "video:res_1080") || opts.find(o => o.value.startsWith("video:"));
          else if (q === "720p")  pick = opts.find(o => o.text.includes("720") && o.value.startsWith("video:")) || opts.find(o => o.value === "video:res_720") || opts.find(o => o.value.startsWith("video:"));
          else if (q === "480p")  pick = opts.find(o => o.text.includes("480") && o.value.startsWith("video:")) || opts.find(o => o.value === "video:res_480") || opts.find(o => o.value.startsWith("video:"));
          else if (q === "audio_mp3") pick = opts.find(o => o.value.startsWith("audio:")) || opts.find(o => o.value === "audio:mp3");
          if (pick) sel.value = pick.value;
        });
        UI.showToast("Quality applied to all remaining videos!", "success", 2500);
      };
    }

    // "Download All" button - NEVER DROPS OR SKIPS ANY VIDEO
    if (dlAllBtn) {
      dlAllBtn.onclick = async () => {
        dlAllBtn.disabled = true;
        dlAllBtn.textContent = "⏳ Queueing...";
        let ok = 0, alreadyQueued = 0, fail = 0;
        
        for (const item of this.batchItems) {
          if (!item) continue;
          if (item.queued) continue; // Already queued in previous pass

          const statusEl = document.getElementById(`bp-status-${item.idx}`);
          const sel = document.getElementById(`bp-fmt-${item.idx}`);

          const selValue = sel ? sel.value : "video:res_1080";
          const [selType, selFormatId] = (selValue || "video:res_1080").split(":");
          
          let payload;
          if (item.meta) {
            const meta = item.meta;
            if (selType === "video") {
              const fmt = meta.videoFormats.find(f => f.formatId === selFormatId) || 
                          meta.videoFormats.find(f => !f.isUnavailable) || 
                          { formatId: selFormatId || "res_1080", resolutionLabel: "1080p Full HD", container: "mp4", videoCodec: "AVC/H.264" };
              payload = {
                url: meta.url || item.url,
                title: meta.title || `Video #${item.idx + 1}`,
                thumbnail: meta.thumbnail || "",
                duration: meta.duration || 0,
                type: "video",
                selectedFormat: {
                  formatId: fmt.formatId,
                  resolutionLabel: fmt.resolutionLabel || "1080p Full HD",
                  container: fmt.container || "mp4",
                  codec: fmt.videoCodec || "AVC/H.264",
                  needsAudioMerge: fmt.needsAudioMerge !== false,
                },
                destinationDir: this.settings?.downloadPath,
                threads: this.settings?.downloadThreads,
              };
            } else {
              const fmt = meta.audioFormats.find(f => f.formatId === selFormatId) || meta.audioFormats[0] || { formatId: "bestaudio", label: "Audio MP3", ext: "mp3" };
              payload = {
                url: meta.url || item.url,
                title: meta.title || `Audio #${item.idx + 1}`,
                thumbnail: meta.thumbnail || "",
                duration: meta.duration || 0,
                type: "audio",
                selectedFormat: {
                  formatId: fmt.formatId || "bestaudio",
                  resolutionLabel: fmt.label || "Audio MP3",
                  container: fmt.ext || "mp3",
                  codec: fmt.codec || "mp3",
                  audioOption: fmt.ext || "mp3",
                },
                destinationDir: this.settings?.downloadPath,
                threads: this.settings?.downloadThreads,
              };
            }
          } else {
            // DIRECT ROBUST FALLBACK - ALWAYS QUEUES THE ITEM EVEN IF PRE-ANALYSIS WAS DELAYED OR RATE-LIMITED
            const ytMatch = item.url.match(/(?:v=|\/)([a-zA-Z0-9_-]{11})/);
            const videoId = ytMatch ? ytMatch[1] : null;
            const isAudio = selType === "audio";
            
            let resLabel = "1080p Full HD";
            if (selFormatId === "res_720" || selFormatId === "720p") resLabel = "720p HD";
            else if (selFormatId === "res_480" || selFormatId === "480p") resLabel = "480p SD";
            else if (selFormatId === "best" || selFormatId === "best_av1") resLabel = "Best Quality";

            payload = {
              url: item.url,
              title: videoId ? `YouTube Video [${videoId}]` : `Video #${item.idx + 1}`,
              thumbnail: videoId ? `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg` : "",
              duration: 0,
              type: isAudio ? "audio" : "video",
              selectedFormat: isAudio ? {
                formatId: "bestaudio",
                resolutionLabel: "Audio MP3",
                container: "mp3",
                codec: "mp3",
                audioOption: "mp3",
              } : {
                formatId: selFormatId || "res_1080",
                resolutionLabel: resLabel,
                container: "mp4",
                codec: "AVC/H.264",
                needsAudioMerge: true,
              },
              destinationDir: this.settings?.downloadPath,
              threads: this.settings?.downloadThreads,
            };
          }
          
          try {
            if (statusEl) { statusEl.textContent = "⏳ Queueing..."; statusEl.style.color = "var(--accent)"; }
            const res = await API.enqueueDownload(payload);
            if (res.success) {
              item.queued = true;
              if (res.alreadyQueued) {
                alreadyQueued++;
                if (statusEl) { statusEl.textContent = "ℹ️ In Queue"; statusEl.style.color = "var(--primary)"; }
              } else {
                ok++;
                if (statusEl) { statusEl.textContent = "✅ Queued"; statusEl.style.color = "var(--success)"; }
              }
              if (sel) sel.disabled = true;
            } else {
              fail++;
              if (statusEl) { statusEl.textContent = `❌ ${res.error || "Failed"}`; statusEl.style.color = "var(--danger)"; }
            }
          } catch (e) {
            fail++;
            if (statusEl) { statusEl.textContent = `❌ ${e.message || "Failed"}`; statusEl.style.color = "var(--danger)"; }
          }
        }
        
        if (fail === 0) {
          const totalSuccess = ok + alreadyQueued;
          UI.showToast(`✅ All ${totalSuccess} video${totalSuccess !== 1 ? "s" : ""} queued successfully!`, "success", 4000);
          setTimeout(() => {
            overlay.classList.remove("active");
            this.switchTab("queue");
          }, 1000);
        } else {
          UI.showToast(`⚠️ ${ok} queued, ${fail} failed. Videos kept in list for review.`, "warning", 6000);
          dlAllBtn.disabled = false;
          dlAllBtn.textContent = `⬇ Retry Failed (${fail})`;
          if (subtitle) subtitle.textContent = `⚠️ ${ok} queued, ${fail} failed. Review failed items below.`;
        }
      };
    }

    // Helper to update count - counts all items ready to queue
    const updateReadyCount = () => {
      const remainingToQueue = this.batchItems.filter(i => i && !i.queued).length;
      const queuedItems = this.batchItems.filter(i => i && i.queued).length;
      if (readyCnt) readyCnt.textContent = `${remainingToQueue} ready${queuedItems > 0 ? ` (${queuedItems} queued)` : ""}`;
      if (dlAllBtn) {
        dlAllBtn.disabled = remainingToQueue === 0;
      }
    };

    // Pre-create all skeletons with instant fallback format choices
    urls.forEach((url, idx) => {
      const card = document.createElement("div");
      card.id = `bp-card-${idx}`;
      card.style.cssText = "background:var(--bg-surface);border:1px solid var(--border-color);border-radius:var(--radius);padding:0.85rem 1rem;display:flex;align-items:center;gap:1rem;";
      
      const ytMatch = url.match(/(?:v=|\/)([a-zA-Z0-9_-]{11})/);
      const ytId = ytMatch ? ytMatch[1] : null;
      const thumbUrl = ytId ? `https://i.ytimg.com/vi/${ytId}/mqdefault.jpg` : "";

      card.innerHTML = `
        <img src="${thumbUrl}" alt="" style="width:72px;height:48px;object-fit:cover;border-radius:4px;flex-shrink:0;background:var(--border-color);" onerror="this.style.display='none'">
        <div style="flex:1;min-width:0;">
          <div style="font-size:0.88rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:0.3rem;" id="bp-title-${idx}">🎬 ${ytId ? `YouTube Video [${ytId}]` : `Video #${idx + 1}`}</div>
          <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.45rem;" id="bp-sub-${idx}">Analyzing metadata...</div>
          <select class="form-select" id="bp-fmt-${idx}" style="width:100%;font-size:0.8rem;padding:0.3rem 0.5rem;">
            <option value="video:res_1080" selected>📺 1080p Full HD (Auto Match)</option>
            <option value="video:res_720">📱 720p HD (Auto Match)</option>
            <option value="video:best">👑 Best Available (Auto Match)</option>
            <option value="video:res_480">📶 480p SD (Auto Match)</option>
            <option value="audio:mp3">🎵 Audio Only (MP3)</option>
          </select>
        </div>
        <div style="display:flex;flex-direction:column;gap:0.4rem;align-items:center;flex-shrink:0;">
          <span id="bp-status-${idx}" style="font-size:0.75rem;color:var(--text-muted);font-weight:600;">✓ Ready (Auto)</span>
          <button class="btn btn-secondary btn-sm" id="bp-remove-${idx}" style="padding:0.2rem 0.5rem;" title="Remove from batch">✕</button>
        </div>
      `;
      cards.appendChild(card);
      this.batchItems[idx] = { idx, url, meta: null, queued: false };

      document.getElementById(`bp-remove-${idx}`).onclick = () => {
        card.remove();
        this.batchItems[idx] = null;
        updateReadyCount();
      };
    });

    updateReadyCount();

    const populateCard = (idx, meta) => {
      if (!this.batchItems[idx]) return;
      this.batchItems[idx].meta = meta;
      
      const availableVideos = meta.videoFormats.filter(f => !f.isUnavailable);
      const recVideo = meta.recommendedVideoFormat || availableVideos.find(f => f.isRecommended) || availableVideos[0];

      const videoOpts = availableVideos.map(f => {
        const isRec = recVideo && recVideo.formatId === f.formatId;
        const rec = isRec ? " ⭐ Recommended" : "";
        const av1 = (!isRec && (f.videoCodec||"").includes("AV1")) ? " ⚡ AV1" : "";
        return `<option value="video:${f.formatId}" ${isRec ? "selected" : ""}>${f.resolutionLabel} | ${(f.container||"").toUpperCase()} | ${f.videoCodec} — ${f.filesizeFormatted}${rec}${av1}</option>`;
      }).join("");

      const audioOpts = meta.audioFormats.map(a =>
        `<option value="audio:${a.formatId}">🎵 ${a.label} (${(a.ext||"").toUpperCase()}) — ${a.filesizeFormatted}</option>`
      ).join("");

      const card = document.getElementById(`bp-card-${idx}`);
      if (card) {
        card.style.opacity = "1";
        card.style.borderColor = "var(--border-color)";
        card.innerHTML = `
          <img src="${meta.thumbnail||""}" alt="" style="width:72px;height:48px;object-fit:cover;border-radius:4px;flex-shrink:0;background:var(--border-color);" onerror="this.style.display='none'">
          <div style="flex:1;min-width:0;">
            <div style="font-size:0.88rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:0.3rem;" title="${meta.title||""}">🎬 ${meta.title||"Unknown"}</div>
            <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.45rem;">${meta.duration ? "⏱ "+meta.durationFormatted || meta.duration : ""} • Max: ${meta.bestVideoFormat?.resolutionLabel || "1080p"}</div>
            <select class="form-select" id="bp-fmt-${idx}" style="width:100%;font-size:0.8rem;padding:0.3rem 0.5rem;">
              <optgroup label="🎬 Authentic Video Streams">${videoOpts}</optgroup>
              <optgroup label="🎵 Audio Only">${audioOpts}</optgroup>
            </select>
          </div>
          <div style="display:flex;flex-direction:column;gap:0.4rem;align-items:center;flex-shrink:0;">
            <span id="bp-status-${idx}" style="font-size:0.75rem;color:var(--success);font-weight:600;">✓ Ready</span>
            <button class="btn btn-secondary btn-sm" id="bp-remove-${idx}" style="padding:0.2rem 0.5rem;" title="Remove from batch">✕</button>
          </div>`;
          
        document.getElementById(`bp-remove-${idx}`).onclick = () => {
          card.remove();
          this.batchItems[idx] = null;
          updateReadyCount();
        };
      }
    };

    const renderFailedCard = (idx, rawUrl, _errMsg) => {
      const card = document.getElementById(`bp-card-${idx}`);
      if (card) {
        card.style.opacity = "1";
        card.style.borderColor = "var(--border-color)";
        const statusEl = document.getElementById(`bp-status-${idx}`);
        if (statusEl) {
          statusEl.textContent = "⚡ Auto Ready";
          statusEl.style.color = "var(--accent)";
          statusEl.title = "Direct download mode active (metadata bypassed)";
        }
        const subEl = document.getElementById(`bp-sub-${idx}`);
        if (subEl) {
          subEl.textContent = "Direct download enabled (auto match)";
        }
      }
    };

    // Analyze with concurrency control (2 parallel workers to avoid YouTube bot detection/rate limits)
    let analyzedCount = 0;
    let currentIndex = 0;
    const maxConcurrent = 2;

    const worker = async () => {
      while (currentIndex < urls.length) {
        if (!overlay.classList.contains("active")) break; // user closed modal
        const idx = currentIndex++;
        const rawUrl = urls[idx];
        
        let meta = null;
        let lastErr = null;
        // Auto-retry once on failure
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            meta = await API.analyzeUrl(rawUrl);
            if (meta) break;
          } catch (err) {
            lastErr = err;
            if (attempt === 0) await new Promise(r => setTimeout(r, 1200));
          }
        }

        if (meta) {
          populateCard(idx, meta);
        } else {
          renderFailedCard(idx, rawUrl, lastErr?.message || "Failed to analyze URL");
        }
        
        analyzedCount++;
        if (progBar) progBar.style.width = `${(analyzedCount / urls.length) * 100}%`;
        if (progCount) progCount.textContent = `${analyzedCount} / ${urls.length}`;
        updateReadyCount();
      }
    };

    const workers = [];
    for (let i = 0; i < maxConcurrent; i++) {
      workers.push(worker());
    }
    
    await Promise.all(workers);
    
    // Done analyzing
    if (subtitle) subtitle.textContent = `Analysis complete! Choose format and click Download All.`;
    if (progWrap) progWrap.style.display = "none";
  }

  showAnalysisError(message) {
    const errorCard = document.getElementById("analysis-error");
    const errorMsg = document.getElementById("analysis-error-message");
    if (errorCard && errorMsg) {
      const isBotCheck = message.toLowerCase().includes("bot") || message.toLowerCase().includes("sign in");
      if (isBotCheck) {
        errorMsg.innerHTML = `
          <div style="font-weight: 600; color: var(--danger); margin-bottom: 0.5rem;">${message}</div>
          <div style="margin-top: 0.6rem; padding: 0.75rem 0.85rem; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: var(--radius-sm); font-size: 0.83rem;">
            <div style="font-weight: 700; color: #f87171; margin-bottom: 0.35rem;">🛠️ How to Resolve YouTube Bot Check:</div>
            <div style="margin-bottom: 0.4rem; line-height: 1.45;">
              <strong>1. Instant 10-Second Fix (Recommended):</strong> Reconnect your Mobile Hotspot or restart your WiFi router. When your device gets a fresh IP address, YouTube's bot flag disappears immediately!
            </div>
            <div style="line-height: 1.45;">
              <strong>2. Or Authenticate with cookies.txt:</strong> In Chrome, open YouTube, export cookies using the free extension <em>"Get cookies.txt LOCALLY"</em>, and save it in your Downloads folder or app folder.
            </div>
          </div>
        `;
      } else {
        errorMsg.textContent = message;
      }
      errorCard.classList.add("active");
    } else {
      UI.showToast(message, "error", 6000);
    }
  }

  resetResults() {
    this.currentMetadata = null;
    const skeleton = document.getElementById("analysis-skeleton");
    const errorCard = document.getElementById("analysis-error");
    const metadataContainer = document.getElementById("metadata-container");

    if (skeleton) skeleton.classList.remove("active");
    if (errorCard) errorCard.classList.remove("active");
    if (metadataContainer) {
      metadataContainer.innerHTML = "";
      metadataContainer.style.display = "none";
    }
  }

  // --- DOWNLOAD INITIATION ---
  async handleDownload(type, format) {
    if (!this.currentMetadata) return;

    let payload;

    if (type === "video") {
      payload = {
        url: this.currentMetadata.url,
        title: this.currentMetadata.title,
        thumbnail: this.currentMetadata.thumbnail,
        duration: this.currentMetadata.duration,
        type: "video",
        selectedFormat: {
          formatId: format.formatId,
          resolutionLabel: format.resolutionLabel,
          container: format.container || "mp4",
          codec: format.videoCodec,
          needsAudioMerge: format.needsAudioMerge,
        },
        destinationDir: this.settings ? this.settings.downloadPath : undefined,
        threads: this.settings ? this.settings.downloadThreads : undefined,
      };
    } else {
      // Audio
      payload = {
        url: this.currentMetadata.url,
        title: this.currentMetadata.title,
        thumbnail: this.currentMetadata.thumbnail,
        duration: this.currentMetadata.duration,
        type: "audio",
        selectedFormat: {
          formatId: format.formatId,
          resolutionLabel: format.label,
          container: format.ext || "mp3",
          codec: format.codec,
          audioOption: format.ext,
          type: format.type,
        },
        destinationDir: this.settings ? this.settings.downloadPath : undefined,
        threads: this.settings ? this.settings.downloadThreads : undefined,
      };
    }

    try {
      const res = await API.enqueueDownload(payload);
      if (res.success) {
        UI.showToast(`Added "${this.currentMetadata.title.slice(0, 30)}..." to queue!`, "success");

        if (this.isBatchProcessing) {
          // If we are in batch mode, immediately process the next video!
          this.processNextBatchItem();
        } else {
          // Otherwise, switch to the queue tab
          this.switchTab("queue");
        }
      }
    } catch (err) {
      UI.showToast(err.message || "Failed to add to download queue.", "error");
    }
  }

  // --- QUEUE MANAGEMENT ---
  async loadQueue() {
    try {
      const data = await API.getQueue();
      this.queueItems = data.items || [];
      this.renderQueueView();
    } catch (err) {
      console.error("Failed to load queue:", err);
    }
  }

  renderQueueView() {
    UI.renderQueue(this.queueItems, {
      onCancel: async (id) => {
        try {
          await API.cancelDownload(id);
          UI.showToast("Download cancelled", "info");
        } catch (err) {
          UI.showToast(err.message, "error");
        }
      },
      onPause: async (id) => {
        try {
          await API.pauseDownload(id);
          UI.showToast("Download paused", "info");
        } catch (err) {
          UI.showToast(err.message, "error");
        }
      },
      onResume: async (id) => {
        try {
          await API.resumeDownload(id);
          UI.showToast("Download resumed", "info");
        } catch (err) {
          UI.showToast(err.message, "error");
        }
      },
      onRetry: async (id) => {
        try {
          await API.retryDownload(id);
          UI.showToast("Retrying download", "info");
        } catch (err) {
          UI.showToast(err.message, "error");
        }
      },
      onRemove: async (id) => {
        try {
          await API.removeDownload(id);
          UI.showToast("Removed from queue", "info");
        } catch (err) {
          UI.showToast(err.message, "error");
        }
      },
      onOpenFile: async (path) => {
        if (!path) {
          UI.showToast("File path unavailable", "warning");
          return;
        }
        try {
          await API.openFile(path);
        } catch (err) {
          UI.showToast(err.message, "error");
        }
      },
      onOpenFolder: async (path) => {
        await this.openFolderAction(path);
      },
    });
  }

  bindQueueControls() {
    const clearCompletedBtn = document.getElementById("clear-completed-btn");
    const clearAllQueueBtn = document.getElementById("clear-all-queue-btn");

    if (clearCompletedBtn) {
      clearCompletedBtn.onclick = async () => {
        await API.clearCompleted();
        await this.loadQueue();
        UI.showToast("Completed downloads cleared from queue", "info");
      };
    }

    if (clearAllQueueBtn) {
      clearAllQueueBtn.onclick = () => {
        UI.confirmDialog(
          "Clear Entire Queue?",
          "Are you sure you want to cancel and remove all active and pending downloads from the queue?",
          "Clear All",
          async () => {
            await API.clearAllQueue();
            await this.loadQueue();
            UI.showToast("Queue cleared", "info");
          }
        );
      };
    }
  }

  // --- SSE REAL-TIME SYNC ---
  setupSSE() {
    const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    const myClientId = API.getClientId();

    sseClient.subscribe((event) => {
      const rawItems = event.items || [];
      const myItems = isLocalhost ? rawItems : rawItems.filter((i) => i.clientId === myClientId);

      if (event.type === "snapshot" || event.type === "queue_cleared" || event.type === "item_removed") {
        this.queueItems = myItems;
        this.renderQueueView();
      } else if (event.type === "item_added" || event.type === "item_updated") {
        this.queueItems = myItems;
        this.renderQueueView();

        // If completed, refresh history
        if (event.item && event.item.status === "completed") {
          if (isLocalhost || event.item.clientId === myClientId) {
            this.loadHistory();
            if (this.settings && this.settings.notifications) {
              UI.showToast(`✅ "${event.item.title.slice(0, 35)}..." finished downloading!`, "success", 6000);
            }
          }
        }
      }
    });
  }

  // --- HISTORY MANAGEMENT ---
  async loadHistory() {
    try {
      const data = await API.getHistory();
      this.historyItems = data.history || [];
      this.renderHistoryView();
    } catch (err) {
      console.error("Failed to load history:", err);
    }
  }

  renderHistoryView(filterText = "") {
    let items = this.historyItems;
    if (filterText.trim()) {
      const q = filterText.toLowerCase();
      items = items.filter(
        (i) => i.title.toLowerCase().includes(q) || i.resolutionLabel.toLowerCase().includes(q) || i.container.toLowerCase().includes(q)
      );
    }

    UI.renderHistory(items, {
      onOpenFile: async (path) => {
        try {
          await API.openFile(path);
        } catch (err) {
          UI.showToast(err.message, "error");
        }
      },
      onOpenFolder: async (path) => {
        await this.openFolderAction(path);
      },
      onDeleteHistory: async (id) => {
        try {
          await API.deleteHistoryItem(id);
          this.historyItems = this.historyItems.filter((i) => i.id !== id);
          this.renderHistoryView(document.getElementById("history-search-input")?.value || "");
          UI.showToast("History entry removed", "info");
        } catch (err) {
          UI.showToast(err.message, "error");
        }
      },
    });
  }

  bindHistoryControls() {
    const searchInput = document.getElementById("history-search-input");
    const clearHistoryBtn = document.getElementById("clear-history-btn");

    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        this.renderHistoryView(e.target.value);
      });
    }

    if (clearHistoryBtn) {
      clearHistoryBtn.onclick = () => {
        UI.confirmDialog(
          "Clear Download History?",
          "Are you sure you want to clear your download history? Your downloaded files on disk will not be deleted.",
          "Clear History",
          async () => {
            await API.clearAllHistory();
            this.historyItems = [];
            this.renderHistoryView();
            UI.showToast("Download history cleared", "info");
          }
        );
      };
    }
  }

  // --- SETTINGS ---
  async loadSettings() {
    try {
      this.settings = await API.getSettings();
      this.populateSettingsForm();
    } catch (err) {
      console.error("Failed to load settings:", err);
    }
  }

  populateSettingsForm() {
    if (!this.settings) return;

    const pathInput = document.getElementById("setting-download-path");
    const videoQuality = document.getElementById("setting-video-quality");
    const containerSelect = document.getElementById("setting-container");
    const audioFormat = document.getElementById("setting-audio-format");
    const concurrentLimit = document.getElementById("setting-concurrent-limit");
    const downloadThreads = document.getElementById("setting-download-threads");
    const connectionProtection = document.getElementById("setting-connection-protection");
    const themeSelect = document.getElementById("setting-theme");
    const autoClipboard = document.getElementById("setting-auto-clipboard");
    const notifications = document.getElementById("setting-notifications");
    const autoStartQueue = document.getElementById("setting-auto-start-queue");

    if (pathInput) pathInput.value = this.settings.downloadPath || "";
    if (videoQuality) videoQuality.value = this.settings.defaultVideoQuality || "1080p";
    if (containerSelect) containerSelect.value = this.settings.preferredContainer || "mp4";
    if (audioFormat) audioFormat.value = this.settings.defaultAudioFormat || "mp3";
    if (concurrentLimit) concurrentLimit.value = String(this.settings.concurrentDownloads || 2);
    if (downloadThreads) downloadThreads.value = String(this.settings.downloadThreads || 8);
    if (connectionProtection) connectionProtection.checked = this.settings.connectionProtection !== false;
    if (themeSelect) themeSelect.value = this.settings.theme || "dark";
    if (autoClipboard) autoClipboard.checked = Boolean(this.settings.autoClipboard);
    if (notifications) notifications.checked = Boolean(this.settings.notifications);
    if (autoStartQueue) autoStartQueue.checked = Boolean(this.settings.autoStartQueue);

    // Update folder location indicators across Downloader, Queue and History tabs
    const currentPath = this.settings.downloadPath || "D:\\VIDEO DOWNLOADER\\downloads";
    const dlFolderLoc = document.getElementById("downloader-folder-location");
    const queueFolderLoc = document.getElementById("queue-folder-location");
    const histFolderLoc = document.getElementById("history-folder-location");
    if (dlFolderLoc) dlFolderLoc.textContent = currentPath;
    if (queueFolderLoc) queueFolderLoc.textContent = currentPath;
    if (histFolderLoc) histFolderLoc.textContent = currentPath;
  }

  bindFolderButtons() {
    // Global delegated click handler for all Open Folder buttons across Header, Downloader, Queue, History, Settings, and Player
    document.addEventListener("click", async (e) => {
      const btn = e.target.closest(
        ".btn-quick-open-folder, .btn-open-folder, #header-open-folder-btn, #downloader-open-folder-btn, #queue-open-folder-btn, #history-open-folder-btn, #setting-open-folder-btn, #player-btn-open-folder"
      );
      if (!btn) return;

      e.preventDefault();
      e.stopPropagation();

      const defaultFolder = this.settings?.downloadPath || "D:\\VIDEO DOWNLOADER\\downloads";
      let targetPath = btn.getAttribute("data-path") || document.getElementById("setting-download-path")?.value.trim() || defaultFolder;

      if (!targetPath || targetPath === "undefined" || targetPath === "null") {
        targetPath = defaultFolder;
      }

      // Visual button feedback
      const originalHtml = btn.innerHTML;
      btn.innerHTML = `<span style="display:inline-flex;align-items:center;gap:4px;">⏳ Opening...</span>`;
      btn.disabled = true;

      try {
        await this.openFolderAction(targetPath);
      } catch (err) {
        console.error("Open folder error:", err);
      } finally {
        setTimeout(() => {
          btn.innerHTML = originalHtml;
          btn.disabled = false;
        }, 800);
      }
    });

    // Global delegated click handler for Copy Folder buttons
    document.addEventListener("click", async (e) => {
      const btn = e.target.closest(".btn-quick-copy-folder, .btn-copy-path, #player-btn-copy-path");
      if (!btn) return;

      e.preventDefault();
      e.stopPropagation();

      const defaultFolder = this.settings?.downloadPath || "D:\\VIDEO DOWNLOADER\\downloads";
      const targetPath = btn.getAttribute("data-path") || defaultFolder;

      try {
        await navigator.clipboard.writeText(targetPath);
        UI.showToast(`📋 Copied path to clipboard: ${targetPath}`, "success", 2500);
      } catch (_e) {
        prompt("Folder / File Location:", targetPath);
      }
    });
  }

  async openFolderAction(path) {
    // Debounce to prevent rapid double-invocations
    const now = Date.now();
    if (this._lastOpenTime && now - this._lastOpenTime < 600) {
      return;
    }
    this._lastOpenTime = now;

    const defaultFolder = this.settings?.downloadPath || "D:\\VIDEO DOWNLOADER\\downloads";
    let target = (path && typeof path === "string" ? path.trim() : "") || defaultFolder;
    if (target === "undefined" || target === "null") target = defaultFolder;

    // 1. Copy path to clipboard as a helpful convenience
    try {
      await navigator.clipboard.writeText(target);
    } catch (_clipErr) {
      // ignore
    }

    // 2. Open Windows Explorer on the user's desktop & show In-App modal
    try {
      const res = await API.openFolder(target);
      
      // Always show the in-app folder explorer modal as a reliable fallback
      // This ensures they can see and play files even if native explorer fails to pop up visually
      if (res && res.success && res.files) {
        UI.openFolderModal(res.folder || target, res.files);
        UI.showToast(`📂 Opened Folder: ${res.folder || target}`, "success", 3000);
      } else {
        UI.openFolderModal(target, []);
        UI.showToast(`📂 Opened Folder: ${target}`, "info", 3000);
      }
    } catch (err) {
      console.warn("API.openFolder error:", err);
      // Fallback to empty modal if backend fails
      UI.openFolderModal(target, []);
      UI.showToast(err.message || "Failed to read folder contents.", "error");
    }
  }

  bindSettingsForm() {
    const form = document.getElementById("settings-form");

    if (form) {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const updated = {
          downloadPath: document.getElementById("setting-download-path")?.value.trim(),
          defaultVideoQuality: document.getElementById("setting-video-quality")?.value,
          preferredContainer: document.getElementById("setting-container")?.value,
          defaultAudioFormat: document.getElementById("setting-audio-format")?.value,
          concurrentDownloads: parseInt(document.getElementById("setting-concurrent-limit")?.value || "2", 10),
          downloadThreads: parseInt(document.getElementById("setting-download-threads")?.value || "8", 10),
          connectionProtection: document.getElementById("setting-connection-protection")?.checked,
          theme: document.getElementById("setting-theme")?.value,
          autoClipboard: document.getElementById("setting-auto-clipboard")?.checked,
          notifications: document.getElementById("setting-notifications")?.checked,
          autoStartQueue: document.getElementById("setting-auto-start-queue")?.checked,
        };

        try {
          this.settings = await API.updateSettings(updated);
          themeManager.applyTheme(this.settings.theme);
          UI.showToast("Settings saved successfully!", "success");
        } catch (err) {
          UI.showToast(err.message || "Failed to update settings.", "error");
        }
      });
    }
  }
}

// Instantiate and start app on DOM ready
document.addEventListener("DOMContentLoaded", () => {
  const app = new App();
  app.init();
});
