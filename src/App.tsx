import React, { useState, useRef, useEffect } from 'react';
import { Upload, Play, Pause, Download, Video, Image as ImageIcon, Music, Type, AlignLeft, Sparkles } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';

interface Subtitle {
  start: number;
  end: number;
  text: string;
}

const DEFAULT_ASSET_BASENAME = '我爱你胜过这世界-陈立强-R&B';
const DEFAULT_AUDIO_URL = new URL('../素材/我爱你胜过这世界-陈立强-R&B.wav', import.meta.url).href;
const DEFAULT_SRT_URL = new URL('../素材/我爱你胜过这世界-陈立强-R&B.srt', import.meta.url).href;
const DEFAULT_COVER_URL = new URL('../素材/封面图.jpg', import.meta.url).href;
const DEFAULT_AUDIO_MIME_TYPE = 'audio/wav';

function timeToSeconds(timeStr: string) {
  if (!timeStr) return 0;
  const parts = timeStr.replace(',', '.').split(':');
  if (parts.length === 3) {
    return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
  }
  return 0;
}

function formatSrtTime(seconds: number): string {
  const pad = (num: number, size: number) => ('000' + num).slice(-size);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds - Math.floor(seconds)) * 1000);
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)},${pad(ms, 3)}`;
}

function generateSrtText(data: Subtitle[]): string {
  return data.map((sub, index) => {
    return `${index + 1}\n${formatSrtTime(sub.start)} --> ${formatSrtTime(sub.end)}\n${sub.text}`;
  }).join('\n\n');
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
  });
}

function parseSrt(srtString: string): Subtitle[] {
  const blocks = srtString.trim().split(/\n\s*\n/);
  return blocks.map(block => {
    const lines = block.split('\n');
    if (lines.length >= 3) {
      const timeStr = lines[1];
      const match = timeStr.match(/(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/);
      if (match) {
        const start = timeToSeconds(match[1]);
        const end = timeToSeconds(match[2]);
        const text = lines.slice(2).join('\n');
        return { start, end, text };
      }
    }
    return null;
  }).filter((sub): sub is Subtitle => sub !== null);
}

function drawImageCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number) {
  const imgRatio = img.width / img.height;
  const canvasRatio = w / h;
  let renderW, renderH, renderX, renderY;

  if (imgRatio < canvasRatio) {
    renderW = w;
    renderH = w / imgRatio;
    renderX = 0;
    renderY = (h - renderH) / 2;
  } else {
    renderW = h * imgRatio;
    renderH = h;
    renderX = (w - renderW) / 2;
    renderY = 0;
  }
  ctx.drawImage(img, renderX, renderY, renderW, renderH);
}

export default function App() {
  // Input State
  const [title, setTitle] = useState('我爱你胜过这世界');
  const [subtitle1, setSubtitle1] = useState('原唱：陈立强');
  const [subtitle2, setSubtitle2] = useState('风格：R&B');
  const [srtData, setSrtData] = useState<Subtitle[]>([]);
  
  // Media State
  const [audioUrl, setAudioUrl] = useState<string | null>(DEFAULT_AUDIO_URL);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [imageElement, setImageElement] = useState<HTMLImageElement | null>(null);
  const [videoOutputUrl, setVideoOutputUrl] = useState<string | null>(null);

  // Playback/Recording State
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingProgress, setRecordingProgress] = useState(0);

  // AI Cover Generation State
  const [isGeneratingCover, setIsGeneratingCover] = useState(false);
  const [coverPrompt, setCoverPrompt] = useState('');
  
  // Metadata extraction state
  const [isExtractingMeta, setIsExtractingMeta] = useState(false);
  const [isGeneratingSubtitles, setIsGeneratingSubtitles] = useState(false);
  
  // SRT Raw Content
  const [srtRaw, setSrtRaw] = useState('');

  // Export Settings
  const [exportFormat, setExportFormat] = useState<'webm' | 'mp4'>('mp4');

  // Visualizer settings
  type VisualizerStyle = 'waveform' | 'spectrum';
  const [visualizerStyle, setVisualizerStyle] = useState<VisualizerStyle>('waveform');

  // Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const destStreamRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const animationRef = useRef<number>(0);
  const particlesRef = useRef<{x: number, y: number, vx: number, vy: number, alpha: number, size: number, hue: number}[]>([]);
  
  // Ref for canvas loop to access latest state without restarting loop
  const stateRef = useRef({ title, subtitle1, subtitle2, srtData, imageElement, visualizerStyle });

  useEffect(() => {
    stateRef.current = { title, subtitle1, subtitle2, srtData, imageElement, visualizerStyle };
  }, [title, subtitle1, subtitle2, srtData, imageElement, visualizerStyle]);

  useEffect(() => {
    let isMounted = true;

    fetch(DEFAULT_SRT_URL)
      .then(response => {
        if (!response.ok) throw new Error(`Failed to load default SRT: ${response.status}`);
        return response.text();
      })
      .then(text => {
        if (!isMounted) return;
        setSrtRaw(text);
        setSrtData(parseSrt(text));
      })
      .catch(err => console.warn(err));

    fetch(DEFAULT_AUDIO_URL)
      .then(response => {
        if (!response.ok) throw new Error(`Failed to load default audio: ${response.status}`);
        return response.blob();
      })
      .then(blob => {
        if (!isMounted) return;
        setAudioFile(new File([blob], `${DEFAULT_ASSET_BASENAME}.wav`, { type: DEFAULT_AUDIO_MIME_TYPE }));
      })
      .catch(err => console.warn(err));

    const img = new Image();
    img.onload = () => {
      if (isMounted) setImageElement(img);
    };
    img.onerror = () => console.warn('Failed to load default cover image.');
    img.src = DEFAULT_COVER_URL;

    return () => {
      isMounted = false;
    };
  }, []);

  const updateSrtElement = (index: number, field: 'start'|'end'|'text', value: string|number) => {
    const newSrt = [...srtData];
    newSrt[index] = { ...newSrt[index], [field]: value };
    setSrtData(newSrt);
    setSrtRaw(generateSrtText(newSrt));
  };

  const generateCover = async () => {
    setIsGeneratingCover(true);
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        
        let lyricsContext = "";
        if (srtData && srtData.length > 0) {
            // Get up to first 15 lines of lyrics for context
            lyricsContext = srtData.slice(0, 15).map(sub => sub.text).join(' ');
        }
        
        const finalPrompt = `
