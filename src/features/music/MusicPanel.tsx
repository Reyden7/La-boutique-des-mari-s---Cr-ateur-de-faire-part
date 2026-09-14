import { Heart, Music2, Pause, Play, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useEditorStore } from "../../stores/editorStore";
import { deleteAudioBlob, saveAudioBlob } from "./mediaStorage";
import { musicLibrary } from "./musicRegistry";
import { stopAudioPreview, toggleAudioPreview } from "./audioEngine";
import { isSupabaseConfigured } from "../../lib/supabase";
import { deleteProjectAsset, uploadProjectAsset } from "../../services/assetRepository";

const acceptedAudioTypes = ["audio/mpeg", "audio/mp4", "audio/aac", "audio/ogg", "audio/wav", "audio/x-wav"];

export function MusicPanel() {
  const project = useEditorStore((state) => state.project);
  const updateAudio = useEditorStore((state) => state.updateAudio);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => () => stopAudioPreview(), []);
  if (!project) return null;

  const audio = project.audio;
  const preview = async (trackId: string) => {
    if (previewingId === trackId) { stopAudioPreview(); setPreviewingId(null); return; }
    setPreviewingId(trackId);
    await toggleAudioPreview({ ...audio, enabled: true, source: "library", trackId });
  };
  const importMusic = async (file?: File) => {
    setUploadError("");
    if (!file) return;
    const extension = file.name.split(".").pop()?.toLowerCase();
    if ((!acceptedAudioTypes.includes(file.type) && !["mp3", "m4a", "aac", "ogg", "wav"].includes(extension ?? "")) || file.size > 20 * 1024 * 1024) {
      setUploadError("Choisissez un fichier MP3, M4A, AAC, OGG ou WAV de moins de 20 Mo.");
      return;
    }
    if (audio.uploadedAudioId) {
      if (audio.uploadedAudioUrl && isSupabaseConfigured) await deleteProjectAsset(audio.uploadedAudioId);
      else await deleteAudioBlob(audio.uploadedAudioId);
    }
    const uploadedAudioId = crypto.randomUUID();
    if (isSupabaseConfigured) {
      try {
        const asset = await uploadProjectAsset(project, file, "audio");
        updateAudio({ ...audio, enabled: true, source: "upload", trackId: undefined, uploadedAudioId: asset.id, uploadedAudioName: file.name, uploadedAudioUrl: asset.url });
      } catch { setUploadError("La musique n’a pas pu être envoyée. Vérifiez votre connexion puis réessayez."); }
      return;
    }
    await saveAudioBlob(uploadedAudioId, file);
    updateAudio({ ...audio, enabled: true, source: "upload", trackId: undefined, uploadedAudioId, uploadedAudioName: file.name, uploadedAudioUrl: undefined });
  };

  return <div className="music-panel"><div className="panel-kicker">Ambiance sonore</div><h2>Choisissez la musique</h2><p>Elle démarrera au premier geste de votre invité.</p>
    <div className="music-source-tabs"><button className={!audio.enabled ? "active" : ""} onClick={() => updateAudio({ ...audio, enabled: false, source: null })}>Aucune</button><button className={audio.enabled && audio.source === "library" ? "active" : ""} onClick={() => updateAudio({ ...audio, enabled: true, source: "library", trackId: audio.trackId ?? musicLibrary[0].id })}>Bibliothèque</button><button className={audio.enabled && audio.source === "upload" ? "active" : ""} onClick={() => fileRef.current?.click()}>Ma musique</button></div>
    <input ref={fileRef} hidden type="file" accept="audio/mpeg,audio/mp4,audio/aac,audio/ogg,audio/wav,.mp3,.m4a,.aac,.ogg,.wav" onChange={(event) => { void importMusic(event.target.files?.[0]); event.currentTarget.value = ""; }} />
    {audio.enabled && audio.source === "library" && <div className="track-list">{musicLibrary.map((track) => <article className={`track-row ${audio.trackId === track.id ? "selected" : ""}`} key={track.id}><Heart size={14} /><button className="track-info" onClick={() => updateAudio({ ...audio, enabled: true, source: "library", trackId: track.id, uploadedAudioId: undefined, uploadedAudioName: undefined })}><strong>{track.name}</strong><span>{track.category} · {track.durationLabel}</span><small>{track.description}</small></button><button className="track-play" aria-label={`Écouter ${track.name}`} onClick={() => void preview(track.id)}>{previewingId === track.id ? <Pause size={14} /> : <Play size={14} fill="currentColor" />}</button></article>)}</div>}
    {audio.enabled && audio.source === "upload" && <div className="upload-music-card">{audio.uploadedAudioId ? <><Music2 size={24} /><div><strong>{audio.uploadedAudioName}</strong><small>{audio.uploadedAudioUrl ? "Stocké en ligne" : "Enregistré dans ce navigateur"}</small></div><button aria-label="Écouter ma musique" onClick={async () => { if (previewingId === "upload") { stopAudioPreview(); setPreviewingId(null); } else { setPreviewingId("upload"); await toggleAudioPreview(audio); } }}>{previewingId === "upload" ? <Pause size={15} /> : <Play size={15} />}</button><button aria-label="Supprimer ma musique" onClick={() => { if (audio.uploadedAudioId) { if (audio.uploadedAudioUrl && isSupabaseConfigured) void deleteProjectAsset(audio.uploadedAudioId); else void deleteAudioBlob(audio.uploadedAudioId); } updateAudio({ ...audio, enabled: false, source: null, uploadedAudioId: undefined, uploadedAudioName: undefined, uploadedAudioUrl: undefined }); }}><Trash2 size={15} /></button></> : <button className="upload-audio-button" onClick={() => fileRef.current?.click()}><Upload size={18} /><strong>Importer ma musique</strong><small>MP3, M4A, AAC, OGG ou WAV · 20 Mo max.</small></button>}</div>}
    {uploadError && <p className="upload-error">{uploadError}</p>}
    <div className="license-note"><span>Bibliothèque sûre</span><p>Les extraits de démonstration sont des compositions originales CC0, utilisables commercialement sans attribution.</p></div>
  </div>;
}
