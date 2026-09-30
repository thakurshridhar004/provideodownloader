// Fallback to Piped API and Cobalt API if yt-dlp completely fails
export async function fallbackPipedAPI(url: string) {
  // Extract video ID from YouTube URL
  let videoId = url;
  try {
    const u = new URL(url);
    videoId = u.searchParams.get("v") || u.pathname.split("/").pop() || url;
  } catch(e) {}

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
          // Quick conversion for Cobalt v7 response
          const formats = [];
          if (data.picker) {
             data.picker.forEach((p: any) => {
               formats.push({
                 url: p.url, quality: p.quality || "Unknown", hasAudio: true, isAudioOnly: false, ext: "mp4", codec: "unknown", rawFormatId: "cobalt"
               });
             });
          } else if (data.url) {
             formats.push({
               url: data.url, quality: "Best", hasAudio: true, isAudioOnly: false, ext: "mp4", codec: "unknown", rawFormatId: "cobalt"
             });
          }
          return {
            success: true,
            data: { title: "YouTube Video", duration: 0, thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`, formats }
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
    } catch (e: any) {
      console.warn(`[Analyzer] Piped API failed for ${instance}`);
    }
  }
  return null;
}
