import { CircleHelp, X } from "lucide-react";
import { useRef } from "react";
import { useTutorialDialog } from "./useTutorialDialog";
import { useEditorStore } from "../../stores/editorStore";
import { FEATURE_GUIDES, MAIN_TUTORIAL, MINI_TUTORIALS } from "./tutorialConfig";
import { finishTutorial, startTutorial, useTutorialStore } from "./tutorialStore";

export function TutorialHelpButton() {
  const help = useTutorialStore((state) => state.help);
  return <button type="button" className="tutorial-help-button" data-tour="help-button" aria-label="Aide" aria-expanded={Boolean(help)} onClick={() => useTutorialStore.setState({ help: help ? null : "menu" })}><CircleHelp size={17} /><span>Aide</span></button>;
}

export function TutorialHelp() {
  const { help, syncError } = useTutorialStore();
  const close = () => useTutorialStore.setState({ help: null });
  const dialog = useRef<HTMLElement>(null);
  useTutorialDialog(dialog, Boolean(help), close, help);
  if (!help) return null;
  const currentHelp = () => {
    const { sidebarView, selectedElementId, project, currentPageId } = useEditorStore.getState();
    const selected = project?.pages.find((page) => page.id === currentPageId)?.elements.find((element) => element.id === selectedElementId);
    if (sidebarView === "music" || sidebarView === "effects") startTutorial("music");
    else if (sidebarView === "elements" && selected?.type === "text") startTutorial("text");
    else {
      const index = sidebarView === "design" ? 2 : sidebarView === "introduction" ? 3 : 4;
      const tips: Record<string, string> = {
        image: "Ajustement choisit entre afficher l’image entière et remplir le cadre. Disposition règle sa taille et sa position sur le support actif.",
        calendar: "Configurez la date du mariage et l’apparence du Calendrier. Ajout à l’agenda propose Google Agenda ou un fichier universel, sans demander l’accès au compte Google.",
        countdown: "Choisissez la date cible, le style et les couleurs du Compte à rebours. Le nombre de jours restants se met à jour automatiquement.",
        schedule: "Renseignez les horaires et les lieux du Programme. Chaque étape peut avoir son icône ou une image importée.",
        section: "La Section regroupe des éléments et personnalise leur fond, couleur, texture et bordures. Les calques organisent leur ordre et leur visibilité.",
        carousel: "Importez plusieurs photos, puis choisissez leur présentation. Vérifiez leur cadrage et leur taille sur les trois supports.",
        scratch: "Personnalisez le contenu à révéler et son masque. Le résultat interactif se teste en Aperçu, pas dans le canvas d’édition.",
      };
      const step = sidebarView === "elements" && selected ? { id: "current-tool", title: "Personnalisez l’élément sélectionné", description: tips[selected.type] ?? "Les propriétés règlent l’apparence, les dimensions et la position de cet élément. Ajustez le support actif et vérifiez le résultat en Aperçu.", targets: ["properties-panel"], panel: "properties" as const } : MAIN_TUTORIAL[index];
      MINI_TUTORIALS.current = { title: "Aide sur l’outil actuel", steps: [step] };
      startTutorial("current");
    }
  };
  return <div className="modal-backdrop tutorial-help-backdrop" onMouseDown={close}><section ref={dialog} className="tutorial-help-dialog" role="dialog" aria-modal="true" aria-labelledby="tutorial-help-title" onMouseDown={(event) => event.stopPropagation()}>
    <button className="tutorial-close" aria-label="Fermer l’aide" onClick={close}><X size={18} /></button><h2 id="tutorial-help-title">{help === "features" ? "Découvrir les fonctionnalités" : "Comment pouvons-nous vous aider ?"}</h2>
    {help === "menu" ? <div className="tutorial-help-options">
      <button autoFocus onClick={() => startTutorial("main")}><strong>Refaire la visite guidée</strong><span>{MAIN_TUTORIAL.length} étapes, à votre rythme.</span></button>
      <button onClick={() => useTutorialStore.setState({ help: "features" })}><strong>Découvrir les fonctionnalités</strong><span>Retrouvez les outils et leurs mini-tutoriels.</span></button>
      <button onClick={currentHelp}><strong>Aide sur l’outil actuel</strong><span>Une explication adaptée à l’onglet ou au texte sélectionné.</span></button>
    </div> : <><div className="tutorial-feature-grid">{FEATURE_GUIDES.map((guide) => <article key={guide.title}><h3>{guide.title}</h3><p>{guide.description}</p>{guide.tour && <button onClick={() => startTutorial(guide.tour)}>Me guider</button>}</article>)}</div><button onClick={() => useTutorialStore.setState({ help: "menu" })}>Retour à l’aide</button></>}
    {syncError && <p className="tutorial-sync-note" role="status">Votre préférence est conservée dans ce navigateur. La synchronisation au compte n’a pas abouti. <button onClick={() => useTutorialStore.setState((state) => ({ revision: state.revision + 1 }))}>Réessayer</button></p>}
    <button onClick={() => { if (useTutorialStore.getState().active) finishTutorial(false); else close(); }}>Continuer à créer</button>
  </section></div>;
}