Generate a background image.
Theme: "${title}" ${subtitle1 ? '- ' + subtitle1 : ''}
${coverPrompt ? 'User direction: ' + coverPrompt : ''}
${lyricsContext ? 'Lyrics/Content context: ' + lyricsContext : ''}

CRITICAL STYLE REQUIREMENTS:
- Oil painting style (油画风格)
- Minimalist and simple (简约)
- ABSOLUTELY NO TEXT, NO WORDS, NO LETTERS, NO NUMBERS, NO WATERMARKS.
`;

        const response = await ai.models.generateContent({
            model: 'gemini-3.1-flash-image-preview',
            contents: {
              parts: [
                {
                  text: finalPrompt,
                },
              ],
            },
            config: {
              imageConfig: {
                    aspectRatio: "16:9",
                    imageSize: "1K"
                }
            },
        });
        
        const candidate = response.candidates?.[0];
        if (!candidate || !candidate.content.parts) {
            throw new Error("No image generated.");
        }
        
        for (const part of candidate.content.parts) {
            if (part.inlineData) {
                const base64EncodeString = part.inlineData.data;
                const imageUrl = `data:image/jpeg;base64,${base64EncodeString}`;
                const img = new Image();
                img.onload = () => setImageElement(img);
                img.src = imageUrl;
                break;
            }
        }
    } catch (err) {
        console.error(err);
        alert('Failed to generate cover: ' + (err as Error).message);
    } finally {
        setIsGeneratingCover(false);
    }
  };

  const initAudioContext = () => {
    if (audioCtxRef.current || !audioRef.current) return;
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioContextClass();
    audioCtxRef.current = ctx;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.8;
    analyserRef.current = analyser;

    const source = ctx.createMediaElementSource(audioRef.current);
    
    // Add a gain node to slightly reduce volume and prevent digital clipping/crackling during export
    const gainNode = ctx.createGain();
    gainNode.gain.value = 0.95;

    const dest = ctx.createMediaStreamDestination();
    destStreamRef.current = dest;

    source.connect(analyser);
    analyser.connect(gainNode);
    gainNode.connect(ctx.destination);
    gainNode.connect(dest);
  };

  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAudioFile(file);
      setAudioUrl(URL.createObjectURL(file));
      setVideoOutputUrl(null); // Reset output when new audio loaded
      
      const filename = file.name.replace(/\.[^/.]+$/, "");
      extractMetadata(filename);
    }
  };

  const generateSubtitles = async () => {
    if (!audioFile) return;
    setIsGeneratingSubtitles(true);
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const base64Audio = await fileToBase64(audioFile);
        const base64Data = base64Audio.split(',')[1];
        
        const response = await ai.models.generateContent({
            model: 'gemini-3.1-pro-preview',
            contents: {
                role: 'user',
                parts: [
                    {
                        inlineData: {
                            mimeType: audioFile.type || 'audio/mpeg',
                            data: base64Data
                        }
                    },
                    {
                        text: "Please transcribe the lyrics in this song and output exactly in SRT subtitle format with precise timestamps. You MUST output the text in Simplified Chinese (简体中文). Do not output anything else besides valid SRT format."
                    }
                ]
            }
        });
        
        const srtResult = response.text || "";
        const cleanedSrt = srtResult.replace(/```(srt)?\n/ig, "").replace(/```/g, "").trim();
        setSrtRaw(cleanedSrt);
        setSrtData(parseSrt(cleanedSrt));
    } catch (err) {
        console.error("Failed to generate subtitles:", err);
        alert('Failed to generate subtitles: ' + (err as Error).message);
    } finally {
        setIsGeneratingSubtitles(false);
    }
  };

  const extractMetadata = async (filename: string) => {
    // Fast path for specifically requested format: Title-Artist-Style (e.g., 日不落-蔡依林-R&B)
    const parts = filename.split('-').map(p => p.trim());
    if (parts.length >= 3) {
        setTitle(parts[0]);
        setSubtitle1(`原唱：${parts[1]}`);
        setSubtitle2(`风格：${parts.slice(2).join('-')}`);
        return;
    } else if (parts.length === 2) {
        setTitle(parts[0]);
        setSubtitle1(`原唱：${parts[1]}`);
        // We let the AI continue to run to try and infer the style
    }

    setIsExtractingMeta(true);
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: {
                role: 'user',
                parts: [{ text: `Analyze this audio filename: "${filename}". It may be in the format 'Title-Artist-Style' (e.g. 日不落-蔡依林-R&B) or 'Title - Artist'. Extract or infer the song title, the original singer/artist, and the musical style/genre. If it resembles a known song, use your knowledge to deduce the artist and genre (output in Chinese). Return ONLY a valid JSON object with exact keys: "title", "singer", "style". If not determinable, leave the value empty.` }]
            },
            config: {
                responseMimeType: "application/json",
            }
        });
        
        const responseText = response.text || "{}";
        const data = JSON.parse(responseText);
        if (data.title) setTitle(data.title);
        if (data.singer) setSubtitle1(`原唱：${data.singer}`);
        if (data.style) setSubtitle2(`风格：${data.style}`);
    } catch (err) {
        console.error("Failed to extract metadata:", err);
    } finally {
        setIsExtractingMeta(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => setImageElement(img);
      img.src = url;
    }
  };

  const handleSrtUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        setSrtRaw(text);
        setSrtData(parseSrt(text));
      };
      reader.readAsText(file);
    }
  };

  const handleSrtChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setSrtRaw(text);
    setSrtData(parseSrt(text));
  };

  const togglePlay = () => {
    if (!audioRef.current || !audioUrl) return;
    initAudioContext();
    
    if (audioCtxRef.current?.state === 'suspended') {
      audioCtxRef.current.resume();
    }

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
  };

  // Canvas Drawing Loop
  useEffect(() => {
    const renderLoop = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;

      const { title, subtitle1, subtitle2, srtData, imageElement } = stateRef.current;
      
      // Clear
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // 1. Draw Background
      if (imageElement) {
        drawImageCover(ctx, imageElement, canvas.width, canvas.height);
      } else {
        ctx.fillStyle = '#C2A882'; // Default brown paper-like color
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      // Add subtle elegant gradients to ensure typography stands out against any complex oil painting
      // Top gradient for title area
      const topGrad = ctx.createLinearGradient(0, 0, 0, 600);
      topGrad.addColorStop(0, 'rgba(0,0,0,0.5)');
      topGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = topGrad;
      ctx.fillRect(0, 0, canvas.width, 600);

      // Bottom gradient for lyrics and visualizer
      const bottomGrad = ctx.createLinearGradient(0, canvas.height - 500, 0, canvas.height);
      bottomGrad.addColorStop(0, 'rgba(0,0,0,0)');
      bottomGrad.addColorStop(1, 'rgba(0,0,0,0.7)');
      ctx.fillStyle = bottomGrad;
      ctx.fillRect(0, canvas.height - 500, canvas.width, 500);

      // Add a cinematic/editorial inner frame
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 1;
      ctx.strokeRect(60, 60, canvas.width - 120, canvas.height - 120);

      // Corner accents
      ctx.beginPath();
      const cornerLen = 20;
      // Top Left
      ctx.moveTo(60, 60 + cornerLen); ctx.lineTo(60, 60); ctx.lineTo(60 + cornerLen, 60);
      // Top Right
      ctx.moveTo(canvas.width - 60 - cornerLen, 60); ctx.lineTo(canvas.width - 60, 60); ctx.lineTo(canvas.width - 60, 60 + cornerLen);
      // Bottom Left
      ctx.moveTo(60, canvas.height - 60 - cornerLen); ctx.lineTo(60, canvas.height - 60); ctx.lineTo(60 + cornerLen, canvas.height - 60);
      // Bottom Right
      ctx.moveTo(canvas.width - 60 - cornerLen, canvas.height - 60); ctx.lineTo(canvas.width - 60, canvas.height - 60); ctx.lineTo(canvas.width - 60, canvas.height - 60 - cornerLen);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Use a bolder font stack for fancy text effects
      const fontStack = '"STZhongsong", "SimHei", "Microsoft YaHei", "Georgia", sans-serif';

      // Fancy Text Helper
      const drawTextWithTexture = (
        text: string, x: number, y: number, fontSize: number, 
        alpha: number, isMainTitle: boolean
      ) => {
          ctx.font = `${isMainTitle ? '900' : 'bold'} ${fontSize}px ${fontStack}`;
          
          // Gradient Fill
          const grad = ctx.createLinearGradient(0, y - fontSize*0.6, 0, y + fontSize*0.4);
          if (isMainTitle) {
              grad.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
              grad.addColorStop(0.4, `rgba(255, 245, 230, ${alpha})`);
              grad.addColorStop(0.7, `rgba(240, 200, 140, ${alpha})`);
              grad.addColorStop(1, `rgba(190, 130, 60, ${alpha})`);
          } else {
              grad.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
              grad.addColorStop(1, `rgba(255, 225, 180, ${alpha})`);
          }

          // Drop shadow for 3D separation
          ctx.shadowColor = `rgba(0, 0, 0, ${0.9 * alpha})`;
          ctx.shadowBlur = isMainTitle ? 40 : 25;
          ctx.shadowOffsetY = isMainTitle ? 15 : 8;

          // Thick Outline (Dark Brown/Black)
          ctx.lineWidth = isMainTitle ? 20 : 12;
          ctx.strokeStyle = `rgba(10, 5, 0, ${1.0 * alpha})`;
          ctx.lineJoin = 'round';
          
          ctx.strokeText(text, x, y);
          
          // Clear shadow so we don't double shadow
          ctx.shadowColor = 'transparent';
          
          // Main Fill
          ctx.fillStyle = grad;
          ctx.fillText(text, x, y);
          
          // Inner bright stroke for metallic shine
          ctx.lineWidth = isMainTitle ? 2 : 1.5;
          ctx.strokeStyle = `rgba(255, 255, 255, ${0.9 * alpha})`;
          ctx.strokeText(text, x, y);
      };

      // Top metadata (Decorative)
      ctx.font = `italic 16px ${fontStack}`;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.textAlign = 'center';
      if ('letterSpacing' in ctx) { (ctx as any).letterSpacing = '12px'; }
      ctx.fillText('AUDIO VISUAL // 01', canvas.width / 2, 100);
      if ('letterSpacing' in ctx) { (ctx as any).letterSpacing = '0px'; }

      // 2. Draw Title & Meta
      const currTime = audioRef.current?.currentTime || 0;
      const isPreview = !isPlaying && currTime === 0; // Show full text in initial preview state
      
      const titleFade = isPreview ? 1 : Math.min(1, currTime * 0.5); // 2 second fade in
      const titleScale = isPreview ? 1 : 0.95 + Math.min(0.05, currTime * 0.015); // Subtle continuous scale
      
      const sub1Start = 1.0; 
      const sub1Alpha = isPreview ? 1 : Math.min(1, Math.max(0, (currTime - sub1Start) * 1.5)); // Fade in
      
      const sub2Start = sub1Start + 0.5;
      const sub2Alpha = isPreview ? 1 : Math.min(1, Math.max(0, (currTime - sub2Start) * 1.5)); // Fade in

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      // Main Title
      ctx.save();
      ctx.translate(canvas.width / 2, 320);
      ctx.scale(titleScale, titleScale);
      if ('letterSpacing' in ctx) { (ctx as any).letterSpacing = '20px'; }
      drawTextWithTexture(title, 0, 0, 160, titleFade, true); 
      if ('letterSpacing' in ctx) { (ctx as any).letterSpacing = '0px'; }
      ctx.restore();

      // Subtitles directly below title
      const maxSubAlpha = Math.max(sub1Alpha, sub2Alpha);
      if (maxSubAlpha > 0) {
        ctx.font = `600 32px ${fontStack}`; 
        
        const drawSubText = (text: string, y: number, alpha: number) => {
          ctx.save();
          ctx.translate(canvas.width / 2, y);
          const scale = 0.95 + (alpha * 0.05); // slight scale up with fade
          ctx.scale(scale, scale);
          
          if ('letterSpacing' in ctx) { (ctx as any).letterSpacing = '8px'; }
          ctx.lineJoin = 'round';
          ctx.lineWidth = 10; 
          ctx.shadowColor = `rgba(0, 0, 0, ${alpha * 0.9})`;
          ctx.shadowBlur = 15;
          ctx.shadowOffsetY = 5;
          ctx.strokeStyle = `rgba(10, 5, 0, ${alpha * 1.0})`;
          ctx.strokeText(text, 0, 0);
          
          ctx.shadowColor = 'transparent';
          ctx.fillStyle = `rgba(250, 245, 240, ${alpha})`;
          ctx.fillText(text, 0, 0);
          if ('letterSpacing' in ctx) { (ctx as any).letterSpacing = '0px'; }
          ctx.restore();
        };

        const yPos1 = 420; // Tight below the main title (320 + 80 = 400 + 20 px padding)
        const yPos2 = 470;

        if (sub1Alpha > 0 && sub2Alpha > 0 && subtitle1 && subtitle2) {
          drawSubText(`${subtitle1}    ·    ${subtitle2}`, yPos1, sub1Alpha);
        } else {
          if (sub1Alpha > 0 && subtitle1) drawSubText(subtitle1, yPos1, sub1Alpha);
          if (sub2Alpha > 0 && subtitle2) drawSubText(subtitle2, yPos2, sub2Alpha);
        }
      }

      // 3. Draw Subtitles (Scrolling Highlight)
      let activeIndex = -1;
      let upcomingIndex = -1;

      const PRE_ACTIVE_OFFSET = 0.3; // Advance active subtitle highlight by 0.3 seconds

      for (let i = 0; i < srtData.length; i++) {
        if (currTime + PRE_ACTIVE_OFFSET >= srtData[i].start && currTime <= srtData[i].end) {
          activeIndex = i;
          break;
        } else if (currTime + PRE_ACTIVE_OFFSET < srtData[i].start && upcomingIndex === -1) {
          upcomingIndex = i;
        }
      }

      const centerIndex = activeIndex !== -1 ? activeIndex : 
        (upcomingIndex !== -1 ? upcomingIndex : 
          (srtData.length > 0 && currTime > srtData[srtData.length - 1].end ? srtData.length - 1 : 0)
        );

      if (srtData.length > 0) {
        ctx.textAlign = 'center';

        // Calculate layout
        let accumulateY = 0;
        const itemYs = srtData.map(sub => {
          const lines = sub.text.split('\n').length;
          const blockHeight = lines * 70; // Uniform block size calculation
          const y = accumulateY + blockHeight / 2;
          accumulateY += blockHeight + 35; // 35px spacing between subtitle blocks
          return y;
        });

        const targetScrollY = centerIndex < itemYs.length ? itemYs[centerIndex] : 0;
        
        // Dynamic smooth scroll initialization
        if (!(stateRef.current as any).isScrollInitialized) {
          (stateRef.current as any).currentScrollY = targetScrollY;
          (stateRef.current as any).scrollVelocity = 0;
          (stateRef.current as any).isScrollInitialized = true;
        } else {
          // Spring physics for dynamic and smooth scroll
          const diff = targetScrollY - (stateRef.current as any).currentScrollY;
          (stateRef.current as any).scrollVelocity += diff * 0.012; // Spring tension
          (stateRef.current as any).scrollVelocity *= 0.82; // Friction dampening
          (stateRef.current as any).currentScrollY += (stateRef.current as any).scrollVelocity;
        }

        const centerBaseY = canvas.height - 350; 
        const currentScrollY = (stateRef.current as any).currentScrollY;

        // Initialize smoothActives tracking array
        if (!(stateRef.current as any).smoothActives || (stateRef.current as any).smoothActives.length !== srtData.length) {
          (stateRef.current as any).smoothActives = new Array(srtData.length).fill(0);
        }
        const smoothActives = (stateRef.current as any).smoothActives;

        for (let i = 0; i < srtData.length; i++) {
          const rawYOffset = centerBaseY + itemYs[i] - currentScrollY;
          
          // Cull items too far off-screen
          if (rawYOffset < centerBaseY - 550 || rawYOffset > centerBaseY + 550) {
              const isActive = (i === activeIndex);
              smoothActives[i] += ((isActive ? 1 : 0) - smoothActives[i]) * 0.12; // Update state even when culled
              continue;
          }

          const isActive = (i === activeIndex);
          const targetActive = isActive ? 1 : 0;
          smoothActives[i] += (targetActive - smoothActives[i]) * 0.12; // Silky easing
          const actRatio = Math.max(0, Math.min(1, smoothActives[i]));

          const sub = srtData[i];
          const lines = sub.text.split('\n');
          
          // Normalized distance for parallax and fading (-1 to 1 around focal point)
          const distFromCenter = Math.abs(rawYOffset - centerBaseY);
          const normalizedDist = distFromCenter / 450; 
          
          // Parallax Y offset compresses items smoothly towards edges
          const signY = Math.sign(rawYOffset - centerBaseY);
          const parallaxShift = (1 - Math.cos(Math.min(1, normalizedDist) * Math.PI / 2)) * 100;
          const finalYOffset = rawYOffset - signY * parallaxShift;

          // Compute uniform continuous scaling base
          let baseScale = Math.max(0.4, 1 - Math.pow(Math.min(1, normalizedDist), 1.6) * 0.5);
          
          const subTimeActive = isActive ? (currTime - sub.start) : 0;
          let driftScale = 0;
          if (isActive && !isPreview && subTimeActive >= 0) {
            driftScale = subTimeActive * 0.005; // Slow elegant drift
          }
          
          // actRatio drives final size so transition from small to big is SILKY smooth
          const renderScale = baseScale * (0.65 + 0.35 * actRatio) + (driftScale * actRatio);

          // Calculate alpha continuously based on distance
          const alphaMod = Math.max(0, 1 - Math.pow(Math.min(1, normalizedDist), 1.2));
          
          const baseLineHeight = 75; // Internal line height for multi-line subtitles
          const blockHeight = lines.length * baseLineHeight;
          const startY = finalYOffset - (blockHeight / 2) + (baseLineHeight / 2);
          
          lines.forEach((line, lineIdx) => {
            const y = startY + (lineIdx * baseLineHeight * (baseScale * (0.65 + 0.35 * actRatio))); // adjust internal spacing smoothly
            
            ctx.save();
            ctx.translate(canvas.width / 2, y);
            ctx.scale(renderScale, renderScale);
            
            // Parametric completely smooth rendering
            ctx.font = `600 64px ${fontStack}`;
            const spacing = Math.round(3 + 3 * actRatio);
            if ('letterSpacing' in ctx) { (ctx as any).letterSpacing = `${spacing}px`; }
            
            ctx.lineJoin = 'round';
            ctx.lineWidth = 10 + actRatio * 2;
            ctx.shadowColor = `rgba(0, 0, 0, ${(0.9 + actRatio * 0.1) * alphaMod})`;
            ctx.shadowBlur = 12 + actRatio * 13;
            ctx.shadowOffsetY = 6 + actRatio * 2;
            ctx.strokeStyle = `rgba(10, 5, 0, ${(0.8 + actRatio * 0.2) * alphaMod})`;
            ctx.strokeText(line, 0, 0);
            
            ctx.shadowColor = 'transparent';
            
            const r2 = Math.round(255 - 30 * actRatio);
            const b2 = Math.round(255 - 75 * actRatio);
            
            const grad = ctx.createLinearGradient(0, -40, 0, 20);
            grad.addColorStop(0, `rgba(255, 255, 255, ${alphaMod})`);
            grad.addColorStop(1, `rgba(255, ${r2}, ${b2}, ${alphaMod * (0.45 + 0.55 * actRatio)})`);
            
            ctx.fillStyle = grad;
            ctx.fillText(line, 0, 0);
            
            if (actRatio > 0.05) {
              // Inner bright stroke for metallic shine gracefully fading in
              ctx.lineWidth = 1.5;
              ctx.strokeStyle = `rgba(255, 255, 255, ${0.9 * alphaMod * actRatio})`;
              ctx.strokeText(line, 0, 0);
            }
            if ('letterSpacing' in ctx) { (ctx as any).letterSpacing = '0px'; }
            
            ctx.restore();
          });
        }
      }

      // 4. Draw Audio Visualizer
      if (analyserRef.current) {
        const bufferLength = analyserRef.current.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyserRef.current.getByteFrequencyData(dataArray);

        const visualizerY = canvas.height - 120;
        
        ctx.shadowColor = 'rgba(255, 245, 230, 0.5)';
        ctx.shadowBlur = 15;

        // Common values for average volume
        let avgVolume = 0;
        let bassVolume = 0;
        for (let i = 0; i < bufferLength; i++) {
          avgVolume += dataArray[i];
          if (i < bufferLength / 10) bassVolume += dataArray[i];
        }
        avgVolume /= bufferLength;
        bassVolume /= (bufferLength / 10);

        if (stateRef.current.visualizerStyle === 'spectrum') {
          // Spectrum Logic (Bar chart style originating from bottom edge)
          const numBars = 120;
          const barSpacing = canvas.width / numBars;
          const barWidth = Math.max(2, barSpacing - 4);
          
          for (let i = 0; i < numBars; i++) {
            const dataIndex = Math.floor(i * (bufferLength / 2 / numBars));
            let val = dataArray[dataIndex] / 255.0;
            
            // Add a slight bass boost to the lower frequencies for impact
            if (i < numBars * 0.2) {
              val = Math.min(1, val * (1 + (bassVolume / 255) * 0.2));
            }
            
            const height = Math.max(val * 400, 10);
            
            const x = i * barSpacing;
            const y = canvas.height - height;
            
            ctx.beginPath();
            if (ctx.roundRect) {
              ctx.roundRect(x, y, barWidth, height, [barWidth / 2, barWidth / 2, 0, 0]);
            } else {
              ctx.rect(x, y, barWidth, height);
            }

            // Frequency-based color (warm to cool mapping across spectrum)
            const hue = (i / numBars) * 280; // Maps from Red (0) to Purple (280)
            const grad = ctx.createLinearGradient(0, y, 0, canvas.height);
            grad.addColorStop(0, `hsla(${hue}, 100%, 75%, 0.9)`);
            grad.addColorStop(1, `hsla(${(hue + 30) % 360}, 100%, 50%, 0.1)`);
            ctx.fillStyle = grad;
            ctx.fill();
          }
        } else {
          // Default Waveform Logic
          const numBars = 160; 
          const barSpacing = Math.floor((canvas.width * 0.7) / numBars); 
          const barWidth = 6; 
          const startX = (canvas.width - (numBars * barSpacing)) / 2;
          
          // Subtle pulse based on bass frequency
          const pulse = 1 + Math.max(0, (bassVolume / 255) - 0.3) * 0.15; // Only pulse on strong bass
          
          ctx.save();
          ctx.translate(canvas.width / 2, visualizerY);
          ctx.scale(pulse, pulse);
          ctx.translate(-(canvas.width / 2), -visualizerY);
          
          for (let i = 0; i < numBars; i++) {
            const dataIndex = Math.floor(i * (bufferLength / 2.5 / numBars));
            const val = dataArray[dataIndex] / 255.0;
            
            const height = Math.max(val * 180, 8);
            
            ctx.beginPath();
            if (ctx.roundRect) {
              ctx.roundRect(startX + i * barSpacing, visualizerY - height/2, barWidth, height, barWidth / 2);
            } else {
              ctx.rect(startX + i * barSpacing, visualizerY - height/2, barWidth, height);
            }

            const grad = ctx.createLinearGradient(0, visualizerY - height/2, 0, visualizerY + height/2);
            grad.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
            grad.addColorStop(0.5, 'rgba(255, 240, 200, 1)');
            grad.addColorStop(1, 'rgba(255, 255, 255, 0.8)');
            ctx.fillStyle = grad;
            ctx.fill();
          }

          // Center line
          ctx.beginPath();
          ctx.moveTo(startX - 20, visualizerY);
          ctx.lineTo(startX + numBars * barSpacing + 20, visualizerY);
          const lineAlpha = 0.4 + (bassVolume / 255) * 0.4;
          ctx.strokeStyle = `rgba(255, 255, 255, ${lineAlpha})`;
          ctx.lineWidth = 3 + (bassVolume / 255) * 2;
          ctx.stroke();
          
          ctx.restore();
        }

        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
      }

      animationRef.current = requestAnimationFrame(renderLoop);
    };

    renderLoop();

    return () => {
      cancelAnimationFrame(animationRef.current);
    };
  }, []);

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
      if (isRecording && duration > 0) {
        setRecordingProgress((audioRef.current.currentTime / duration) * 100);
      }
    }
  };

  const handleAudioSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = Number(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const startRecording = () => {
    if (!canvasRef.current || !audioRef.current || !audioCtxRef.current || !destStreamRef.current) {
      alert("请先上传音频并点击播放按钮以初始化音频环境。");
      return;
    }

    try {
      const canvasStream = canvasRef.current.captureStream(60); // 60 fps
      const audioStream = destStreamRef.current.stream;

      const combinedStream = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...audioStream.getAudioTracks()
      ]);

      let selectedMimeType = '';
      const typesToTry = exportFormat === 'mp4' 
        ? ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus'] // Prefer high quality
        : ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];

      for (const type of typesToTry) {
        if (MediaRecorder.isTypeSupported(type)) {
          selectedMimeType = type;
          break;
        }
      }

      const recorderOptions: MediaRecorderOptions = { 
        mimeType: selectedMimeType || undefined,
        videoBitsPerSecond: 12000000, // 12 Mbps for high quality
        audioBitsPerSecond: 128000    // 128 kbps (stable for Opus, avoids crackling)
      };
      const recorder = new MediaRecorder(combinedStream, recorderOptions);
      const chunks: Blob[] = [];

      recorder.ondataavailable = e => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        const actualMimeType = recorder.mimeType || selectedMimeType || 'video/webm';
        const blob = new Blob(chunks, { type: actualMimeType });
        const url = URL.createObjectURL(blob);
        setVideoOutputUrl(url);
        setIsRecording(false);
        setRecordingProgress(0);
      };

      recorderRef.current = recorder;
      recorder.start(1000); // chunk every 1 second
      setIsRecording(true);
      setRecordingProgress(0);

      // Restart audio to record from beginning
      audioRef.current.currentTime = 0;
      if (!isPlaying) {
        audioRef.current.play();
      }
    } catch (err) {
      console.error("Recording failed:", err);
      alert("浏览器不支持视频录制或发生异常。请确保使用 Chrome/Edge 等现代浏览器。");
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
      if (audioRef.current) audioRef.current.pause();
    }
  };

  // When audio ends, stop recording automatically
  const handleAudioEnded = () => {
    setIsPlaying(false);
    if (isRecording) {
      stopRecording();
    }
  };

  function formatTime(seconds: number) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  return (
    <div className="h-screen bg-[#0A0A0A] text-[#F5F5F5] font-sans flex flex-col overflow-hidden">
      {/* Top Navigation */}
      <header className="flex justify-between items-center px-8 py-6 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-4">
          <span className="text-xs tracking-[0.4em] font-bold uppercase">Studio / V01</span>
          <span className="h-4 w-[1px] bg-white/20"></span>
          <h1 className="text-sm font-light tracking-widest uppercase">MV Composer</h1>
        </div>
        <div className="flex gap-8 items-center">
          {isRecording ? (
            <div className="flex items-center gap-4">
              <div className="text-[10px] uppercase tracking-widest text-red-500 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
                Rendering {Math.round(recordingProgress)}%
              </div>
              <button 
                onClick={stopRecording} 
                className="px-6 py-2 border border-white/20 text-white text-[10px] uppercase tracking-[0.2em] font-bold hover:bg-white/10 transition-colors"
              >
                Stop
              </button>
            </div>
          ) : videoOutputUrl ? (
            <div className="flex gap-4">
              <a 
                href={videoOutputUrl} 
                download={`music_video.${exportFormat}`} 
                className="px-6 py-2 bg-white text-black text-[10px] uppercase tracking-[0.2em] font-bold transition-colors text-center flex items-center"
              >
                Download {exportFormat.toUpperCase()}
              </a>
              <button 
                onClick={() => setVideoOutputUrl(null)} 
                className="px-6 py-2 border border-white/20 text-white text-[10px] uppercase tracking-[0.2em] font-bold hover:bg-white/10 transition-colors"
              >
                Clear
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <select 
                value={exportFormat}
                onChange={e => setExportFormat(e.target.value as 'webm' | 'mp4')}
                className="bg-transparent border border-white/20 text-white text-[10px] uppercase tracking-[0.2em] px-3 py-2 outline-none cursor-pointer hover:bg-white/5 transition-colors"
              >
                <option value="webm" className="bg-[#050505]">WebM</option>
                <option value="mp4" className="bg-[#050505]">MP4</option>
              </select>
              <button 
                onClick={startRecording} 
                disabled={!audioUrl} 
                className="px-6 py-2 bg-white text-black text-[10px] uppercase tracking-[0.2em] font-bold disabled:opacity-50 transition-colors hover:bg-white/90"
              >
                Export Motion
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Interface Area */}
      <main className="flex-1 grid grid-cols-[380px_1fr] min-h-0">
        
        {/* Left: Source Assets Panel */}
        <aside className="border-r border-white/10 p-8 flex flex-col gap-10 bg-[#0F0F0F] overflow-y-auto">
          <section>
            <span className="text-[10px] text-white/30 uppercase tracking-[0.3em] block mb-6 italic">01 / Sound Source</span>
            <label className="bg-white/5 border border-white/10 p-4 flex items-center gap-4 cursor-pointer hover:bg-white/10 transition-colors mb-4 group">
              <div className="w-10 h-10 bg-white/10 flex items-center justify-center shrink-0 group-hover:bg-white/20 transition-colors">
                {audioUrl ? <div className="w-1 h-4 bg-white animate-pulse"></div> : <Music className="w-4 h-4 text-white/50" />}
              </div>
              <div className="flex-1 overflow-hidden">
                <p className="text-xs font-medium truncate">{audioUrl ? "Audio Loaded" : "Select Audio File"}</p>
                <p className="text-[10px] text-white/40">{audioUrl ? "Ready for playback" : "WAV, MP3, M4A"}</p>
              </div>
              <input type="file" accept="audio/*" onChange={handleAudioUpload} className="hidden" />
            </label>
          </section>

          <section>
            <div className="flex items-center gap-3 mb-6">
              <span className="text-[10px] text-white/30 uppercase tracking-[0.3em] italic">02 / Typography Metadata</span>
              {isExtractingMeta && <span className="text-[9px] text-red-500 uppercase tracking-widest animate-pulse">Auto-filling...</span>}
            </div>
            <div className="space-y-6">
              <div>
                <label className="text-[10px] text-white/40 uppercase tracking-widest mb-2 block">Main Title</label>
                <input 
                  type="text" 
                  value={title} 
                  onChange={e => setTitle(e.target.value)} 
                  className="w-full bg-transparent border-b border-white/20 py-2 text-sm text-white focus:outline-none focus:border-white transition-colors" 
                />
              </div>
              <div>
                <label className="text-[10px] text-white/40 uppercase tracking-widest mb-2 block">Subtitle 1</label>
                <input 
                  type="text" 
                  value={subtitle1} 
                  onChange={e => setSubtitle1(e.target.value)} 
                  className="w-full bg-transparent border-b border-white/20 py-2 text-sm text-white focus:outline-none focus:border-white transition-colors" 
                />
              </div>
              <div>
                <label className="text-[10px] text-white/40 uppercase tracking-widest mb-2 block">Subtitle 2</label>
                <input 
                  type="text" 
                  value={subtitle2} 
                  onChange={e => setSubtitle2(e.target.value)} 
                  className="w-full bg-transparent border-b border-white/20 py-2 text-sm text-white focus:outline-none focus:border-white transition-colors" 
                />
              </div>
            </div>
          </section>

          <section>
            <span className="text-[10px] text-white/30 uppercase tracking-[0.3em] block mb-6 italic">03 / Subtitle Track</span>
            <div className="space-y-3">
              <div className="flex justify-between items-center text-[11px] border-b border-white/5 pb-2">
                <label className="cursor-pointer group flex items-center">
                  <span className="text-white/40 group-hover:text-white transition-colors uppercase tracking-widest">SRT File / Edit</span>
                  <span className="text-white font-mono bg-white/10 px-2 py-1 rounded ml-4">{srtData.length > 0 ? `${srtData.length} lines` : '+ Upload'}</span>
                  <input type="file" accept=".srt" onChange={handleSrtUpload} className="hidden" />
                </label>
                {srtData.length > 0 && (
                  <div className="flex gap-4">
                    <button 
                      onClick={() => {
                        const blob = new Blob([srtRaw], { type: 'text/plain' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = 'subtitles.srt';
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                      }}
                      className="text-white/40 hover:text-white/80 transition-colors uppercase tracking-widest flex items-center gap-1"
                    >
                      <Download className="w-3 h-3" />
                      Save
                    </button>
                    <button 
                      onClick={() => { setSrtData([]); setSrtRaw(''); }}
                      className="text-white/40 hover:text-white/80 transition-colors uppercase tracking-widest"
                    >
                      Clear
                    </button>
                  </div>
                )}
              </div>

              {audioFile && (
                <button 
                  onClick={generateSubtitles}
                  disabled={isGeneratingSubtitles}
                  className="w-full bg-white/5 hover:bg-white/10 border border-white/10 text-white text-[10px] uppercase tracking-widest py-3 rounded mb-3 flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                >
                  {isGeneratingSubtitles ? <span className="animate-spin text-white">⟳</span> : <Sparkles className="w-3 h-3" />}
                  {isGeneratingSubtitles ? "Auto-Generating AI Subtitles..." : "Auto-Recognize Subtitles (AI)"}
                </button>
              )}
              
              {srtData.length > 0 ? (
                <div className="max-h-64 overflow-y-auto space-y-2 mb-3 bg-[#111] p-2 rounded border border-white/5 pr-3 custom-scrollbar">
                  {srtData.map((sub, i) => {
                     const isActive = currentTime + 0.3 >= sub.start && currentTime <= sub.end;
                     return (
                       <div key={i} className={`flex flex-col gap-1 p-2 rounded text-xs transition-colors ${isActive ? 'bg-white/10 border-l-2 border-white' : 'bg-black/50 border-l-2 border-transparent'}`}>
                         <div className="flex justify-between items-center text-white/50 text-[10px] font-mono">
                           <div className="flex items-center gap-1">
                             <input type="number" step="0.1" className="bg-transparent border-b border-white/20 w-12 text-center focus:border-white focus:outline-none text-white outline-none" value={sub.start.toFixed(2)} onChange={e => updateSrtElement(i, 'start', parseFloat(e.target.value))} />
                             <span>s</span>
                           </div>
                           <span className="text-white/20">→</span>
                           <div className="flex items-center gap-1">
                             <input type="number" step="0.1" className="bg-transparent border-b border-white/20 w-12 text-center focus:border-white focus:outline-none text-white outline-none" value={sub.end.toFixed(2)} onChange={e => updateSrtElement(i, 'end', parseFloat(e.target.value))} />
                             <span>s</span>
                           </div>
                         </div>
                         <input 
                           type="text" 
                           className="bg-transparent text-white focus:outline-none w-full text-center mt-1"
                           value={sub.text.replace(/\n/g, ' / ')} 
                           onChange={e => updateSrtElement(i, 'text', e.target.value.replace(/ \/ /g, '\n'))}
                         />
                       </div>
                     );
                  })}
                </div>
              ) : (
                <textarea
                    value={srtRaw}
                    onChange={handleSrtChange}
                    placeholder="Paste or edit SRT content here..."
                    className="w-full bg-[#111] border border-white/10 rounded p-3 text-xs text-white/80 font-mono placeholder:text-white/20 focus:outline-none focus:border-white/40 h-32 resize-y transition-colors leading-relaxed"
                />
              )}
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between mb-6">
              <span className="text-[10px] text-white/30 uppercase tracking-[0.3em] italic">04 / Background</span>
              {imageElement && (
                <button 
                  onClick={() => {
                    const a = document.createElement('a');
                    a.href = imageElement.src;
                    a.download = 'generated_cover.jpg';
                    a.click();
                  }}
                  title="Download Cover"
                  className="text-white/40 hover:text-white hover:bg-white/10 p-1.5 rounded transition-colors flex items-center justify-center border border-transparent hover:border-white/20"
                >
                  <Download className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="space-y-4">
              <label className="aspect-video bg-white/5 border border-dashed border-white/20 flex flex-col items-center justify-center gap-4 group cursor-pointer hover:bg-white/10 transition-colors relative overflow-hidden">
                 {imageElement && (
                   <img src={imageElement.src} alt="bg" className="absolute inset-0 w-full h-full object-cover opacity-50 mix-blend-luminosity" />
                 )}
                 <div className="w-8 h-8 rounded-full border border-white/20 flex items-center justify-center group-hover:bg-white group-hover:text-black transition-colors relative z-10 bg-black/40 backdrop-blur-sm">
                   <span className="text-lg leading-none mb-[2px]">+</span>
                 </div>
                 <span className="text-[9px] uppercase tracking-widest text-white/40 relative z-10 bg-black/40 px-2 py-1 backdrop-blur-sm">Upload Image</span>
                 <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
              </label>

              <div className="pt-4 border-t border-white/10 space-y-3">
                <span className="text-[9px] uppercase tracking-[0.2em] text-white/40 mb-2 block">Or Generate via AI (Oil Painting)</span>
                <textarea
                  value={coverPrompt}
                  onChange={e => setCoverPrompt(e.target.value)}
                  placeholder="Optional: Describe your cover image..."
                  className="w-full bg-black/50 border border-white/20 rounded p-3 text-xs text-white font-serif placeholder:text-white/20 focus:outline-none focus:border-white/50 h-24 resize-none transition-colors"
                />
                <button
                  onClick={generateCover}
                  disabled={isGeneratingCover}
                  className="w-full py-2.5 flex items-center justify-center gap-2 bg-white text-black text-[10px] uppercase tracking-[0.2em] font-bold hover:bg-white/90 transition-colors disabled:opacity-50"
                >
                  {isGeneratingCover ? (
                    <div className="w-3 h-3 rounded-full bg-black animate-pulse" />
                  ) : (
                    <Sparkles className="w-3 h-3" />
                  )}
                  {isGeneratingCover ? 'Generating...' : 'Generate AI Cover'}
                </button>
              </div>
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between mb-6">
              <span className="text-[10px] text-white/30 uppercase tracking-[0.3em] italic">05 / Visualizer</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {(['waveform', 'spectrum'] as VisualizerStyle[]).map(style => (
                <button
                  key={style}
                  onClick={() => setVisualizerStyle(style)}
                  className={`flex-1 py-2 px-2 text-[10px] uppercase tracking-widest border transition-colors whitespace-nowrap min-w-[30%] ${
                    visualizerStyle === style 
                      ? 'bg-white text-black border-white font-bold' 
                      : 'bg-transparent text-white/60 border-white/20 hover:bg-white/10 hover:border-white/40'
                  }`}
                >
                  {style.replace('-', ' ')}
                </button>
              ))}
            </div>
          </section>
        </aside>

        {/* Right: Cinematic Preview */}
        <section className="relative bg-black flex flex-col overflow-hidden">
          <div className="flex-1 relative flex items-center justify-center p-8 lg:p-12 min-h-0">
            {/* Background Image Mock if no audio */}
            {!audioUrl && (
              <div className="absolute inset-0 bg-[#1A1A1A] opacity-60 flex items-center justify-center overflow-hidden z-20 pointer-events-none">
                <div className="w-full h-full bg-gradient-to-br from-[#222] to-[#000]"></div>
                <span className="absolute text-[18vw] font-black text-white/5 uppercase select-none tracking-tighter mix-blend-overlay">Cinematic</span>
              </div>
            )}
            
            {/* Canvas Container */}
            <div className="w-full max-w-[1920px] aspect-video bg-[#0A0A0A] overflow-hidden relative z-10 border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.8)] flex items-center justify-center mix-blend-screen">
              <canvas
                ref={canvasRef}
                width={1920}
                height={1080}
                className="w-full h-full object-contain"
              />
            </div>

            {/* UI Overlays */}
            <div className="absolute top-8 left-8 flex gap-2 z-30 pointer-events-none">
              <span className="px-2 py-1 bg-black/50 text-[9px] border border-white/20 uppercase tracking-widest text-white/70">Preview Mode</span>
              {isPlaying && <span className="px-2 py-1 bg-white/20 text-white text-[9px] border border-white/30 uppercase tracking-widest">Live Sync</span>}
              {isRecording && <span className="px-2 py-1 bg-red-600/20 text-red-500 text-[9px] border border-red-500/30 uppercase tracking-widest">Rendering</span>}
            </div>
            
            {/* Hidden Audio Element */}
            <audio
              ref={audioRef}
              src={audioUrl || undefined}
              crossOrigin="anonymous"
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
              onEnded={handleAudioEnded}
              className="hidden"
            />
          </div>

          {/* Timeline / Transport */}
          <div className="h-48 bg-[#0A0A0A] border-t border-white/10 p-8 shrink-0 flex flex-col justify-end">
            <div className="flex justify-between items-end mb-6">
               <div className="flex gap-6 items-baseline">
                 <span className="text-3xl font-mono tracking-tighter">
                   {formatTime(currentTime).split(':').map((part, i) => (
                     <React.Fragment key={i}>
                       {i > 0 && ':'}
                       {i === 1 ? <span className={i===1 ? "text-sm opacity-50" : ""}>{part}</span> : part}
                     </React.Fragment>
                   ))}
                   <span className="text-sm opacity-50">.{(currentTime % 1).toFixed(2).slice(2)}</span>
                 </span>
                 <span className="text-[10px] text-white/30 uppercase tracking-widest">/ {formatTime(duration)}.00</span>
               </div>
               <div className="flex gap-4">
                 <button 
                   onClick={togglePlay}
                   disabled={!audioUrl}
                   className="w-10 h-10 rounded-full border border-white/20 flex items-center justify-center hover:bg-white hover:text-black cursor-pointer transition-colors disabled:opacity-50"
                 >
                   {isPlaying ? <span className="font-bold text-xs uppercase">II</span> : <span className="text-xs uppercase ml-[2px]">▶</span>}
                 </button>
               </div>
            </div>
            
            {/* Custom Range Slider (Waveform mock style) */}
            <div className="h-12 flex items-center gap-[2px] relative group cursor-pointer w-full">
              <input
                type="range"
                min={0}
                max={duration || 100}
                step={0.01}
                value={currentTime}
                onChange={handleAudioSeek}
                disabled={!audioUrl}
                className="absolute inset-0 z-20 w-full opacity-0 cursor-pointer h-full"
              />
              <div className="flex-1 h-[2px] bg-white/10 relative pointer-events-none">
                <div 
                  className="absolute left-0 top-1/2 -translate-y-1/2 h-[2px] bg-white transition-all ease-linear" 
                  style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
                ></div>
                <div 
                  className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-[0_0_15px_rgba(255,255,255,0.8)] transition-all ease-linear"
                  style={{ left: `calc(${(currentTime / (duration || 1)) * 100}% - 6px)` }}
                ></div>
                {/* Decorative tick marks mimicking waveform */}
                <div className="absolute inset-0 flex items-center justify-around opacity-20" style={{ pointerEvents: 'none' }}>
                  <div className="w-[1px] h-8 bg-white"></div><div className="w-[1px] h-4 bg-white"></div><div className="w-[1px] h-10 bg-white"></div><div className="w-[1px] h-6 bg-white"></div><div className="w-[1px] h-8 bg-white"></div><div className="w-[1px] h-2 bg-white"></div><div className="w-[1px] h-12 bg-white"></div><div className="w-[1px] h-4 bg-white"></div><div className="w-[1px] h-8 bg-white"></div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Bottom Bar Info */}
      <footer className="px-8 py-3 bg-[#050505] border-t border-white/5 flex justify-between items-center text-[9px] uppercase tracking-[0.2em] text-white/30 shrink-0">
        <div className="flex gap-6">
          <span>Resolution: 4K (3840x2160)</span>
          <span>Frame Rate: 30fps</span>
        </div>
        <div className="flex gap-4 items-center">
          <span className={audioUrl ? "text-white/60" : "text-white/30"}>System Ready</span>
          <div className={`w-2 h-2 rounded-full ${audioUrl ? 'bg-green-500 animate-pulse' : 'bg-white/20'}`}></div>
        </div>
      </footer>
    </div>
  );
}
