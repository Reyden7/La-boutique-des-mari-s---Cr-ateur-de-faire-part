import { Play, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { resolvePreviewVideoUrl } from "../../services/previewVideoRepository";
import { previewPlayback } from "./previewVideo";
import "./previewVideos.css";

export function HoverVideoThumbnail({ imageUrl, videoPath, videoUrl, alt, children, resolveUrl = resolvePreviewVideoUrl }: {
  imageUrl?: string | null; videoPath?: string | null; videoUrl?: string | null; alt: string; children?: ReactNode;
  resolveUrl?: (path: string) => Promise<string>;
}) {
  const video = useRef<HTMLVideoElement>(null), identity = useRef(Symbol()), generation = useRef(0), active = useRef(false);
  const [source, setSource] = useState<string | null>(null), [visible, setVisible] = useState(false), [busy, setBusy] = useState(false);
  const [manual, setManual] = useState(() => typeof window !== "undefined" && (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !window.matchMedia("(hover: hover) and (pointer: fine)").matches));
  const wrapper = useRef<HTMLDivElement>(null);
  const stop = useCallback(() => {
    generation.current++; active.current = false; previewPlayback.release(identity.current);
    if (video.current) { video.current.pause(); try { video.current.currentTime = 0; } catch { /* Not decoded yet. */ } }
    setVisible(false); setBusy(false); setSource(null);
  }, []);
  const start = async () => {
    if ((!videoPath && !videoUrl) || active.current) return;
    previewPlayback.claim(identity.current, stop); active.current = true; setBusy(true);
    const request = ++generation.current;
    try {
      const url = videoUrl || await resolveUrl(videoPath!);
      if (request !== generation.current || !active.current) return;
      setSource(url);
    } catch { if (request === generation.current) stop(); }
  };
  useEffect(() => {
    const element = video.current;
    if (!source || !element) return;
    const request = generation.current;
    element.muted = true;
    void element.play().catch(() => { if (request === generation.current) stop(); else element.pause(); });
  }, [source, stop]);
  useEffect(() => {
    stop();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)"), mouse = window.matchMedia("(hover: hover) and (pointer: fine)");
    const update = () => { stop(); setManual(reduced.matches || !mouse.matches); };
    const hidden = () => { if (document.hidden) stop(); };
    reduced.addEventListener("change", update); mouse.addEventListener("change", update);
    document.addEventListener("visibilitychange", hidden); window.addEventListener("blur", stop);
    const observer = new IntersectionObserver(([entry]) => { if (entry && !entry.isIntersecting) stop(); });
    if (wrapper.current) observer.observe(wrapper.current);
    return () => { generation.current++; active.current = false; previewPlayback.release(identity.current); video.current?.pause(); observer.disconnect();
      reduced.removeEventListener("change", update); mouse.removeEventListener("change", update); document.removeEventListener("visibilitychange", hidden); window.removeEventListener("blur", stop); };
  }, [videoPath, videoUrl, stop]);
  return <div ref={wrapper} className={`hover-video-thumbnail${visible ? " is-playing" : ""}`} onPointerEnter={(event) => { if (event.pointerType === "mouse" && !manual) void start(); }} onPointerLeave={(event) => { if (event.pointerType === "mouse" && !manual) stop(); }}>
    <div className="hover-video-static">{imageUrl ? <img loading="lazy" src={imageUrl} alt={alt} /> : children}</div>
    {source && <video ref={video} src={source} muted loop playsInline preload="none" aria-hidden="true" onError={stop} onPlaying={() => {
      const element = video.current, request = generation.current;
      const reveal = () => { if (active.current && request === generation.current) { setVisible(true); setBusy(false); } };
      if (element?.requestVideoFrameCallback) element.requestVideoFrameCallback(reveal); else reveal();
    }} />}
    {manual && (videoPath || videoUrl) && <button type="button" className="hover-video-play" aria-label={active.current ? `Arrêter la présentation de ${alt}` : `Lire la présentation de ${alt}`} aria-pressed={Boolean(source || busy)} onClick={(event) => { event.stopPropagation(); if (active.current) stop(); else void start(); }}>{source || busy ? <Square size={14} /> : <Play size={14} />}</button>}
  </div>;
}
