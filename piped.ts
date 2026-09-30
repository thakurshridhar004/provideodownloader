// Fallback to Piped API if yt-dlp completely fails
export async function fallbackPipedAPI(videoId: string) {
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
      
      const formats = [];
      
      for (const stream of data.videoStreams) {
        formats.push({
          url: stream.url,
          quality: stream.quality || "Unknown",
          hasAudio: !stream.videoOnly,
          isAudioOnly: false,
          ext: stream.mimeType?.split(";")[0]?.split("/")[1] || "mp4",
          codec: stream.codec || "Unknown",
          rawFormatId: stream.format || "piped-vid"
        });
      }
      
      for (const stream of data.audioStreams || []) {
        formats.push({
          url: stream.url,
          quality: "Audio",
          hasAudio: true,
          isAudioOnly: true,
          ext: stream.mimeType?.split(";")[0]?.split("/")[1] || "m4a",
          codec: stream.codec || "Unknown",
          rawFormatId: stream.format || "piped-aud"
        });
      }
      
      return {
        success: true,
        data: {
          title: data.title || "Unknown Title",
          duration: data.duration || 0,
          thumbnail: data.thumbnailUrl || `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
          formats: formats
        }
      };
    } catch (e) {
      console.warn(`[Analyzer] Piped API failed for ${instance}`);
    }
  }
  return null;
}
