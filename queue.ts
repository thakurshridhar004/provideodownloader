import { DownloadItem, DownloadStatus } from "./types.ts";
import { DownloadTask } from "./downloader.ts";
import { settingsManager } from "./settings.ts";
import { join } from "https://deno.land/std@0.224.0/path/mod.ts";

const ROOT_DIR = import.meta.dirname ? join(import.meta.dirname, "..") : Deno.cwd();
const QUEUE_FILE = join(ROOT_DIR, "data", "queue.json");

export type QueueSubscriber = (event: { type: string; item?: DownloadItem; items: DownloadItem[] }) => void;

export class QueueManager {
  private items: DownloadItem[] = [];
  private tasks: Map<string, DownloadTask> = new Map();
  private subscribers: Set<QueueSubscriber> = new Set();

  constructor() {
    this.load();
  }

  private load() {
    try {
      if (Deno.statSync(QUEUE_FILE).isFile) {
        const text = Deno.readTextFileSync(QUEUE_FILE);
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          // If server was restarted while an item was downloading, mark it as paused so it can be resumed
          this.items = parsed.map((item: DownloadItem) => {
            if (item.status === "downloading" || item.status === "merging" || item.status === "converting") {
              return { ...item, status: "paused" };
            }
            return item;
          });
          this.save();
        }
      }
    } catch (_err) {
      this.items = [];
    }
  }

  private save() {
    try {
      Deno.writeTextFileSync(QUEUE_FILE, JSON.stringify(this.items, null, 2));
    } catch (err) {
      console.error("Failed to save queue to disk:", err);
    }
  }

  public subscribe(sub: QueueSubscriber) {
    this.subscribers.add(sub);
    // Send initial snapshot
    sub({ type: "snapshot", items: this.getItems() });
  }

  public unsubscribe(sub: QueueSubscriber) {
    this.subscribers.delete(sub);
  }

  private broadcast(type: string, item?: DownloadItem) {
    this.save();
    const items = this.getItems();
    for (const sub of this.subscribers) {
      try {
        sub({ type, item, items });
      } catch (err) {
        console.error("Queue subscriber error:", err);
      }
    }
  }

  public getItems(): DownloadItem[] {
    return [...this.items];
  }

  public getItem(id: string): DownloadItem | undefined {
    return this.items.find((i) => i.id === id);
  }

  public enqueue(
    data: Omit<
      DownloadItem,
      "id" | "status" | "progress" | "downloadSpeed" | "downloadedBytes" | "totalBytes" | "downloadedFormatted" | "totalFormatted" | "eta" | "createdAt"
    >
  ): { success: boolean; item?: DownloadItem; error?: string } {
    if (data.type === "video" && (data.selectedFormat as any)?.isUnavailable) {
      return {
        success: false,
        error: `Cannot download ${data.selectedFormat?.resolutionLabel || "this format"}: This resolution exceeds the original video host's uploaded quality. Fake upscaling is prevented.`,
      };
    }

    // Duplicate check: check if the exact same URL is currently active, queued, or paused
    const duplicate = this.items.find(
      (i) =>
        i.url === data.url &&
        (i.status === "queued" || i.status === "downloading" || i.status === "merging" || i.status === "converting" || i.status === "paused")
    );

    if (duplicate) {
      if (duplicate.status === "paused") {
        this.resume(duplicate.id);
      }
      return {
        success: true,
        alreadyQueued: true,
        item: duplicate,
      } as any;
    }

    const id = `dl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const settings = settingsManager.getSettings();

    const initialTotal = data.selectedFormat?.filesizeFormatted || "Calculating...";
    const initialTotalBytes = data.selectedFormat?.filesize || 0;

    const item: DownloadItem = {
      ...data,
      id,
      threads: settings.downloadThreads || 8,
      destinationDir: data.destinationDir || settings.downloadPath,
      status: "queued",
      progress: 0,
      downloadSpeed: "0 B/s",
      downloadedBytes: 0,
      totalBytes: initialTotalBytes,
      downloadedFormatted: "0 B",
      totalFormatted: initialTotal,
      eta: "--:--",
      createdAt: Date.now(),
    };

    this.items.push(item);
    this.broadcast("item_added", item);

    if (settings.autoStartQueue) {
      this.processQueue();
    }

    return { success: true, item };
  }

  public cancel(id: string): boolean {
    const item = this.items.find((i) => i.id === id);
    if (!item) return false;

    const task = this.tasks.get(id);
    if (task) {
      task.cancel();
      this.tasks.delete(id);
    } else {
      item.status = "cancelled";
      this.broadcast("item_updated", item);
    }

    this.processQueue();
    return true;
  }

  public pause(id: string): boolean {
    const task = this.tasks.get(id);
    if (!task) return false;
    const ok = task.pause();
    if (ok) {
      this.tasks.delete(id);
      this.processQueue();
    }
    return ok;
  }

  public resume(id: string): boolean {
    const item = this.items.find((i) => i.id === id);
    if (!item || (item.status !== "paused" && item.status !== "failed")) return false;

    item.status = "queued";
    item.errorMessage = undefined;
    this.broadcast("item_updated", item);
    this.processQueue();
    return true;
  }

  public retry(id: string): boolean {
    const item = this.items.find((i) => i.id === id);
    if (!item) return false;

    item.status = "queued";
    item.progress = 0;
    item.downloadSpeed = "0 B/s";
    item.eta = "--:--";
    item.errorMessage = undefined;
    this.broadcast("item_updated", item);

    this.processQueue();
    return true;
  }

  public remove(id: string): boolean {
    this.cancel(id);
    const initialLen = this.items.length;
    this.items = this.items.filter((i) => i.id !== id);
    this.tasks.delete(id);

    if (this.items.length !== initialLen) {
      this.broadcast("item_removed");
      this.processQueue();
      return true;
    }
    return false;
  }

  public clearCompleted() {
    this.items = this.items.filter((i) => i.status !== "completed" && i.status !== "cancelled");
    this.broadcast("queue_cleared");
  }

  public clearAll() {
    for (const task of this.tasks.values()) {
      task.cancel();
    }
    this.tasks.clear();
    this.items = [];
    this.broadcast("queue_cleared");
  }

  public async processQueue() {
    const settings = settingsManager.getSettings();
    const activeTasks = Array.from(this.tasks.values()).filter(
      (t) => t.item.status === "downloading" || t.item.status === "merging" || t.item.status === "converting"
    );

    const availableSlots = settings.concurrentDownloads - activeTasks.length;
    if (availableSlots <= 0) return;

    const queuedItems = this.items.filter((i) => i.status === "queued");
    const toStart = queuedItems.slice(0, availableSlots);

    for (let i = 0; i < toStart.length; i++) {
      const item = toStart[i];
      const task = new DownloadTask(item);
      this.tasks.set(item.id, task);

      task.subscribe((updatedItem) => {
        // Sync item in memory
        const idx = this.items.findIndex((i) => i.id === updatedItem.id);
        if (idx !== -1) {
          this.items[idx] = { ...updatedItem };
        }
        this.broadcast("item_updated", updatedItem);

        if (
          updatedItem.status === "completed" ||
          updatedItem.status === "failed" ||
          updatedItem.status === "cancelled" ||
          updatedItem.status === "paused"
        ) {
          this.tasks.delete(updatedItem.id);
          // Pick up next queued item
          setTimeout(() => this.processQueue(), 500);
        }
      });

      // Launch with slight stagger to avoid CDN rate spikes
      setTimeout(() => {
        task.start().catch((err) => {
          console.error("Task start error:", err);
        });
      }, i * 400);
    }
  }
}

export const queueManager = new QueueManager();
