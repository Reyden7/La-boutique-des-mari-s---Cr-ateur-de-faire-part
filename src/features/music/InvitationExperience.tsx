import { Music2, Pause, Play, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { AudioController } from "./audioEngine";
import { createAudioController } from "./audioEngine";
import type { WeddingProject } from "../../types/editor";
import { WeddingRenderer } from "../../components/renderer/WeddingRenderer";
import { OpeningRenderer } from "../openings/OpeningRenderer";
import { ParticleRenderer } from "../particles/ParticleRenderer";
import type { PreviewDevice } from "../../config/previewDevices";

export function InvitationExperience({ project, device }: { project: WeddingProject; device?: PreviewDevice }) {
  const controllerRef = useRef<AudioController | null>(null);
  const [playing, setPlaying] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  useEffect(() => () => controllerRef.current?.stop(), []);

  const start = async () => {
    if (!project.audio.enabled) return;
    if (controllerRef.current) { await controllerRef.current.resume(); setPlaying(true); return; }
    try {
      controllerRef.current = await createAudioController(project.audio);
      setAudioReady(Boolean(controllerRef.current));
      setPlaying(Boolean(controllerRef.current));
    } catch { setPlaying(false); }
  };
  const toggle = async () => {
    const controller = controllerRef.current;
    if (!controller) { await start(); return; }
    if (controller.isPlaying()) { controller.pause(); setPlaying(false); }
    else { await controller.resume(); setPlaying(true); }
  };
  const onInteract = () => { if (project.audio.startMode === "opening-interaction") void start(); };
  const couple = project.name.match(/—\s*(.*)/)?.[1] ?? project.name;

 return (
  <div className="invitation-experience">
    {project.particles?.layer ===
      "behind" && (
      <ParticleRenderer
        config={
          project.particles
        }
      />
    )}

    <div className="invitation-content-layer">
      <OpeningRenderer
        config={
          project.opening
        }
        couple={couple}
        onInteract={
          onInteract
        }
      >
        <WeddingRenderer
          project={project}
          device={device}
        />
      </OpeningRenderer>
    </div>

    {project.particles?.layer ===
      "front" && (
      <ParticleRenderer
        config={
          project.particles
        }
      />
    )}

    {project.audio.enabled && (
      <div
        className={`guest-audio-control ${
          audioReady
            ? "ready"
            : ""
        }`}
      >
        <button
          onClick={() =>
            void toggle()
          }
          aria-label={
            playing
              ? "Mettre la musique en pause"
              : "Écouter la musique"
          }
        >
          {playing ? (
            <Pause
              size={17}
            />
          ) : (
            <Play
              size={17}
              fill="currentColor"
            />
          )}
        </button>

        <Volume2
          size={13}
        />

        <span>
          {playing
            ? "Musique"
            : "En pause"}
        </span>
      </div>
    )}
  </div>
);
}
