import { useEffect, useRef, useState } from "react";
import { PREVIEW_VIDEO_ADVICE, previewPlayback } from "./previewVideo";
import { removePreviewVideo, resolvePreviewVideoUrl, uploadPreviewVideo, type PreviewVideoTarget } from "../../services/previewVideoRepository";
import "./previewVideos.css";

export function PreviewVideoManager({ target, initialPath, name, onSaved, onClose }: {
  target: PreviewVideoTarget; initialPath?: string | null; name: string;
  onSaved: (value: { path: string | null; updatedAt: string }) => void; onClose: () => void;
}) {
  const input = useRef<HTMLInputElement>(null), pending = useRef(false);
  const player = useRef<HTMLVideoElement>(null), identity = useRef(Symbol());
  useEffect(() => { previewPlayback.claim(identity.current, () => player.current?.pause()); return () => previewPlayback.release(identity.current); }, []);
  const [path, setPath] = useState(initialPath ?? null), [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState("");
  const run = async (work: () => Promise<void>) => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(""); setMessage("");
    try { await work(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Impossible de gérer cette vidéo."); }
    finally { pending.current = false; setBusy(false); }
  };
  const save = (value: { path: string | null; updatedAt: string }) => { setPath(value.path); setUrl(null); setConfirming(false); setMessage(value.path ? "Vidéo enregistrée." : "Vidéo retirée. La miniature fixe est conservée."); onSaved(value); };
  return <div className="modal-backdrop" onMouseDown={() => { if (!pending.current) onClose(); }} onKeyDown={event => { if (event.key === "Escape" && !pending.current) onClose(); }}>
    <section className="preview-video-dialog" role="dialog" aria-modal="true" aria-label={`Vidéo de présentation — ${name}`} onMouseDown={event => event.stopPropagation()}>
      <h2>Vidéo de présentation</h2><strong>{name}</strong>
      <p>Facultative · MP4 / WebM · 15 Mo maximum.<br />{PREVIEW_VIDEO_ADVICE}</p>
      <p>{target.kind === "project" ? "Vidéo privée : accessible uniquement depuis votre compte. Elle ne sera pas publiée avec le faire-part." : "Vidéo visible dans la galerie uniquement si le template est publié. Les brouillons restent réservés aux admins."}</p>
      {url && <video ref={player} key={url} src={url} controls muted playsInline preload="metadata" onPlay={() => previewPlayback.claim(identity.current, () => player.current?.pause())} onError={() => { setUrl(null); setError("Cette vidéo ne peut pas être lue dans ce navigateur."); }} />}
      <input ref={input} type="file" accept="video/mp4,video/webm,.mp4,.webm" hidden disabled={busy} onChange={event => {
        const file = event.target.files?.[0]; event.target.value = "";
        if (file) void run(async () => save(await uploadPreviewVideo(target, file, path)));
      }} />
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {busy && <p role="status">Traitement en cours…</p>}
      <div className="preview-video-actions">
        <button type="button" className="primary" autoFocus disabled={busy} onClick={() => input.current?.click()}>{path ? "Remplacer la vidéo" : "Importer une vidéo"}</button>
        {path && <><button type="button" disabled={busy} onClick={() => void run(async () => setUrl(await resolvePreviewVideoUrl(path)))}>Voir la vidéo</button>
          <button type="button" disabled={busy} onClick={() => setConfirming(true)}>Retirer la vidéo</button></>}
        <button type="button" disabled={busy} onClick={onClose}>Fermer</button>
      </div>
      {confirming && <div><p>Retirer la vidéo et supprimer son fichier ? La miniature fixe sera conservée.</p><div className="preview-video-actions">
        <button type="button" disabled={busy} onClick={() => void run(async () => { if (path) save(await removePreviewVideo(target, path)); })}>Confirmer le retrait</button>
        <button type="button" disabled={busy} onClick={() => setConfirming(false)}>Annuler</button>
      </div></div>}
    </section>
  </div>;
}
