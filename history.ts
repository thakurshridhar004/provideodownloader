import { HistoryItem } from "./types.ts";
import { join } from "https://deno.land/std@0.224.0/path/mod.ts";

const ROOT_DIR = import.meta.dirname ? join(import.meta.dirname, "..") : Deno.cwd();
const DATA_DIR = join(ROOT_DIR, "data");
const HISTORY_FILE = join(DATA_DIR, "history.json");

export class HistoryManager {
  private history: HistoryItem[] = [];

  constructor() {
    this.load();
  }

  public getHistory(): HistoryItem[] {
    return [...this.history];
  }

  public addItem(item: HistoryItem) {
    // Add to start of history
    this.history = [item, ...this.history.filter((h) => h.id !== item.id)];
    this.save();
  }

  public removeItem(id: string): boolean {
    const initialLen = this.history.length;
    this.history = this.history.filter((item) => item.id !== id);
    if (this.history.length !== initialLen) {
      this.save();
      return true;
    }
    return false;
  }

  public clearAll() {
    this.history = [];
    this.save();
  }

  private load() {
    try {
      if (Deno.statSync(HISTORY_FILE).isFile) {
        const text = Deno.readTextFileSync(HISTORY_FILE);
        this.history = JSON.parse(text);
      }
    } catch (_err) {
      this.history = [];
    }
  }

  private save() {
    try {
      Deno.writeTextFileSync(HISTORY_FILE, JSON.stringify(this.history, null, 2));
    } catch (err) {
      console.error("Failed to save history:", err);
    }
  }
}

export const historyManager = new HistoryManager();
