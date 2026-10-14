import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { isDiscoveryProject } from "../discovery/discoverySession";
import { useEditorStore } from "../../stores/editorStore";
import { getTutorialSteps } from "./tutorialConfig";
import { captureTutorialUi, prepareTutorialStep, restoreTutorialUi } from "./tutorialContext";
import { clipTourRect, placeTourCard, type TourRect } from "./tutorialLayout";
import { finishTutorial, moveTutorial, useTutorialStore } from "./tutorialStore";

function findTourTarget(target: string) {
  for (const node of document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`)) {
    if (node.closest("[inert]")) continue;
    // Desktop panel hosts use display:contents; their real visible panel is the anchor.
    const candidates = [node, ...node.children] as HTMLElement[];
    const visible = candidates.find((candidate) => candidate.getClientRects().length && candidate.getBoundingClientRect().width > 0 && candidate.getBoundingClientRect().height > 0);
    if (visible) return visible;
  }
  return undefined;
}

export function TutorialLayer({ blocked, openPanel }: { blocked: boolean; openPanel: (panel: "tools" | "properties" | null) => void }) {
  const maskId = useId();
  const { active, index } = useTutorialStore();
  const step = getTutorialSteps(active ?? "")[index];
  const project = useEditorStore((state) => state.project);
  const sidebarView = useEditorStore((state) => state.sidebarView);
  const contextChanged = Boolean(step?.tab && sidebarView !== step.tab);
  const card = useRef<HTMLElement>(null);
  const original = useRef<ReturnType<typeof captureTutorialUi> | null>(null);
  const [geometry, setGeometry] = useState<{ rects: TourRect[]; width: number; height: number; cardHeight: number; paused: boolean }>({ rects: [], width: 390, height: 844, cardHeight: 310, paused: false });

  useLayoutEffect(() => {
    if (!step || blocked) return;
    if (!original.current) original.current = captureTutorialUi();
    useTutorialStore.setState({ pending: false });
    prepareTutorialStep(step);
    openPanel(window.matchMedia("(max-width: 760px)").matches ? step.panel ?? null : null);
    const media = window.matchMedia("(max-width: 760px)");
    const resizePanel = () => openPanel(media.matches ? step.panel ?? null : null);
    media.addEventListener("change", resizePanel);
    return () => media.removeEventListener("change", resizePanel);
  }, [step, blocked, openPanel]);

  useEffect(() => {
    if (active || !original.current) return;
    restoreTutorialUi(original.current); original.current = null;
    openPanel(null);
  }, [active, openPanel]);
  useEffect(() => () => {
    if (original.current) restoreTutorialUi(original.current);
  }, []);

  useLayoutEffect(() => {
    if (!step || blocked) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      const paused = Boolean(document.querySelector('[role="dialog"]:not([data-tutorial-dialog])'));
      const nodes = step.targets.map(findTourTarget).filter((node): node is HTMLElement => Boolean(node));
      const rects = nodes.map((node) => clipTourRect(node.getBoundingClientRect(), viewport)).filter((rect): rect is TourRect => Boolean(rect));
      const next = { rects, ...viewport, cardHeight: card.current?.getBoundingClientRect().height ?? 310, paused };
      setGeometry((previous) => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(measure); };
    // Preparation has committed; reveal a closed/offscreen section without changing data.
    const first = step.targets.map(findTourTarget).find(Boolean);
    first?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
    measure();
    const resize = new ResizeObserver(schedule);
    if (card.current) resize.observe(card.current);
    const root = document.querySelector(".studio-layout");
    if (root) resize.observe(root);
    const changes = new MutationObserver(schedule);
    changes.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "class", "inert", "style"] });
    window.addEventListener("resize", schedule);
    document.addEventListener("scroll", schedule, true);
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && !document.querySelector('[role="dialog"]:not([data-tutorial-dialog])')) finishTutorial(false); };
    window.addEventListener("keydown", escape);
    card.current?.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
    return () => { if (frame) cancelAnimationFrame(frame); resize.disconnect(); changes.disconnect(); window.removeEventListener("resize", schedule); document.removeEventListener("scroll", schedule, true); window.removeEventListener("keydown", escape); };
  }, [step, blocked]);

  if (!step || blocked || geometry.paused) return null;
  const count = getTutorialSteps(active!).length;
  const rects = contextChanged ? [] : geometry.rects;
  const position = placeTourCard(rects[0] ?? null, geometry, { width: 365, height: geometry.cardHeight });
  const guest = project && isDiscoveryProject(project);
  return <div className="tutorial-layer">
    <svg className="tutorial-dim" aria-hidden="true" width={geometry.width} height={geometry.height}><defs><mask id={maskId}><rect width="100%" height="100%" fill="white" />{rects.map((rect, item) => <rect key={item} x={rect.left} y={rect.top} width={rect.width} height={rect.height} rx={10} fill="black" />)}</mask></defs><rect width="100%" height="100%" fill="rgba(35,30,26,.28)" mask={`url(#${maskId})`} /></svg>
    {rects.map((rect, item) => <div key={item} aria-hidden="true" className="tutorial-highlight" style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }} />)}
    <section ref={card} className="tutorial-card" role="dialog" data-tutorial-dialog aria-label={step.title} aria-modal="false" style={{ ...position, maxHeight: Math.min(geometry.height - 24, geometry.width < 600 ? geometry.height * .48 : 500) }}>
      <button className="tutorial-close" aria-label="Fermer la visite guidée" onClick={() => finishTutorial(false)}>×</button>
      <p className="tutorial-counter" aria-live="polite">Étape {index + 1} sur {count}</p>
      <progress value={index + 1} max={count} aria-label="Progression de la visite" />
      <h2 tabIndex={-1}>{step.title}</h2><p>{step.description}</p>
      {step.id === "publish" && guest && <p className="tutorial-guest-note">Créez gratuitement un compte pour conserver votre création. En mode découverte, quitter ou actualiser cette page fait perdre le brouillon.</p>}
      {!rects.length && <p className="tutorial-fallback">{contextChanged ? "Vous avez changé d’outil. Vous pouvez continuer à créer ou revenir à cette étape." : "Ce contrôle n’est pas visible dans ce contexte. Vous pouvez continuer la visite et retrouver cette fonction depuis Aide."} <button onClick={() => {
        prepareTutorialStep(step);
        openPanel(window.matchMedia("(max-width: 760px)").matches ? step.panel ?? null : null);
        requestAnimationFrame(() => step.targets.map(findTourTarget).find(Boolean)?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" }));
      }}>Afficher l’outil</button></p>}
      <div className="tutorial-actions"><button disabled={index === 0} onClick={() => moveTutorial(-1)}>Précédent</button><button className="primary" onClick={() => moveTutorial(1)}>{index === count - 1 ? "Terminer" : "Suivant"}</button></div>
      <button className="tutorial-skip" onClick={() => finishTutorial(false)}>Passer le tutoriel</button>
    </section>
  </div>;
}
