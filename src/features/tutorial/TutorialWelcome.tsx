import { useEffect, useRef } from "react";
import { useTutorialDialog } from "./useTutorialDialog";
import { finishTutorial, offerTutorial, startTutorial, useTutorialStore } from "./tutorialStore";

export function TutorialWelcome({ context, eligible, blocked = false, onStart }: { context: "home" | "editor"; eligible: boolean; blocked?: boolean; onStart?: () => void }) {
  const { invitation, ready, preference, active, pending } = useTutorialStore();
  const dialog = useRef<HTMLElement>(null);
  useTutorialDialog(dialog, !blocked && invitation === context, () => finishTutorial(false));
  useEffect(() => { if (!blocked) offerTutorial(context, eligible); }, [context, eligible, blocked, ready, preference.offered, active]);
  if (context === "home" && pending) return <aside className="tutorial-start-hint"><strong>Choisissez votre point de départ</strong><p>Un modèle prêt à personnaliser ou une création vierge : la visite commencera dans l’éditeur.</p><button onClick={onStart}>Choisir mon point de départ</button><button onClick={() => finishTutorial(false)}>Continuer sans visite</button></aside>;
  if (blocked || invitation !== context) return null;
  return <div className="modal-backdrop tutorial-welcome-backdrop"><section ref={dialog} className="tutorial-welcome" role="dialog" aria-modal="true" aria-labelledby="tutorial-welcome-title">
    <button className="tutorial-close" aria-label="Fermer la proposition de visite" onClick={() => finishTutorial(false)}>×</button>
    <p className="eyebrow">À votre rythme</p><h2 id="tutorial-welcome-title">Bienvenue dans Le Bureau des Mariés Studio !</h2>
    <p>Vous allez créer votre propre faire-part de mariage numérique. Souhaitez-vous découvrir les fonctionnalités essentielles de notre outil ? Cela prend environ 3 à 5 minutes.</p>
    <div className="tutorial-actions"><button className="primary" autoFocus onClick={() => { startTutorial("main", context === "home"); onStart?.(); }}>Découvrir le studio</button><button onClick={() => finishTutorial(false)}>Plus tard</button></div>
    <small>La visite est facultative. Vous pourrez la retrouver à tout moment depuis Aide.</small>
  </section></div>;
}
