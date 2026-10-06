import { Music2, Pause, Play, Volume2 } from "lucide-react";
import { AnimatePresence } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import type { AudioController } from "./audioEngine";
import { createAudioController } from "./audioEngine";
import type { WeddingProject } from "../../types/editor";
import { WeddingRenderer } from "../../components/renderer/WeddingRenderer";
import { OpeningRenderer } from "../openings/OpeningRenderer";
import { ParticleRenderer } from "../particles/ParticleRenderer";
import type { PreviewDevice } from "../../config/previewDevices";
import type { RsvpRenderMode } from "../rsvp/RsvpFormRenderer";
import { useResponsiveDevice } from "../../hooks/useResponsiveDevice";
import { WelcomePageRenderer } from "../welcome/WelcomePageRenderer";
import { resolveWelcomePage } from "../welcome/welcomeDefaults";

export function InvitationExperience({ project, device, mode = "public" }: { project: WeddingProject; device?: PreviewDevice; mode?: RsvpRenderMode }) {
  const controllerRef = useRef<AudioController | null>(null);
  const [playing, setPlaying] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const welcomePage = resolveWelcomePage(project.welcomePage);
  const introductionMode = project.introductionMode ?? (welcomePage.enabled ? "welcome" : project.opening.type === "none" ? "none" : "classic");
  const activeDevice = useResponsiveDevice(device);
  const [welcomeVisible, setWelcomeVisible] = useState(introductionMode === "welcome");
  const [documentAnimationReady, setDocumentAnimationReady] = useState(introductionMode === "none" || (introductionMode === "classic" && project.opening.type === "none"));
  const welcomeEnteredRef = useRef(false);
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
  const onInteract = () => {
    // Start element entrances behind the opening paper, not after its removal.
    // This avoids revealing hidden elements and then flashing them into view.
    if (introductionMode === "classic" && project.opening.type === "envelope") setDocumentAnimationReady(true);
    if (project.audio.startMode === "opening-interaction") void start();
  };
  const enterWelcome = () => {
    if (welcomeEnteredRef.current) return;
    welcomeEnteredRef.current = true;
    onInteract();
    setWelcomeVisible(false);
  };
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
      {introductionMode !== "classic" ? <WeddingRenderer
          project={project}
          device={activeDevice}
          mode={mode}
          playAnimations={documentAnimationReady}
        /> : <OpeningRenderer
        config={
          project.opening
        }
        couple={couple}
        onInteract={
          onInteract
        }
        onComplete={() => setDocumentAnimationReady(true)}
      >
        <WeddingRenderer
          project={project}
          device={activeDevice}
          mode={mode}
          playAnimations={documentAnimationReady}
        />
      </OpeningRenderer>}
    </div>

    <AnimatePresence onExitComplete={() => { if (introductionMode === "welcome" && welcomeEnteredRef.current) setDocumentAnimationReady(true); }}>
      {introductionMode === "welcome" && welcomeVisible && <WelcomePageRenderer config={welcomePage} device={activeDevice} onEnter={enterWelcome} />}
    </AnimatePresence>

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
