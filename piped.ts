// Fallback to Piped API and Cobalt API if yt-dlp completely fails
export async function fallbackPipedAPI(url: string) {
  // Extract video ID from YouTube URL
  let videoId = url;
  try {
    const u = new URL(url);
    videoId = u.searchParams.get("v") || u.pathname.split("/").pop() || url;
  } catch(e: any) {}

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const cobaltInstances = [
    "https://cobalt.clxxped.lol",
    "https://co.wuk.sh"
  ];

  for (const instance of cobaltInstances) {
    try {
      console.log(`[Analyzer] Trying Cobalt API fallback: ${instance}`);
      const res = await fetch(`${instance}/api/json`, {
        method: "POST",
        headers: { 
          "Accept": "application/json",
          "Content-Type": "application/json",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        },
        body: JSON.stringify({ url: `https://www.youtube.com/watch?v=${videoId}` })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.url || data.picker) {
          console.log("[Analyzer] Cobalt API SUCCESS!");
          const videoFormats: any[] = [];
          if (data.picker) {
             data.picker.forEach((p: any) => {
               videoFormats.push({
                 formatId: "cobalt", resolution: p.quality || "720", resolutionLabel: p.quality || "720p",
                 width: null, height: null, fps: null, videoCodec: "unknown", audioCodec: "unknown",
                 hasAudio: true, needsAudioMerge: false, container: "mp4", ext: "mp4",
                 filesize: null, filesizeApprox: null, filesizeFormatted: "Unknown", bitrate: null
               });
             });
          } else if (data.url) {
             videoFormats.push({
               formatId: "cobalt", resolution: "1080", resolutionLabel: "1080p Best",
               width: null, height: null, fps: null, videoCodec: "unknown", audioCodec: "unknown",
               hasAudio: true, needsAudioMerge: false, container: "mp4", ext: "mp4",
               filesize: null, filesizeApprox: null, filesizeFormatted: "Unknown", bitrate: null
             });
          }
          return {
            id: videoId,
            url: `https://www.youtube.com/watch?v=${videoId}`,
            title: "YouTube Video (Cobalt API)",
            description: "",
            duration: 0,
            durationFormatted: "0:00",
            thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            uploader: "Unknown",
            extractor: "cobalt",
            extractorKey: "Cobalt",
            videoFormats: videoFormats,
            audioFormats: []
          };
        }
      }
    } catch(e: any) {
      console.warn(`[Analyzer] Cobalt API error: ${e.message}`);
    }
  }

  const instances = [
    "https://pipedapi.tokhmi.xyz",
    "https://pipedapi.kavin.rocks",
    "https://pipedapi.smnz.de",
    "https://pipedapi.lunar.icu"
  ];
  
  for (const instance of instances) {
    try {
      console.log(`[Analyzer] Trying Piped API fallback: ${instance}`);
      const res = await fetch(`${instance}/streams/${videoId}`, {
        headers: { 
          "Accept": "application/json",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
      });
      if (!res.ok) {
        const text = await res.text();
        console.warn(`[Analyzer] Piped API ${instance} returned ${res.status}:`, text.substring(0, 100));
        continue;
      }
      
      const data = await res.json();
      if (!data.videoStreams || data.videoStreams.length === 0) continue;
      
      const videoFormats: any[] = [];
      
      for (const stream of data.videoStreams) {
        videoFormats.push({
          formatId: stream.format || "piped",
          resolution: stream.quality?.replace("p", "") || "720",
          resolutionLabel: stream.quality || "720p",
          width: null, height: null, fps: null,
          videoCodec: stream.codec || "unknown",
          audioCodec: stream.videoOnly ? null : "unknown",
          hasAudio: !stream.videoOnly,
          needsAudioMerge: stream.videoOnly,
          container: stream.mimeType?.split(";")[0]?.split("/")[1] || "mp4",
          ext: stream.mimeType?.split(";")[0]?.split("/")[1] || "mp4",
          filesize: null, filesizeApprox: null, filesizeFormatted: "Unknown", bitrate: stream.bitrate || null
        });
      }
      
      const audioFormats: any[] = [];
      for (const stream of data.audioStreams || []) {
        audioFormats.push({
          formatId: stream.format || "piped-aud",
          type: "source",
          label: `Audio (${stream.quality || "unknown"})`,
          container: stream.mimeType?.split(";")[0]?.split("/")[1] || "m4a",
          ext: stream.mimeType?.split(";")[0]?.split("/")[1] || "m4a",
          codec: stream.codec || "unknown",
          bitrate: stream.bitrate || null,
          bitrateFormatted: stream.bitrate ? Math.round(stream.bitrate/1024) + "k" : "Unknown",
          sampleRate: null, sampleRateFormatted: "Unknown",
          filesize: null, filesizeFormatted: "Unknown"
        });
      }
      
      const duration = data.duration || 0;
      return {
        id: videoId,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        title: data.title || "YouTube Video (Piped API)",
        description: data.description || "",
        duration: duration,
        durationFormatted: formatDuration(duration),
        thumbnail: data.thumbnailUrl || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        uploader: data.uploader || "Unknown",
        extractor: "piped",
        extractorKey: "Piped",
        videoFormats: videoFormats,
        audioFormats: audioFormats
      };
    } catch (e: any) {
      console.warn(`[Analyzer] Piped API failed for ${instance}`);
    }
  }
  return null;
}
