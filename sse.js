export class SSEClient {
  constructor() {
    this.source = null;
    this.listeners = new Set();
    this.reconnectTimeout = null;
  }

  connect() {
    if (this.source) return;

    this.source = new EventSource("/api/downloads/events");

    this.source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        for (const listener of this.listeners) {
          listener(payload);
        }
      } catch (err) {
        console.error("SSE parse error:", err);
      }
    };

    this.source.onerror = (_err) => {
      if (this.source) {
        this.source.close();
        this.source = null;
      }
      // Reconnect after 3 seconds
      if (!this.reconnectTimeout) {
        this.reconnectTimeout = setTimeout(() => {
          this.reconnectTimeout = null;
          this.connect();
        }, 3000);
      }
    };
  }

  subscribe(callback) {
    this.listeners.add(callback);
    if (!this.source) {
      this.connect();
    }
  }

  unsubscribe(callback) {
    this.listeners.delete(callback);
    if (this.listeners.size === 0 && this.source) {
      this.source.close();
      this.source = null;
    }
  }
}

export const sseClient = new SSEClient();
