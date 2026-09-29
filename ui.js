import { API } from "./api.js";

export const UI = {
  // Format Duration
  formatDuration(seconds) {
    if (!seconds) return "";
    if (typeof seconds === "string" && seconds.includes(":")) return seconds;
    const num = Number(seconds);
    if (isNaN(num)) return seconds;
    const h = Math.floor(num / 3600);
    const m = Math.floor((num % 3600) / 60);
    const s = Math.floor(num % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  },

  // Toasts
  showToast(message, type = "info", duration = 4000) {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;

    let icon = "";
    if (type === "success") {
      icon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    } else if (type === "error") {
      icon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
    } else if (type === "warning") {
      icon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
    } else {
      icon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--info)" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
    }

    toast.innerHTML = `${icon}<span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(10px) scale(0.95)";
      toast.style.transition = "all 0.25s ease";
      setTimeout(() => toast.remove(), 250);
    }, duration);
  },

  // Modal Dialog
  confirmDialog(title, message, confirmBtnText = "Confirm", onConfirm) {
    const overlay = document.getElementById("modal-overlay");
    const titleEl = document.getElementById("modal-title");
    const bodyEl = document.getElementById("modal-body");
    const confirmBtn = document.getElementById("modal-confirm-btn");
    const cancelBtn = document.getElementById("modal-cancel-btn");

    if (!overlay || !titleEl || !bodyEl || !confirmBtn || !cancelBtn) return;

    titleEl.textContent = title;
    bodyEl.textContent = message;
    confirmBtn.textContent = confirmBtnText;

    const close = () => {
      overlay.classList.remove("active");
      confirmBtn.onclick = null;
      cancelBtn.onclick = null;
    };

    confirmBtn.onclick = () => {
      close();
      if (onConfirm) onConfirm();
    };

    cancelBtn.onclick = () => {
      close();
    };

    overlay.classList.add("active");
  },

  // Render Video Metadata and Formats
  renderMetadata(meta, onDownloadSelect) {
    const container = document.getElementById("metadata-container");
    if (!container) return;

    // Platform name
    const platform = meta.extractorKey || "Web Video";

    // Formats count
    const totalVideoFormats = meta.videoFormats ? meta.videoFormats.length : 0;
    const totalAudioFormats = meta.audioFormats ? meta.audioFormats.length : 0;

    const count8k = (meta.videoFormats || []).filter(f => (f.height && f.height >= 3500) || f.resolutionLabel.includes("8K")).length;
    const count4k = (meta.videoFormats || []).filter(f => !((f.height && f.height >= 3500) || f.resolutionLabel.includes("8K")) && ((f.height && f.height >= 2000) || f.resolutionLabel.includes("4K"))).length;
    const count1440p = (meta.videoFormats || []).filter(f => (f.height && f.height >= 1300 && f.height < 2000)).length;
    const count1080p = (meta.videoFormats || []).filter(f => (f.height && f.height >= 900 && f.height < 1300)).length;
    const count720p = (meta.videoFormats || []).filter(f => (f.height && f.height >= 600 && f.height < 900)).length;
    const countSd = (meta.videoFormats || []).filter(f => (f.height && f.height < 600)).length;

    let html = `
      <div class="media-header-card">
        <div class="media-thumbnail-wrapper">
          <img src="${meta.thumbnail || 'assets/placeholder.jpg'}" alt="${meta.title}" class="media-thumbnail" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'320\\' height=\\'180\\' viewBox=\\'0 0 320 180\\'><rect fill=\\'%23111\\' width=\\'320\\' height=\\'180\\'/><text fill=\\'%23555\\' x=\\'50%\\' y=\\'50%\\' dominant-baseline=\\'middle\\' text-anchor=\\'middle\\' font-size=\\'16\\'>No Preview</text></svg>'"/>
          <span class="media-duration-badge">${meta.durationFormatted}</span>
          <span class="media-platform-badge">${platform}</span>
        </div>
        <div class="media-details">
          <div>
            <h3 class="media-title" title="${meta.title}">${meta.title}</h3>
            <div class="media-meta-row">
              <span class="media-meta-item">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                ${meta.uploader || "Unknown Author"}
              </span>
              ${meta.viewCount ? `
              <span class="media-meta-item">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                ${meta.viewCount.toLocaleString()} views
              </span>` : ""}
              <span class="media-meta-item">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                ${meta.uploadDate ? `${meta.uploadDate.slice(0, 4)}-${meta.uploadDate.slice(4, 6)}-${meta.uploadDate.slice(6, 8)}` : "Available Now"}
              </span>
              <span class="media-meta-item" style="font-weight: 600; color: ${count8k > 0 ? '#ec4899' : (count4k > 0 ? '#8b5cf6' : 'var(--primary)')};">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                Max Source: ${meta.bestVideoFormat ? meta.bestVideoFormat.resolutionLabel : 'Standard'}
              </span>
            </div>
          </div>

          <div class="media-quick-presets">
            ${meta.bestVideoFormat ? `
              <button class="btn btn-primary btn-sm" id="btn-quick-best">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                Best Quality (${meta.bestVideoFormat.resolutionLabel})
              </button>
            ` : ""}

            ${meta.recommendedVideoFormat ? `
              <button class="btn btn-secondary btn-sm" id="btn-quick-rec">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                Recommended (${meta.recommendedVideoFormat.resolutionLabel} MP4)
              </button>
            ` : ""}

            ${meta.bestAudioFormat ? `
              <button class="btn btn-secondary btn-sm" id="btn-quick-audio">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>
                Extract Audio (MP3 320k)
              </button>
            ` : ""}
          </div>
        </div>
      </div>

      <!-- Quick Quality & Codec Dropdown Selector -->
      <div class="format-dropdown-card">
        <div class="format-dropdown-header">
          <div class="format-dropdown-title-row">
            <div class="format-dropdown-title">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                <line x1="8" y1="21" x2="16" y2="21"></line>
                <line x1="12" y1="17" x2="12" y2="21"></line>
              </svg>
              <span>Quality, Codec & Size Dropdown Menu</span>
            </div>
            <span class="format-count-pill">${meta.videoFormats.length} Video Streams • ${meta.audioFormats.length} Audio Formats</span>
          </div>
          <p class="format-dropdown-subtext">
            Choose any video quality, compression codec (H.264, AV1, VP9), or audio format with calculated file sizes and download directly.
            <span style="display: block; margin-top: 4px; font-size: 0.78rem; color: var(--text-muted);">
              💡 <em>Authentic Source Quality: Resolutions (including 8K &amp; 4K) are retrieved directly from the video host and will appear whenever uploaded in that resolution by the creator.</em>
            </span>
          </p>
        </div>

        <div class="format-dropdown-controls">
          <div class="format-dropdown-select-group">
            <label for="format-master-dropdown" class="format-select-label">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
              Choose Format Option:
            </label>
            <div class="format-select-wrapper">
              <select id="format-master-dropdown" class="format-master-select">
                ${(() => {
                  const availableVideos = meta.videoFormats.filter((f) => !f.isUnavailable);
                  const unavailableVideos = meta.videoFormats.filter((f) => f.isUnavailable);
                  const maxSource = meta.bestVideoFormat ? meta.bestVideoFormat.resolutionLabel : (meta.maxSourceResLabel || '1080p');

                  const recVideo = meta.recommendedVideoFormat || availableVideos.find((f) => f.isRecommended) || availableVideos[0];
                  let recHtml = "";
                  if (recVideo) {
                    recHtml = `
                      <optgroup label="⭐ RECOMMENDED OPTION (Highest Quality • Lowest Size)">
                        <option value="video:${recVideo.formatId}" selected>
                          ⭐ RECOMMENDED: ${recVideo.resolutionLabel} | ${recVideo.container.toUpperCase()} | ${recVideo.videoCodec} — ${recVideo.filesizeFormatted}
                        </option>
                      </optgroup>
                    `;
                  }

                  const availableOptions = availableVideos.map((f, idx) => {
                    let badge = "";
                    const isAv1 = (f.videoCodec || "").includes("AV1") || f.formatId.includes("av1");

                    if (f.isRecommended) badge = " [⭐ RECOMMENDED — AV1 Best Quality • Lowest Size]";
                    else if (isAv1) badge = " [⚡ AV1 Next-Gen — High Quality & Lowest Size]";
                    else if (f.height >= 3500 || f.resolutionLabel.includes("8K")) badge = " [👑 8K Ultra HD — Highest Quality]";
                    else if (f.height >= 2000 || f.resolutionLabel.includes("4K")) badge = " [👑 4K Ultra HD — Ultra HD]";
                    else if (f.height >= 1300 || f.resolutionLabel.includes("1440p")) badge = " [💎 1440p Quad HD (2K)]";
                    else if (f.height >= 900) badge = " [1080p Full HD]";
                    else if (f.height >= 600) badge = " [📺 720p HD]";
                    else if (f.height >= 400) badge = " [📱 480p SD]";
                    else if (f.height >= 300) badge = " [⚡ 360p Data Saver]";
                    else if (f.height >= 200) badge = " [📶 240p Mobile]";
                    else badge = " [📶 144p Ultra Low]";

                    const isSelected = !recVideo && idx === 0;

                    return `<option value="video:${f.formatId}" ${isSelected ? "selected" : ""}>
                      ${f.resolutionLabel} | ${f.container.toUpperCase()} | ${f.videoCodec} — ${f.filesizeFormatted}${badge}
                    </option>`;
                  }).join("");

                  let unavailableOptionsHtml = "";
                  if (unavailableVideos.length > 0) {
                    const unavailList = unavailableVideos.map((f) => {
                      return `<option value="video:${f.formatId}" disabled class="option-unavailable" style="color: #64748b; background: #0f172a;">
                        🔒 ${f.resolutionLabel} — [Unavailable • Exceeds Source Quality: Max ${maxSource}]
                      </option>`;
                    }).join("");

                    unavailableOptionsHtml = `
                      <optgroup label="🔒 UNAVAILABLE FOR THIS VIDEO (Exceeds Uploaded Quality: Max ${maxSource})">
                        ${unavailList}
                      </optgroup>
                    `;
                  }

                  const audioOptions = meta.audioFormats.map((a) => {
                    let tag = "";
                    if (a.isRecommended) tag = " [⭐ RECOMMENDED Audio]";
                    else if (a.isBest) tag = " [Highest Audio Quality]";
                    else if (a.ext === "flac" || a.ext === "wav") tag = " [Lossless Studio Master]";

                    return `<option value="audio:${a.formatId}">
                      🎵 Audio: ${a.label} (${a.ext.toUpperCase()} • ${a.codec || a.audioCodec || "Audio"}) — ${a.filesizeFormatted}${tag}
                    </option>`;
                  }).join("");

                  return `
                    ${recHtml}
                    <optgroup label="🎬 Available Video Streams (Up to Max Source: ${maxSource})">
                      ${availableOptions}
                    </optgroup>
                    ${unavailableOptionsHtml}
                    <optgroup label="🎵 Audio Extraction Formats (Studio Quality)">
                      ${audioOptions}
                    </optgroup>
                  `;
                })()}
              </select>
            </div>
          </div>

          <button id="btn-master-dropdown-download" class="btn btn-primary btn-master-download">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            <span id="btn-master-download-text">Download Selected Format</span>
          </button>
        </div>

        <!-- Live Selected Format Specs Preview Strip -->
        <div class="format-specs-preview" id="format-specs-preview"></div>
      </div>

      <div class="formats-container card">
        <div class="format-tabs-header">
          <div class="format-subtabs">
            <button class="format-subtab-btn active" id="subtab-video-btn" data-target="video-formats-grid">
              🎬 Video Formats (${totalVideoFormats})
            </button>
            <button class="format-subtab-btn" id="subtab-audio-btn" data-target="audio-formats-grid">
              🎵 Audio Extraction (${totalAudioFormats})
            </button>
          </div>
          <span style="font-size: 0.8rem; color: var(--text-muted);">
            Legitimate Source Formats Only • No Upscaling
          </span>
        </div>

        <!-- Format Filters Toolbar -->
        <div class="format-filters-bar" id="format-filters-bar">
          <div class="filter-item">
            <label for="filter-quality-select">Quality:</label>
            <select id="filter-quality-select" class="form-filter-select">
              <option value="all">All Qualities (${meta.videoFormats.length})</option>
              ${count8k > 0 ? `<option value="8k">👑 8K Ultra HD (4320p) (${count8k})</option>` : ''}
              ${count4k > 0 ? `<option value="4k">👑 4K Ultra HD (2160p) (${count4k})</option>` : ''}
              ${count1440p > 0 ? `<option value="1440p">1440p Quad HD (2K) (${count1440p})</option>` : ''}
              ${count1080p > 0 ? `<option value="1080p">1080p Full HD (${count1080p})</option>` : ''}
              ${count720p > 0 ? `<option value="720p">720p HD (${count720p})</option>` : ''}
              ${countSd > 0 ? `<option value="sd">SD (480p / 360p / 240p) (${countSd})</option>` : ''}
            </select>
          </div>

          <div class="filter-item">
            <label for="filter-codec-select">Codec:</label>
            <select id="filter-codec-select" class="form-filter-select">
              <option value="all">All Codecs (H.264, AV1, VP9)</option>
              <option value="h264">H.264 / AVC (Most Compatible)</option>
              <option value="av1">AV1 (Next-Gen Efficiency)</option>
              <option value="vp9">VP9 (WebM)</option>
            </select>
          </div>

          <div class="filter-item">
            <label for="filter-container-select">Container:</label>
            <select id="filter-container-select" class="form-filter-select">
              <option value="all">All Containers</option>
              <option value="mp4">MP4 (Recommended)</option>
              <option value="webm">WebM</option>
            </select>
          </div>

          <div class="filter-status">
            <button id="btn-reset-filters" class="btn btn-secondary btn-sm" style="display: none;">
              Reset Filters
            </button>
            <span id="filter-count-badge" class="filter-count-text">Showing all ${meta.videoFormats.length} formats</span>
          </div>
        </div>

        <!-- Video Formats Grid -->
        <div id="video-formats-grid" class="format-grid">
          ${this.buildVideoFormatCards(meta)}
        </div>

        <!-- Audio Formats Grid -->
        <div id="audio-formats-grid" class="format-grid" style="display: none;">
          ${this.buildAudioFormatCards(meta)}
        </div>
      </div>
    `;

    container.innerHTML = html;
    container.style.display = "block";

    // --- BIND MASTER DROPDOWN SELECTOR ---
    const masterDropdown = document.getElementById("format-master-dropdown");
    const masterDownloadBtn = document.getElementById("btn-master-dropdown-download");
    const masterDownloadText = document.getElementById("btn-master-download-text");
    const specsPreview = document.getElementById("format-specs-preview");

    const updateMasterPreview = () => {
      if (!masterDropdown || !specsPreview) return;
      const [type, formatId] = masterDropdown.value.split(":");
      
      if (type === "video") {
        const f = meta.videoFormats.find((item) => item.formatId === formatId);
        if (f) {
          if (f.isUnavailable) {
            if (masterDownloadBtn) {
              masterDownloadBtn.disabled = true;
              masterDownloadBtn.style.opacity = "0.5";
              masterDownloadBtn.style.cursor = "not-allowed";
              masterDownloadBtn.style.background = "#1e293b";
              masterDownloadBtn.style.borderColor = "#ef4444";
            }
            if (masterDownloadText) {
              masterDownloadText.textContent = `🔒 Exceeds Source Quality (Max: ${meta.bestVideoFormat?.resolutionLabel || "1080p"})`;
            }
            specsPreview.innerHTML = `
              <div class="spec-pill" style="border-color: rgba(239, 68, 68, 0.4); background: rgba(239, 68, 68, 0.1);">
                <span class="spec-pill-label" style="color: #f87171;">Status:</span>
                <span class="spec-pill-val" style="color: #fca5a5;">❌ Not Available on Source (Max: ${meta.bestVideoFormat?.resolutionLabel || "1080p"})</span>
              </div>
              <div class="spec-pill" style="border-color: rgba(239, 68, 68, 0.3);">
                <span class="spec-pill-label">Notice:</span>
                <span class="spec-pill-val">Creator did not upload this resolution. Fake upscaling is disabled.</span>
              </div>
            `;
            return;
          }

          if (masterDownloadBtn) {
            masterDownloadBtn.disabled = false;
            masterDownloadBtn.style.opacity = "1";
            masterDownloadBtn.style.cursor = "pointer";
            masterDownloadBtn.style.background = "";
            masterDownloadBtn.style.borderColor = "";
          }

          if (masterDownloadText) {
            masterDownloadText.textContent = `Download ${f.resolutionLabel} (${f.container.toUpperCase()} • ${f.filesizeFormatted})`;
          }
          
          let codecNote = "Standard";
          if (f.videoCodec.includes("H.264") || f.videoCodec.includes("AVC")) codecNote = "Universal Compatibility";
          else if (f.videoCodec.includes("AV1")) codecNote = "Next-Gen High Efficiency";
          else if (f.videoCodec.includes("VP9")) codecNote = "WebM Standard";

          specsPreview.innerHTML = `
            <div class="spec-pill">
              <span class="spec-pill-label">Quality:</span>
              <span class="spec-pill-val">${f.resolutionLabel} (${f.resolution || "Direct"})</span>
            </div>
            <div class="spec-pill">
              <span class="spec-pill-label">Codec:</span>
              <span class="spec-pill-val highlight-codec">${f.videoCodec} (${codecNote})</span>
            </div>
            <div class="spec-pill">
              <span class="spec-pill-label">Est. File Size:</span>
              <span class="spec-pill-val highlight-size">${f.filesizeFormatted}</span>
            </div>
            <div class="spec-pill">
              <span class="spec-pill-label">Container:</span>
              <span class="spec-pill-val">${f.container.toUpperCase()}</span>
            </div>
            <div class="spec-pill">
              <span class="spec-pill-label">Audio:</span>
              <span class="spec-pill-val">${f.needsAudioMerge ? "Merged with High-Quality Audio" : "Audio Included"}</span>
            </div>
            ${f.fps ? `
            <div class="spec-pill">
              <span class="spec-pill-label">Frame Rate:</span>
              <span class="spec-pill-val">${Math.round(f.fps)} FPS</span>
            </div>` : ""}
          `;
        }
      } else if (type === "audio") {
        if (masterDownloadBtn) {
          masterDownloadBtn.disabled = false;
          masterDownloadBtn.style.opacity = "1";
          masterDownloadBtn.style.cursor = "pointer";
          masterDownloadBtn.style.background = "";
          masterDownloadBtn.style.borderColor = "";
        }
        const a = meta.audioFormats.find((item) => item.formatId === formatId);
        if (a) {
          if (masterDownloadText) {
            masterDownloadText.textContent = `Download ${a.label} (${a.filesizeFormatted})`;
          }
          specsPreview.innerHTML = `
            <div class="spec-pill">
              <span class="spec-pill-label">Audio Type:</span>
              <span class="spec-pill-val">${a.label}</span>
            </div>
            <div class="spec-pill">
              <span class="spec-pill-label">Format:</span>
              <span class="spec-pill-val">${a.ext.toUpperCase()}</span>
            </div>
            <div class="spec-pill">
              <span class="spec-pill-label">Codec:</span>
              <span class="spec-pill-val">${a.codec || a.audioCodec || "Audio"}</span>
            </div>
            <div class="spec-pill">
              <span class="spec-pill-label">Est. File Size:</span>
              <span class="spec-pill-val highlight-size">${a.filesizeFormatted}</span>
            </div>
            <div class="spec-pill">
              <span class="spec-pill-label">Bitrate:</span>
              <span class="spec-pill-val">${a.bitrateFormatted || (a.bitrate ? a.bitrate + " kbps" : "Standard")}</span>
            </div>
          `;
        }
      }
    };

    if (masterDropdown) {
      masterDropdown.addEventListener("change", updateMasterPreview);
      updateMasterPreview();
    }

    if (masterDownloadBtn && masterDropdown) {
      masterDownloadBtn.onclick = () => {
        const [type, formatId] = masterDropdown.value.split(":");
        if (type === "video") {
          const f = meta.videoFormats.find((item) => item.formatId === formatId);
          if (f) {
            if (f.isUnavailable) {
              alert(`❌ This format exceeds the maximum uploaded resolution (${meta.bestVideoFormat?.resolutionLabel || '1080p'}). Downloads of unavailable formats are blocked.`);
              return;
            }
            onDownloadSelect("video", f);
          }
        } else if (type === "audio") {
          const a = meta.audioFormats.find((item) => item.formatId === formatId);
          if (a) onDownloadSelect("audio", a);
        }
      };
    }

    // --- BIND FILTER TOOLBAR ---
    const filterQuality = document.getElementById("filter-quality-select");
    const filterCodec = document.getElementById("filter-codec-select");
    const filterContainer = document.getElementById("filter-container-select");
    const btnResetFilters = document.getElementById("btn-reset-filters");
    const filterCountBadge = document.getElementById("filter-count-badge");
    const videoGridEl = document.getElementById("video-formats-grid");

    const applyFilters = () => {
      if (!videoGridEl) return;
      const qVal = filterQuality ? filterQuality.value : "all";
      const cVal = filterCodec ? filterCodec.value : "all";
      const contVal = filterContainer ? filterContainer.value : "all";

      const cards = videoGridEl.querySelectorAll(".format-card");
      let visibleCount = 0;

      cards.forEach((card) => {
        const qTier = card.getAttribute("data-quality-tier");
        const cTier = card.getAttribute("data-codec-tier");
        const container = card.getAttribute("data-container");

        const matchesQuality = qVal === "all" || qTier === qVal;
        const matchesCodec = cVal === "all" || cTier === cVal;
        const matchesContainer = contVal === "all" || container === contVal;

        if (matchesQuality && matchesCodec && matchesContainer) {
          card.style.display = "flex";
          visibleCount++;
        } else {
          card.style.display = "none";
        }
      });

      const isFiltered = qVal !== "all" || cVal !== "all" || contVal !== "all";
      if (btnResetFilters) {
        btnResetFilters.style.display = isFiltered ? "inline-block" : "none";
      }

      if (filterCountBadge) {
        if (isFiltered) {
          filterCountBadge.textContent = `Showing ${visibleCount} of ${cards.length} formats`;
        } else {
          filterCountBadge.textContent = `Showing all ${cards.length} formats`;
        }
      }

      // Check if none visible
      let emptyMsg = videoGridEl.querySelector(".filter-empty-message");
      if (visibleCount === 0) {
        if (!emptyMsg) {
          emptyMsg = document.createElement("div");
          emptyMsg.className = "filter-empty-message";
          emptyMsg.style.gridColumn = "1 / -1";
          emptyMsg.style.padding = "2.5rem 1rem";
          emptyMsg.style.textAlign = "center";
          emptyMsg.style.color = "var(--text-secondary)";
          emptyMsg.innerHTML = `
            <p style="font-size: 1rem; margin-bottom: 0.75rem;">No video formats match the selected filters.</p>
            <button class="btn btn-secondary btn-sm" id="btn-empty-reset">Reset Filters</button>
          `;
          videoGridEl.appendChild(emptyMsg);
          const emptyReset = document.getElementById("btn-empty-reset");
          if (emptyReset) {
            emptyReset.onclick = resetFilters;
          }
        }
      } else if (emptyMsg) {
        emptyMsg.remove();
      }
    };

    const resetFilters = () => {
      if (filterQuality) filterQuality.value = "all";
      if (filterCodec) filterCodec.value = "all";
      if (filterContainer) filterContainer.value = "all";
      applyFilters();
    };

    if (filterQuality) filterQuality.addEventListener("change", applyFilters);
    if (filterCodec) filterCodec.addEventListener("change", applyFilters);
    if (filterContainer) filterContainer.addEventListener("change", applyFilters);
    if (btnResetFilters) btnResetFilters.addEventListener("click", resetFilters);

    // Bind Subtab switching
    const subtabVideoBtn = document.getElementById("subtab-video-btn");
    const subtabAudioBtn = document.getElementById("subtab-audio-btn");
    const videoGrid = document.getElementById("video-formats-grid");
    const audioGrid = document.getElementById("audio-formats-grid");
    const filtersBar = document.getElementById("format-filters-bar");

    if (subtabVideoBtn && subtabAudioBtn && videoGrid && audioGrid) {
      subtabVideoBtn.onclick = () => {
        subtabVideoBtn.classList.add("active");
        subtabAudioBtn.classList.remove("active");
        videoGrid.style.display = "grid";
        audioGrid.style.display = "none";
        if (filtersBar) filtersBar.style.display = "flex";
      };

      subtabAudioBtn.onclick = () => {
        subtabAudioBtn.classList.add("active");
        subtabVideoBtn.classList.remove("active");
        audioGrid.style.display = "grid";
        videoGrid.style.display = "none";
        if (filtersBar) filtersBar.style.display = "none";
      };
    }

    // Quick presets
    const btnQuickBest = document.getElementById("btn-quick-best");
    if (btnQuickBest && meta.bestVideoFormat) {
      btnQuickBest.onclick = () => onDownloadSelect("video", meta.bestVideoFormat);
    }

    const btnQuickRec = document.getElementById("btn-quick-rec");
    if (btnQuickRec && meta.recommendedVideoFormat) {
      btnQuickRec.onclick = () => onDownloadSelect("video", meta.recommendedVideoFormat);
    }

    const btnQuickAudio = document.getElementById("btn-quick-audio");
    if (btnQuickAudio) {
      const mp3Opt = meta.audioFormats.find((a) => a.ext === "mp3") || meta.audioFormats[0];
      if (mp3Opt) {
        btnQuickAudio.onclick = () => onDownloadSelect("audio", mp3Opt);
      }
    }

    // Bind individual format card download buttons
    container.querySelectorAll(".btn-download-video").forEach((btn) => {
      btn.addEventListener("click", () => {
        const formatId = btn.getAttribute("data-format-id");
        const format = meta.videoFormats.find((f) => f.formatId === formatId);
        if (format) onDownloadSelect("video", format);
      });
    });

    container.querySelectorAll(".btn-download-audio").forEach((btn) => {
      btn.addEventListener("click", () => {
        const formatId = btn.getAttribute("data-format-id");
        const format = meta.audioFormats.find((f) => f.formatId === formatId);
        if (format) onDownloadSelect("audio", format);
      });
    });
  },

  buildVideoFormatCards(meta) {
    if (!meta.videoFormats || meta.videoFormats.length === 0) {
      return `<div style="grid-column: 1/-1; padding: 2rem; text-align: center; color: var(--text-muted);">No separate video streams detected.</div>`;
    }

    return meta.videoFormats.map((f) => {
      const isAv1 = (f.videoCodec || "").includes("AV1") || f.formatId.includes("av1");
      const is8K = (f.height && f.height >= 3500) || f.resolutionLabel.includes("8K");
      const is4K = !is8K && ((f.height && f.height >= 2000) || f.resolutionLabel.includes("4K"));

      let badgeHtml = "";
      if (f.isUnavailable) {
        badgeHtml = `<span class="badge-tag" style="background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.4); font-weight: 700;">🔒 Unavailable (Max: ${meta.bestVideoFormat ? meta.bestVideoFormat.resolutionLabel : '1080p'})</span>`;
      } else {
        if (f.isRecommended) {
          badgeHtml += `<span class="badge-tag badge-rec">⭐ Recommended</span>`;
        }
        if (f.isBest) {
          badgeHtml += `<span class="badge-tag badge-best">Highest Resolution</span>`;
        }
        if (isAv1) {
          badgeHtml += `<span class="badge-tag badge-av1">⚡ AV1 Lowest Size</span>`;
        }
        if (is8K) {
          badgeHtml += `<span class="badge-tag badge-8k">8K Ultra HD</span>`;
        } else if (is4K) {
          badgeHtml += `<span class="badge-tag badge-4k">4K Ultra HD</span>`;
        }
      }

      // Calculate quality tier for filtering
      let qualityTier = "sd";
      if (is8K) qualityTier = "8k";
      else if (is4K) qualityTier = "4k";
      else if (f.height && f.height >= 1300) qualityTier = "1440p";
      else if (f.height && f.height >= 900) qualityTier = "1080p";
      else if (f.height && f.height >= 600) qualityTier = "720p";

      // Calculate codec tier for filtering
      let codecTier = "other";
      let codecChipClass = "codec-chip-default";
      const cLower = (f.videoCodec || "").toLowerCase();
      if (cLower.includes("h.264") || cLower.includes("avc")) {
        codecTier = "h264";
        codecChipClass = "codec-chip-h264";
      } else if (cLower.includes("av1")) {
        codecTier = "av1";
        codecChipClass = "codec-chip-av1";
      } else if (cLower.includes("vp9")) {
        codecTier = "vp9";
        codecChipClass = "codec-chip-vp9";
      }

      const cardClass = `format-card ${f.isBest ? 'best' : ''} ${f.isRecommended ? 'recommended' : ''} ${f.isUnavailable ? 'unavailable-shadow' : ''}`;

      return `
        <div class="${cardClass}" 
             data-quality-tier="${qualityTier}" 
             data-codec-tier="${codecTier}" 
             data-container="${f.container}">
          <div class="format-card-top">
            <div class="format-res-box">
              <div class="format-res-title">
                ${f.resolutionLabel}
                ${badgeHtml}
              </div>
              <div class="format-codec-tags">
                <span class="container-badge">${f.container.toUpperCase()}</span>
                <span class="codec-chip ${codecChipClass}">${f.videoCodec}</span>
              </div>
            </div>
            <div class="format-size-box">
              <span class="format-filesize-main">${f.filesizeFormatted}</span>
              <span class="format-filesize-sub">${f.isUnavailable ? '❌ Not Supported' : (isAv1 ? '⚡ AV1 Compression (~45% smaller)' : 'Source Stream')}</span>
            </div>
          </div>

          <div class="format-meta-grid">
            <span>Resolution: <strong>${f.resolution}</strong></span>
            <span>Frame Rate: <strong>${f.fps ? `${Math.round(f.fps)} fps` : 'Standard'}</strong></span>
            <span>Codec Standard: <strong>${f.videoCodec}</strong></span>
            <span>Efficiency: <strong>${isAv1 ? '⚡ AV1 Next-Gen (Best Quality • Lowest Size)' : 'Standard (H.264 / AVC)'}</strong></span>
          </div>

          <div class="format-card-actions">
            ${f.isUnavailable ? `
              <button class="btn btn-sm btn-disabled" disabled style="background: rgba(15, 23, 42, 0.85); color: #94a3b8; cursor: not-allowed; border: 1px dashed rgba(239, 68, 68, 0.5); width: 100%; font-size: 0.82rem; padding: 0.55rem;">
                🔒 Exceeds Source Quality (Max: ${meta.bestVideoFormat ? meta.bestVideoFormat.resolutionLabel : '1080p'})
              </button>
            ` : `
            <button class="btn btn-primary btn-sm btn-download-video" data-format-id="${f.formatId}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              Download ${f.resolutionLabel}
            </button>
            `}
          </div>
        </div>
      `;
    }).join("");
  },

  buildAudioFormatCards(meta) {
    if (!meta.audioFormats || meta.audioFormats.length === 0) {
      return `<div style="grid-column: 1/-1; padding: 2rem; text-align: center; color: var(--text-muted);">No audio tracks detected.</div>`;
    }

    return meta.audioFormats.map((a) => {
      let badgeHtml = "";
      if (a.isBest) {
        badgeHtml += `<span class="badge-tag badge-best">Best Source</span>`;
      }
      if (a.isRecommended) {
        badgeHtml += `<span class="badge-tag badge-rec">Universal</span>`;
      }

      const cardClass = `format-card ${a.isBest ? 'best' : ''} ${a.isRecommended ? 'recommended' : ''}`;

      return `
        <div class="${cardClass}">
          <div class="format-card-top">
            <div class="format-res-box">
              <div class="format-res-title">
                ${a.label}
                ${badgeHtml}
              </div>
              <span style="font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase;">
                ${a.container} • ${a.codec}
              </span>
            </div>
            <span style="font-size: 0.9rem; font-weight: 700; color: var(--text-primary);">
              ${a.filesizeFormatted}
            </span>
          </div>

          <div class="format-meta-grid">
            <span>Bitrate: <strong>${a.bitrateFormatted}</strong></span>
            <span>Sample Rate: <strong>${a.sampleRateFormatted}</strong></span>
            <span>Format: <strong>.${a.ext.toUpperCase()}</strong></span>
            <span>Type: <strong>${a.type === 'convert' ? 'FFmpeg Converted' : 'Direct Stream'}</strong></span>
          </div>

          <div class="format-card-actions">
            <button class="btn btn-primary btn-sm btn-download-audio" data-format-id="${a.formatId}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>
              Download Audio
            </button>
          </div>
        </div>
      `;
    }).join("");
  },

  // Render Queue List
  renderQueue(items, handlers) {
    const container = document.getElementById("queue-items-container");
    const countBadge = document.getElementById("queue-count-badge");
    const headerCount = document.getElementById("queue-header-count");
    const activeStat = document.getElementById("queue-stat-active");
    const completedStat = document.getElementById("queue-stat-completed");
    const queuedStat = document.getElementById("queue-stat-queued");

    if (!container) return;

    const total = items.length;
    const active = items.filter((i) => i.status === "downloading" || i.status === "merging" || i.status === "converting").length;
    const completed = items.filter((i) => i.status === "completed").length;
    const queued = items.filter((i) => i.status === "queued").length;

    if (countBadge) countBadge.textContent = active > 0 ? active : total;
    if (headerCount) headerCount.textContent = total;
    if (activeStat) activeStat.textContent = active;
    if (completedStat) completedStat.textContent = completed;
    if (queuedStat) queuedStat.textContent = queued;

    if (total === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
          <h3>Download Queue is Empty</h3>
          <p>Add video or audio links from the Downloader tab to start downloading.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = items.map((item) => {
      const isDownloading = item.status === "downloading";
      const isMerging = item.status === "merging";
      const isConverting = item.status === "converting";
      const isCompleted = item.status === "completed";
      const isFailed = item.status === "failed";
      const isPaused = item.status === "paused";

      let statusLabel = item.status;
      if (isMerging) statusLabel = "Merging Audio/Video";
      if (isConverting) statusLabel = "Converting Audio";

      return `
        <div class="queue-item" id="queue-item-${item.id}">
          <div class="queue-item-thumb">
            <img src="${item.thumbnail || 'assets/placeholder.jpg'}" alt="${item.title}" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'140\\' height=\\'80\\' viewBox=\\'0 0 140 80\\'><rect fill=\\'%23111\\' width=\\'140\\' height=\\'80\\'/></svg>'"/>
          </div>

          <div class="queue-item-content">
            <div class="queue-item-title" title="${item.title}">${item.title}</div>
            <div class="queue-item-tags">
              <span class="status-badge status-${item.status}">${statusLabel}</span>
              <span class="badge-tag badge-res">${item.selectedFormat.resolutionLabel || item.type.toUpperCase()}</span>
              <span class="badge-tag badge-res">.${item.selectedFormat.container.toUpperCase()}</span>
              <span class="badge-tag badge-threads" title="Active Multi-Thread Acceleration (${item.threads || 8} Threads)">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                ${item.threads || 8} Threads
              </span>
            </div>

            <div class="progress-container">
              <div class="progress-bar-bg">
                <div class="progress-bar-fill" style="width: ${item.progress}%;"></div>
              </div>
              <div class="progress-meta">
                <span>${item.progress.toFixed(1)}% • ${item.downloadedFormatted} / ${item.totalFormatted}</span>
                <span>
                  ${isDownloading ? `⚡ ${item.downloadSpeed} • ETA: ${item.eta}` : ''}
                  ${isMerging ? '⚙️ Finalizing & Merging with FFmpeg...' : ''}
                  ${isConverting ? '🎵 Converting audio...' : ''}
                  ${isCompleted ? '✅ Completed' : ''}
                  ${isFailed ? `⚠️ ${item.errorMessage || 'Failed'}` : ''}
                  ${isPaused ? '⏸️ Paused' : ''}
                </span>
              </div>
            </div>

            ${(isCompleted && item.destinationFile) ? `
              <div style="margin-top: 0.5rem; padding: 0.35rem 0.6rem; background: rgba(0,0,0,0.25); border-radius: 4px; display: flex; align-items: center; justify-content: space-between; font-size: 0.75rem; color: var(--text-secondary); border: 1px solid var(--border-color);">
                <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 82%; font-family: monospace;" title="${item.destinationFile}">
                  📁 ${item.destinationFile}
                </span>
                <button class="btn btn-secondary btn-sm btn-copy-path" data-path="${item.destinationFile}" style="padding: 0.15rem 0.45rem; font-size: 0.68rem;" title="Copy file path">
                  Copy Path
                </button>
              </div>
            ` : ''}
          </div>

          <div class="queue-item-actions">
            ${isDownloading ? `
              <button class="btn btn-secondary btn-sm btn-pause" data-id="${item.id}" title="Pause">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
              </button>
            ` : ""}

            ${isPaused ? `
              <button class="btn btn-secondary btn-sm btn-resume" data-id="${item.id}" title="Resume">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
              </button>
            ` : ""}

            ${isFailed ? `
              <button class="btn btn-secondary btn-sm btn-retry" data-id="${item.id}" title="Retry">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
              </button>
            ` : ""}

            ${isCompleted ? `
              <button class="btn btn-primary btn-sm btn-play-in-app" data-title="${item.title}" data-path="${item.destinationFile || ''}" data-type="${item.type}" title="Play in App">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                Play
              </button>
              <button class="btn btn-secondary btn-sm btn-open-folder" data-path="${item.destinationFile || item.destinationDir}" title="Show in Folder">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                Folder
              </button>
            ` : ""}

            ${(isDownloading || isMerging || isConverting) ? `
              <button class="btn btn-danger btn-sm btn-cancel" data-id="${item.id}" title="Cancel">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            ` : `
              <button class="btn btn-secondary btn-sm btn-remove" data-id="${item.id}" title="Remove">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
            `}
          </div>
        </div>
      `;
    }).join("");

    // Bind action events
    container.querySelectorAll(".btn-cancel").forEach((btn) => {
      btn.onclick = () => handlers.onCancel(btn.getAttribute("data-id"));
    });

    container.querySelectorAll(".btn-pause").forEach((btn) => {
      btn.onclick = () => handlers.onPause(btn.getAttribute("data-id"));
    });

    container.querySelectorAll(".btn-resume").forEach((btn) => {
      btn.onclick = () => handlers.onResume(btn.getAttribute("data-id"));
    });

    container.querySelectorAll(".btn-retry").forEach((btn) => {
      btn.onclick = () => handlers.onRetry(btn.getAttribute("data-id"));
    });

    container.querySelectorAll(".btn-remove").forEach((btn) => {
      btn.onclick = () => handlers.onRemove(btn.getAttribute("data-id"));
    });

    container.querySelectorAll(".btn-play-in-app").forEach((btn) => {
      btn.onclick = () => {
        const title = btn.getAttribute("data-title") || "Media Player";
        const path = btn.getAttribute("data-path") || "";
        const type = btn.getAttribute("data-type") || "video";
        UI.openPlayerModal(title, path, type);
      };
    });

    container.querySelectorAll(".btn-open-folder").forEach((btn) => {
      btn.onclick = () => handlers.onOpenFolder(btn.getAttribute("data-path"));
    });

    container.querySelectorAll(".btn-copy-path").forEach((btn) => {
      btn.onclick = async () => {
        const path = btn.getAttribute("data-path");
        if (path) {
          try {
            await navigator.clipboard.writeText(path);
            UI.showToast("File path copied to clipboard!", "success", 2000);
          } catch (_e) {
            UI.showToast(path, "info", 5000);
          }
        }
      };
    });
  },

  // Render History
  renderHistory(historyItems, handlers) {
    const container = document.getElementById("history-items-container");
    const countBadge = document.getElementById("history-count-badge");
    const headerCount = document.getElementById("history-header-count");

    if (!container) return;

    const total = historyItems.length;
    if (countBadge) countBadge.textContent = total;
    if (headerCount) headerCount.textContent = total;

    if (total === 0) {
      container.innerHTML = `
        <div class="empty-state" style="grid-column: 1/-1;">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
          <h3>No Download History</h3>
          <p>Videos and audio you download will be recorded here for quick access.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = historyItems.map((item) => {
      const date = new Date(item.downloadDate);
      const dateStr = date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      return `
        <div class="history-card" id="history-item-${item.id}">
          <div class="history-card-thumb">
            <img src="${item.thumbnail || 'assets/placeholder.jpg'}" alt="${item.title}" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'320\\' height=\\'180\\' viewBox=\\'0 0 320 180\\'><rect fill=\\'%23111\\' width=\\'320\\' height=\\'180\\'/></svg>'"/>
            <span class="media-duration-badge" style="bottom: 6px; right: 6px;">.${item.container.toUpperCase()}</span>
          </div>
          <div class="history-card-body">
            <div style="flex: 1; min-width: 0; padding-right: 1rem;">
              <h4 class="history-card-title" title="${item.title}">${item.title}</h4>
              <div class="history-card-meta" style="margin-top: 0.4rem;">
                <span class="badge-tag badge-res">${item.resolutionLabel}</span>
                <span>${item.fileSizeFormatted}</span>
                ${item.duration ? `<span>⏱ ${UI.formatDuration(item.duration)}</span>` : ''}
                <span>📅 ${dateStr}</span>
              </div>
            </div>
            <div class="history-card-actions">
              <button class="btn btn-primary btn-sm btn-play-in-app" data-title="${item.title}" data-path="${item.filePath}" data-type="${item.type}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                Play
              </button>
              ${(window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") ? `
                <button class="btn btn-secondary btn-sm btn-open-folder" data-path="${item.filePath}">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                  Folder
                </button>
              ` : `
                <a class="btn btn-secondary btn-sm" href="/api/media/download?path=${encodeURIComponent(item.filePath)}" download="${encodeURIComponent(item.fileName || 'download')}">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                  Save File
                </a>
              `}
              <button class="btn btn-secondary btn-sm btn-delete-history" data-id="${item.id}" style="margin-left: auto;" title="Remove Entry">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
            </div>
          </div>
        </div>
      `;
    }).join("");

    container.querySelectorAll(".btn-play-in-app").forEach((btn) => {
      btn.onclick = () => {
        const title = btn.getAttribute("data-title") || "Media Player";
        const path = btn.getAttribute("data-path") || "";
        const type = btn.getAttribute("data-type") || "video";
        UI.openPlayerModal(title, path, type);
      };
    });

    container.querySelectorAll(".btn-open-folder").forEach((btn) => {
      btn.onclick = () => handlers.onOpenFolder(btn.getAttribute("data-path"));
    });

    container.querySelectorAll(".btn-delete-history").forEach((btn) => {
      btn.onclick = () => handlers.onDeleteHistory(btn.getAttribute("data-id"));
    });

    container.querySelectorAll(".btn-copy-path").forEach((btn) => {
      btn.onclick = async () => {
        const path = btn.getAttribute("data-path");
        if (path) {
          try {
            await navigator.clipboard.writeText(path);
            UI.showToast("File path copied to clipboard!", "success", 2000);
          } catch (_e) {
            UI.showToast(path, "info", 5000);
          }
        }
      };
    });
  },

  // In-App Media Player Modal
  openPlayerModal(title, filePath, type = "video") {
    const overlay = document.getElementById("player-modal-overlay");
    const titleEl = document.getElementById("player-modal-title");
    const mediaContainer = document.getElementById("player-media-container");
    const pathDisplay = document.getElementById("player-file-path-display");
    const closeBtn = document.getElementById("player-modal-close-btn");
    const copyPathBtn = document.getElementById("player-btn-copy-path");
    const openFolderBtn = document.getElementById("player-btn-open-folder");
    const openExternalBtn = document.getElementById("player-btn-open-external");

    if (!overlay || !mediaContainer) return;

    if (titleEl) titleEl.textContent = title;
    if (pathDisplay) {
      pathDisplay.textContent = filePath;
      pathDisplay.title = filePath;
    }

    const streamUrl = `/api/media/stream?path=${encodeURIComponent(filePath)}`;

    if (type === "audio" || filePath.endsWith(".mp3") || filePath.endsWith(".m4a") || filePath.endsWith(".wav")) {
      mediaContainer.style.aspectRatio = "auto";
      mediaContainer.style.padding = "2rem";
      mediaContainer.innerHTML = `
        <div style="width: 100%; display: flex; flex-direction: column; align-items: center; gap: 1rem;">
          <div style="font-size: 3rem;">🎵</div>
          <audio controls autoplay style="width: 100%;">
            <source src="${streamUrl}">
            Your browser does not support audio playback.
          </audio>
        </div>
      `;
    } else {
      mediaContainer.style.aspectRatio = "16/9";
      mediaContainer.style.padding = "0";
      mediaContainer.innerHTML = `
        <video controls autoplay playsinline style="width: 100%; height: 100%; object-fit: contain;">
          <source src="${streamUrl}">
          Your browser does not support video playback.
        </video>
      `;
    }

    const closePlayer = () => {
      overlay.classList.remove("active");
      mediaContainer.innerHTML = "";
    };

    if (closeBtn) closeBtn.onclick = closePlayer;

    overlay.onclick = (e) => {
      if (e.target === overlay) closePlayer();
    };

    if (copyPathBtn) {
      copyPathBtn.onclick = async () => {
        try {
          await navigator.clipboard.writeText(filePath);
          UI.showToast("File path copied to clipboard!", "success", 2000);
        } catch (_err) {
          UI.showToast(filePath, "info", 5000);
        }
      };
    }

    if (openFolderBtn) {
      openFolderBtn.onclick = async () => {
        try {
          const res = await API.openFolder(filePath);
          UI.showToast(`📂 Opened in Windows File Explorer: ${res?.file || res?.folder || filePath}`, "success", 3000);
        } catch (err) {
          UI.showToast(err.message || "Failed to open folder", "error");
        }
      };
    }

    if (openExternalBtn) {
      openExternalBtn.onclick = async () => {
        try {
          await API.openFile(filePath);
          UI.showToast("Launching in Windows default player...", "info", 2000);
        } catch (err) {
          UI.showToast(err.message, "error");
        }
      };
    }

    overlay.classList.add("active");
  },

  // In-App Downloads Folder Explorer Modal
  openFolderModal(folderPath, initialFiles = [], onPlayCallback = null) {
    const overlay = document.getElementById("folder-modal-overlay");
    const pathInput = document.getElementById("folder-modal-path-input");
    const filesCountEl = document.getElementById("folder-modal-files-count");
    const filesList = document.getElementById("folder-modal-files-list");
    const closeBtn = document.getElementById("folder-modal-close-btn");
    const doneBtn = document.getElementById("folder-modal-done-btn");
    const copyBtn = document.getElementById("folder-modal-copy-btn");
    const launchExplorerBtn = document.getElementById("folder-modal-launch-explorer-btn");
    const refreshBtn = document.getElementById("folder-modal-refresh-btn");

    if (!overlay) return;

    if (pathInput) {
      pathInput.value = folderPath;
      pathInput.onclick = () => pathInput.select();
    }

    const renderFiles = (files) => {
      if (filesCountEl) {
        filesCountEl.textContent = `${files.length} file${files.length === 1 ? '' : 's'} on disk`;
      }
      if (!filesList) return;

      if (!files || files.length === 0) {
        filesList.innerHTML = `
          <div style="text-align: center; padding: 2.5rem 1rem; color: var(--text-muted); background: var(--bg-card); border-radius: var(--radius-md); border: 1px dashed var(--border-color);">
            <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">📂</div>
            <div style="font-weight: 600; color: var(--text-secondary); margin-bottom: 0.25rem;">Folder is currently empty</div>
            <div style="font-size: 0.8rem;">Downloaded videos or audio will appear here automatically.</div>
          </div>
        `;
        return;
      }

      filesList.innerHTML = files.map((file) => {
        const isAudio = ["mp3", "m4a", "wav", "aac", "flac", "ogg", "opus"].includes(file.ext);
        const icon = isAudio ? "🎵" : "🎬";
        const dateStr = file.mtime ? new Date(file.mtime).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : "";

        return `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 0.85rem; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); margin-bottom: 0.5rem; gap: 0.75rem; transition: border-color 0.2s ease;">
            <div style="display: flex; align-items: center; gap: 0.75rem; overflow: hidden; flex: 1;">
              <span style="font-size: 1.4rem; flex-shrink: 0;">${icon}</span>
              <div style="overflow: hidden; min-width: 0;">
                <div style="font-size: 0.88rem; font-weight: 600; color: var(--text-primary); text-overflow: ellipsis; overflow: hidden; white-space: nowrap;" title="${file.name}">
                  ${file.name}
                </div>
                <div style="font-size: 0.75rem; color: var(--text-muted); display: flex; align-items: center; gap: 0.5rem; margin-top: 3px; flex-wrap: wrap;">
                  <span style="color: var(--primary); font-weight: 600; background: rgba(99, 102, 241, 0.1); padding: 1px 6px; border-radius: 4px;">${file.sizeFormatted}</span>
                  <span style="text-transform: uppercase; font-weight: 600; color: var(--text-secondary);">${file.ext}</span>
                  ${dateStr ? `<span style="color: var(--text-muted);">${dateStr}</span>` : ""}
                </div>
              </div>
            </div>
            <div style="display: flex; gap: 0.4rem; flex-shrink: 0; align-items: center;">
              <button class="btn btn-primary btn-sm btn-modal-play" data-path="${encodeURIComponent(file.path)}" data-name="${encodeURIComponent(file.name)}" data-type="${isAudio ? 'audio' : 'video'}" title="Play with in-app player">
                ▶ Play
              </button>
              <a href="/api/media/download?path=${encodeURIComponent(file.path)}" download="${file.name}" class="btn btn-secondary btn-sm" title="Download to PC via browser">
                ⬇ Save
              </a>
              <button class="btn btn-secondary btn-sm btn-modal-copy-file" data-path="${encodeURIComponent(file.path)}" title="Copy full file path">
                📋
              </button>
              <button class="btn btn-secondary btn-sm btn-modal-explore-file" data-path="${encodeURIComponent(file.path)}" title="Show in Windows Explorer">
                🔍
              </button>
            </div>
          </div>
        `;
      }).join("");

      // Bind in-app play buttons
      filesList.querySelectorAll(".btn-modal-play").forEach((btn) => {
        btn.onclick = () => {
          const path = decodeURIComponent(btn.getAttribute("data-path"));
          const name = decodeURIComponent(btn.getAttribute("data-name"));
          const type = btn.getAttribute("data-type");
          if (onPlayCallback) {
            onPlayCallback(name, path, type);
          } else {
            UI.openPlayerModal(name, path, type);
          }
        };
      });

      // Bind copy file path buttons
      filesList.querySelectorAll(".btn-modal-copy-file").forEach((btn) => {
        btn.onclick = async () => {
          const path = decodeURIComponent(btn.getAttribute("data-path"));
          try {
            await navigator.clipboard.writeText(path);
            UI.showToast("File path copied to clipboard!", "success", 2000);
          } catch (_e) {
            UI.showToast(path, "info", 5000);
          }
        };
      });

      // Bind explore file buttons
      filesList.querySelectorAll(".btn-modal-explore-file").forEach((btn) => {
        btn.onclick = async () => {
          const path = decodeURIComponent(btn.getAttribute("data-path"));
          try {
            await API.openFolder(path);
            UI.showToast("Highlighting in Windows Explorer...", "info", 2000);
          } catch (err) {
            UI.showToast(err.message, "error");
          }
        };
      });
    };

    renderFiles(initialFiles);

    const closeModal = () => {
      overlay.classList.remove("active");
    };

    if (closeBtn) closeBtn.onclick = closeModal;
    if (doneBtn) doneBtn.onclick = closeModal;

    overlay.onclick = (e) => {
      if (e.target === overlay) closeModal();
    };

    if (copyBtn) {
      copyBtn.onclick = async () => {
        try {
          await navigator.clipboard.writeText(folderPath);
          const origText = copyBtn.innerHTML;
          copyBtn.innerHTML = `✅ Copied!`;
          UI.showToast("Downloads folder path copied to clipboard!", "success", 2500);
          setTimeout(() => {
            copyBtn.innerHTML = origText;
          }, 2000);
        } catch (_err) {
          UI.showToast(folderPath, "info", 5000);
        }
      };
    }

    if (launchExplorerBtn) {
      launchExplorerBtn.onclick = async () => {
        const origText = launchExplorerBtn.innerHTML;
        launchExplorerBtn.innerHTML = `⏳ Opening...`;
        launchExplorerBtn.disabled = true;
        try {
          await navigator.clipboard.writeText(folderPath);
          await API.openFolder(folderPath);
          UI.showToast("Opened in Windows Explorer! (Path copied to clipboard)", "success", 3000);
        } catch (err) {
          UI.showToast(err.message || "Failed to open Explorer", "error");
        } finally {
          setTimeout(() => {
            launchExplorerBtn.innerHTML = origText;
            launchExplorerBtn.disabled = false;
          }, 1500);
        }
      };
    }

    if (refreshBtn) {
      refreshBtn.onclick = async () => {
        const origText = refreshBtn.innerHTML;
        refreshBtn.innerHTML = `⏳ Refreshing...`;
        refreshBtn.disabled = true;
        try {
          const res = await API.getDownloadsFiles();
          if (res && res.files) {
            renderFiles(res.files);
            UI.showToast(`Updated! ${res.files.length} file(s) found.`, "info", 2000);
          }
        } catch (err) {
          UI.showToast(err.message, "error");
        } finally {
          setTimeout(() => {
            refreshBtn.innerHTML = origText;
            refreshBtn.disabled = false;
          }, 800);
        }
      };
    }

    overlay.classList.add("active");
  },
};
