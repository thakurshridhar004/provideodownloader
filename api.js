export const API = {
  baseUrl: "",

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const defaultHeaders = {
      "Content-Type": "application/json",
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...defaultHeaders,
          ...options.headers,
        },
      });

      const contentType = response.headers.get("content-type");
      let data = null;
      if (contentType && contentType.includes("application/json")) {
        data = await response.json();
      } else {
        data = await response.text();
      }

      if (!response.ok) {
        const errorMsg = data && data.error ? data.error : `HTTP ${response.status}: ${response.statusText}`;
        throw new Error(errorMsg);
      }

      return data;
    } catch (err) {
      console.error(`API Error on ${endpoint}:`, err);
      throw err;
    }
  },

  // Analyze URL
  async analyzeUrl(url) {
    return await this.request("/api/analyze", {
      method: "POST",
      body: JSON.stringify({ url }),
    });
  },

  // Fetch Playlist Info
  async getPlaylistInfo(url) {
    return await this.request("/api/playlist/info", {
      method: "POST",
      body: JSON.stringify({ url }),
    });
  },

  // Client Identity for Privacy Isolation
  getClientId() {
    let id = localStorage.getItem("downloader_client_id");
    if (!id) {
      id = "client_" + Math.random().toString(36).substring(2, 10) + "_" + Date.now().toString(36);
      localStorage.setItem("downloader_client_id", id);
    }
    return id;
  },

  // Queue
  async getQueue() {
    return await this.request(`/api/downloads?clientId=${encodeURIComponent(this.getClientId())}`);
  },

  async enqueueDownload(payload) {
    return await this.request("/api/downloads/queue", {
      method: "POST",
      body: JSON.stringify({
        ...payload,
        clientId: this.getClientId(),
      }),
    });
  },

  async cancelDownload(id) {
    return await this.request(`/api/downloads/${id}/cancel`, { method: "POST" });
  },

  async pauseDownload(id) {
    return await this.request(`/api/downloads/${id}/pause`, { method: "POST" });
  },

  async resumeDownload(id) {
    return await this.request(`/api/downloads/${id}/resume`, { method: "POST" });
  },

  async retryDownload(id) {
    return await this.request(`/api/downloads/${id}/retry`, { method: "POST" });
  },

  async removeDownload(id) {
    return await this.request(`/api/downloads/${id}`, { method: "DELETE" });
  },

  async clearCompleted() {
    return await this.request("/api/downloads/clear-completed", { method: "POST" });
  },

  async clearAllQueue() {
    return await this.request("/api/downloads/clear-all", { method: "POST" });
  },

  // History
  async getHistory() {
    return await this.request(`/api/history?clientId=${encodeURIComponent(this.getClientId())}`);
  },

  async deleteHistoryItem(id) {
    return await this.request(`/api/history/${id}`, { method: "DELETE" });
  },

  async clearAllHistory() {
    return await this.request("/api/history", { method: "DELETE" });
  },

  // Settings
  async getSettings() {
    return await this.request("/api/settings");
  },

  async updateSettings(settings) {
    return await this.request("/api/settings", {
      method: "POST",
      body: JSON.stringify(settings),
    });
  },

  // System
  async openFolder(path) {
    return await this.request("/api/system/open-folder", {
      method: "POST",
      body: JSON.stringify({ path }),
    });
  },

  async getDownloadsFiles() {
    return await this.request("/api/system/downloads-files");
  },

  async openFile(path) {
    return await this.request("/api/system/open-file", {
      method: "POST",
      body: JSON.stringify({ path }),
    });
  },
};
