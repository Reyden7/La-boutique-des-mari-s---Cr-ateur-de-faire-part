import { Music2 } from "lucide-react";
import { useEditorStore } from "../../stores/editorStore";
import { getMusicTrack } from "./musicRegistry";

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => <label className="field"><span>{label}</span>{children}</label>;

export function AudioProperties() {
  const project = useEditorStore((state) => state.project);
  const updateAudio = useEditorStore((state) => state.updateAudio);
  if (!project) return <aside className="properties-panel" />;
  const audio = project.audio;
  const trackName = audio.source === "library" ? getMusicTrack(audio.trackId)?.name : audio.uploadedAudioName;
  return <aside className="properties-panel"><div className="properties-heading"><div><small>Expérience invité</small><h2>Musique</h2></div><span className="type-pill">audio</span></div>
    <div className={`audio-property-hero ${audio.enabled ? "enabled" : ""}`}><Music2 size={24} /><div><strong>{audio.enabled ? trackName ?? "Musique sélectionnée" : "Aucune musique"}</strong><span>{audio.enabled ? "Prête à accompagner l’invitation" : "Le faire-part restera silencieux"}</span></div></div>
    {audio.enabled && <><Field label={`Volume · ${Math.round(audio.volume * 100)} %`}><input type="range" min="0" max="1" step="0.05" value={audio.volume} onChange={(event) => updateAudio({ ...audio, volume: Number(event.target.value) })} /></Field>
      <Field label="Fondu au démarrage"><select value={audio.fadeInDuration ?? 2} onChange={(event) => updateAudio({ ...audio, fadeInDuration: Number(event.target.value) })}><option value="0">Aucun</option><option value="1">1 seconde</option><option value="2">2 secondes</option><option value="3">3 secondes</option></select></Field>
      <label className="check-row"><input type="checkbox" checked={audio.loop} onChange={(event) => updateAudio({ ...audio, loop: event.target.checked })} /><span><strong>Rejouer en boucle</strong><small>La musique continue pendant la consultation.</small></span></label>
      <Field label="Démarrage"><div className="stacked-options"><button className={audio.startMode === "opening-interaction" ? "active" : ""} onClick={() => updateAudio({ ...audio, startMode: "opening-interaction" })}><strong>À l’ouverture</strong><small>Recommandé sur mobile</small></button><button className={audio.startMode === "manual" ? "active" : ""} onClick={() => updateAudio({ ...audio, startMode: "manual" })}><strong>Manuel</strong><small>L’invité lance la musique</small></button></div></Field></>}
    <div className="background-tip"><span>Lecture autorisée</span><p>Le son démarre après une interaction de l’invité, conformément au fonctionnement des navigateurs mobiles.</p></div>
  </aside>;
}
