export interface VideoFormatOption {
  formatId: string;
  resolution: string;
  resolutionLabel: string; // e.g. "8K / 4320p", "4K / 2160p", "1080p FHD"
  width: number | null;
  height: number | null;
  fps: number | null;
  videoCodec: string;
  audioCodec: string | null;
  hasAudio: boolean;
  needsAudioMerge: boolean;
  container: string;
  ext: string;
  filesize: number | null;
  filesizeApprox: number | null;
  filesizeFormatted: string;
  bitrate: number | null;
  isBest?: boolean;
  isRecommended?: boolean;
  isUnavailable?: boolean;
}

export interface AudioFormatOption {
  formatId: string;
  type: "source" | "convert";
  label: string; // e.g. "Original Source (Opus)", "MP3 High Quality (320 kbps)", "M4A (AAC)", "WAV (Lossless)"
  container: string;
  ext: string;
  codec: string;
  bitrate: number | null;
  bitrateFormatted: string;
  sampleRate: number | null;
  sampleRateFormatted: string;
  filesize: number | null;
  filesizeFormatted: string;
  isBest?: boolean;
  isRecommended?: boolean;
}

export interface VideoMetadata {
  id: string;
  url: string;
  title: string;
  description: string;
  uploader: string;
  uploaderUrl?: string;
  channel?: string;
  duration: number; // in seconds
  durationFormatted: string;
  thumbnail: string;
  viewCount?: number;
  extractor: string;
  extractorKey: string;
  uploadDate?: string;
  videoFormats: VideoFormatOption[];
  audioFormats: AudioFormatOption[];
  bestVideoFormat?: VideoFormatOption;
  recommendedVideoFormat?: VideoFormatOption;
  bestAudioFormat?: AudioFormatOption;
  isDirectLink?: boolean;
  maxSourceRes?: number;
  maxSourceResLabel?: string;
}

export type DownloadStatus = 
  | "queued" 
  | "downloading" 
  | "merging" 
  | "converting" 
  | "completed" 
  | "failed" 
  | "paused" 
  | "cancelled";

export interface DownloadItem {
  id: string;
  url: string;
  title: string;
  thumbnail: string;
  duration: number;
  type: "video" | "audio";
  selectedFormat: {
    formatId: string;
    resolutionLabel?: string;
    container: string;
    codec?: string;
    audioOption?: string;
    type?: string;
    needsAudioMerge?: boolean;
    filesize?: number;
    filesizeFormatted?: string;
  };
  destinationDir: string;
  destinationFile?: string;
  status: DownloadStatus;
  progress: number; // 0 - 100
  downloadSpeed: string;
  downloadedBytes: number;
  totalBytes: number;
  downloadedFormatted: string;
  totalFormatted: string;
  eta: string;
  errorMessage?: string;
  threads?: number;
  createdAt: number;
  completedAt?: number;
  pid?: number;
  clientId?: string;
}

export interface HistoryItem {
  id: string;
  url: string;
  title: string;
  thumbnail: string;
  type: "video" | "audio";
  resolutionLabel: string;
  container: string;
  fileSizeFormatted: string;
  filePath: string;
  fileName: string;
  duration?: number;
  downloadDate: number;
  status: "completed" | "failed";
  clientId?: string;
}

export interface AppSettings {
  downloadPath: string;
  defaultVideoQuality: string; // "best", "4k", "1440p", "1080p", "720p", "480p"
  preferredContainer: string; // "mp4", "mkv", "webm", "original"
  defaultAudioFormat: string; // "mp3", "m4a", "wav", "source"
  concurrentDownloads: number; // 1, 2, 3, 5
  downloadThreads: number; // 4, 8, 16 parallel fragment threads per download
  connectionProtection: boolean; // auto-retry dropped fragments and resilient sockets
  theme: "dark" | "light" | "system";
  autoClipboard: boolean;
  notifications: boolean;
  autoStartQueue: boolean;
}
