import { Check, Home, Sparkles, X } from "lucide-react";
import type { OpeningAnimationType } from "../../types/editor";
import { useEditorStore } from "../../stores/editorStore";
import { WelcomePageEditor } from "../welcome/WelcomePageEditor";
import { OpeningSelector } from "../openings/OpeningSelector";
import { getOpeningDefinition } from "../openings/registry/openingRegistry";

export function IntroductionPanel({ onPreview }: { onPreview: (type: OpeningAnimationType) => void }) {
  const { project, updateIntroductionMode, updateOpening } = useEditorStore();
  if (!project) return null;
  const mode = project.introductionMode;
  const chooseClassic = () => {
    if (project.opening.type === "none") updateOpening(getOpeningDefinition("envelope").defaultSettings);
    else updateIntroductionMode("classic");
  };

  return <div className="introduction-panel">
    <div className="panel-kicker">Expérience invité</div>
    <h2>Introduction</h2>
    <p>Choisissez une seule entrée avant le faire-part.</p>
    <section className="introduction-mode-section">
      <strong>Type d’introduction</strong>
      <div className="introduction-mode-grid">
        <button className={mode === "none" ? "selected" : ""} onClick={() => updateIntroductionMode("none")}><X size={16} /><span><b>Aucune</b><small>Accès direct</small></span>{mode === "none" && <Check size={14} />}</button>
        <button className={mode === "welcome" ? "selected" : ""} onClick={() => updateIntroductionMode("welcome")}><Home size={16} /><span><b>Page d’accueil</b><small>Arche, paysage et textes</small></span>{mode === "welcome" && <Check size={14} />}</button>
        <button className={mode === "classic" ? "selected" : ""} onClick={chooseClassic}><Sparkles size={16} /><span><b>Ouverture classique</b><small>Enveloppe, rideaux ou porte</small></span>{mode === "classic" && <Check size={14} />}</button>
      </div>
    </section>
    {mode === "none" && <div className="introduction-empty"><X size={20} /><strong>Aucune introduction</strong><p>Les invités arriveront directement sur le document principal.</p></div>}
    {mode === "welcome" && <WelcomePageEditor embedded />}
    {mode === "classic" && <OpeningSelector onPreview={onPreview} includeNone={false} embedded />}
  </div>;
}
