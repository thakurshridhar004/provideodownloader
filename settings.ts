import { AppSettings } from "./types.ts";
import { join } from "https://deno.land/std@0.224.0/path/mod.ts";

const ROOT_DIR = import.meta.dirname ? join(import.meta.dirname, "..") : Deno.cwd();
const DATA_DIR = join(ROOT_DIR, "data");
const SETTINGS_FILE = join(DATA_DIR, "settings.json");
const DEFAULT_DOWNLOAD_DIR = join(ROOT_DIR, "downloads");

const defaultSettings: AppSettings = {
  downloadPath: DEFAULT_DOWNLOAD_DIR,
  defaultVideoQuality: "1080p",
  preferredContainer: "mp4",
  defaultAudioFormat: "mp3",
  concurrentDownloads: 2,
  downloadThreads: 8,
  connectionProtection: true,
  theme: "dark",
  autoClipboard: true,
  notifications: true,
  autoStartQueue: true,
};

export class SettingsManager {
  private settings: AppSettings = { ...defaultSettings };

  constructor() {
    this.ensureDataDir();
    this.load();
  }

  private ensureDataDir() {
    try {
      Deno.mkdirSync(DATA_DIR, { recursive: true });
      Deno.mkdirSync(DEFAULT_DOWNLOAD_DIR, { recursive: true });
    } catch (_err) {
      // Ignore if exists
    }
  }

  public getSettings(): AppSettings {
    return { ...this.settings };
  }

  public updateSettings(partial: Partial<AppSettings>): AppSettings {
    this.settings = { ...this.settings, ...partial };
    this.save();
    return { ...this.settings };
  }

  private load() {
    try {
      if (Deno.statSync(SETTINGS_FILE).isFile) {
        const text = Deno.readTextFileSync(SETTINGS_FILE);
        const data = JSON.parse(text);
        this.settings = { ...defaultSettings, ...data };
      }
    } catch (_err) {
      this.settings = { ...defaultSettings };
      this.save();
    }
  }

  private save() {
    try {
      Deno.writeTextFileSync(SETTINGS_FILE, JSON.stringify(this.settings, null, 2));
    } catch (err) {
      console.error("Failed to save settings:", err);
    }
  }
}

export const settingsManager = new SettingsManager();
