import { ChevronDown, ChevronUp, Heart, Image, ImagePlus, Landmark, LockKeyhole, LockKeyholeOpen, RotateCcw, Shapes, Trash2, Type, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { PREVIEW_DEVICES } from "../../config/previewDevices";
import { makeShapeElement, makeTextElement, useEditorStore } from "../../stores/editorStore";
import type { EditorElement, WelcomeCustomAsset, WelcomePageConfig, WelcomeTransition } from "../../types/editor";
import { WELCOME_ARCHES, WELCOME_BACKGROUNDS } from "./welcomeCatalog";
import { getWelcomeTransforms, resolveWelcomePage } from "./welcomeDefaults";
import { DECORATIVE_HEARTS, makeDecorativeHeartElement } from "../hearts/heartRegistry";
import { isSupabaseConfigured } from "../../lib/supabase";
import { deleteProjectAssetIfUnused, uploadProjectAsset } from "../../services/assetRepository";
import { makeButtonElement } from "../elements/elementFactories";
import { useGlobalAssets } from "../../hooks/useGlobalAssets";
import { PublishGlobalAssetButton } from "../../components/admin/PublishGlobalAssetButton";
import { getImageInitialSize, readImageFileDimensions, type ImageDimensions } from "../../utils/imageLayout";

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => <label className="field"><span>{label}</span>{children}</label>;

export function WelcomePageEditor({ embedded = false }: { embedded?: boolean }) {
  const { project, previewDevice, updateWelcomePage, addElement, selectedElementIds, selectElement, toggleElementLocked, moveLayer, removeElement } = useEditorStore();
  const [shapeMenu, setShapeMenu] = useState(false);
  const [heartMenu, setHeartMenu] = useState(false);
  const [welcomeAssetError, setWelcomeAssetError] = useState("");
  const [uploadingAsset, setUploadingAsset] = useState<"arch" | "background" | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const archFileRef = useRef<HTMLInputElement>(null);
  const backgroundFileRef = useRef<HTMLInputElement>(null);
  const globalArches = useGlobalAssets("welcome_arch");
  const globalBackgrounds = useGlobalAssets("welcome_background");
  if (!project) return null;
  const config = resolveWelcomePage(project.welcomePage);
  const transforms = getWelcomeTransforms(config, previewDevice);
  const update = (changes: Partial<WelcomePageConfig>) => updateWelcomePage({ ...config, ...changes });
  const uploadWelcomeAsset = async (kind: "arch" | "background", file?: File) => {
    if (!file) return;
    const extensionValid = /\.(png|jpe?g|webp)$/i.test(file.name);
    const mimeValid = ["image/png", "image/jpeg", "image/webp"].includes(file.type);
    if (!extensionValid || !mimeValid) { setWelcomeAssetError("Format accepté : PNG, JPG ou WebP."); return; }
    if (file.size <= 0 || file.size > 10 * 1024 * 1024) { setWelcomeAssetError("L’image doit peser 10 Mo maximum."); return; }
    if (!isSupabaseConfigured) { setWelcomeAssetError("Le stockage Supabase doit être configuré pour importer cet asset."); return; }
    setWelcomeAssetError("");
    setUploadingAsset(kind);
    try {
      const uploaded = await uploadProjectAsset(project, file, "image");
      const asset: WelcomeCustomAsset = {
        id: crypto.randomUUID(),
        assetId: uploaded.id,
        name: file.name.replace(/\.[^.]+$/, ""),
        url: uploaded.url,
      };
      if (kind === "arch") update({ customArches: [...(config.customArches ?? []), asset], archId: asset.id, showArch: true });
      else update({ customBackgrounds: [...(config.customBackgrounds ?? []), asset], backgroundId: asset.id, showBackground: true });
    } catch (error) {
      setWelcomeAssetError(error instanceof Error ? error.message : "L’image n’a pas pu être importée.");
    } finally {
      setUploadingAsset(null);
    }
  };
  const removeWelcomeAsset = async (kind: "arch" | "background", asset: WelcomeCustomAsset) => {
    const changes: Partial<WelcomePageConfig> = kind === "arch"
      ? {
          customArches: (config.customArches ?? []).filter((candidate) => candidate.id !== asset.id),
          ...(config.archId === asset.id ? { archId: undefined, showArch: false } : {}),
        }
      : {
          customBackgrounds: (config.customBackgrounds ?? []).filter((candidate) => candidate.id !== asset.id),
          ...(config.backgroundId === asset.id ? { backgroundId: undefined, showBackground: false } : {}),
        };
    update(changes);
    const currentProject = useEditorStore.getState().project;
    if (!asset.assetId || !currentProject) return;
    try {
      await deleteProjectAssetIfUnused(currentProject, asset.assetId, asset.url);
    } catch (error) {
      setWelcomeAssetError(error instanceof Error ? error.message : "Le fichier n’a pas pu être supprimé du stockage.");
    }
  };
  const selectGlobalWelcomeAsset = (kind: "arch" | "background", asset: (typeof globalArches)[number]) => {
    const snapshot: WelcomeCustomAsset = { id: `global-${asset.id}`, globalAssetId: asset.id, name: asset.name, url: asset.url };
    if (kind === "arch") {
      const customArches = (config.customArches ?? []).some((item) => item.globalAssetId === asset.id) ? config.customArches : [...(config.customArches ?? []), snapshot];
      update({ customArches, archId: snapshot.id, showArch: true });
    } else {
      const customBackgrounds = (config.customBackgrounds ?? []).some((item) => item.globalAssetId === asset.id) ? config.customBackgrounds : [...(config.customBackgrounds ?? []), snapshot];
      update({ customBackgrounds, backgroundId: snapshot.id, showBackground: true });
    }
  };
  const updateBackground = (changes: Partial<typeof transforms.background>) => {
    if (previewDevice === "mobile") update({ background: { ...config.background, ...changes } });
    else update({ responsive: { ...config.responsive, [previewDevice]: { ...config.responsive?.[previewDevice], background: { ...config.responsive?.[previewDevice]?.background, ...changes } } } });
  };
  const updateArch = (changes: Partial<typeof transforms.arch>) => {
    if (previewDevice === "mobile") update({ arch: { ...config.arch, ...changes } });
    else update({ responsive: { ...config.responsive, [previewDevice]: { ...config.responsive?.[previewDevice], arch: { ...config.responsive?.[previewDevice]?.arch, ...changes } } } });
  };
  const resetResponsive = () => {
    if (previewDevice === "mobile") return;
    const responsive = { ...config.responsive };
    delete responsive[previewDevice];
    update({ responsive });
  };
  const enterButton = config.elements.find((element) => element.type === "button" && element.welcomeAction === "enter");
  const addEnterButton = () => {
    const button = makeButtonElement();
    addElement({ ...button, name: "Bouton Entrer", label: config.enterLabel || "Entrer", url: "", target: "same", welcomeAction: "enter", x: 70, y: 620, width: 250, borderRadius: 99 } as EditorElement);
  };
  const addDecoration = () => addElement({
    id: crypto.randomUUID(), type: "icon", name: "Décoration", x: 145, y: 360, width: 100, height: 80,
    rotation: 0, opacity: 1, zIndex: Date.now(), visible: true, locked: false,
    icon: "❦", color: "#8a5f58", fontSize: 58, animation: { type: "none", duration: .8, delay: 0 },
  });
  const addImage = async (file?: File) => {
    if (!file) return;
    const allowed = ["image/png", "image/jpeg", "image/webp", "image/gif"];
    if (!allowed.includes(file.type) || file.size > 10 * 1024 * 1024) { window.alert("Choisissez une image PNG, JPG, WebP ou GIF de moins de 10 Mo."); return; }
    let dimensions: ImageDimensions;
    try { dimensions = await readImageFileDimensions(file); }
    catch { window.alert("Les dimensions de cette image n’ont pas pu être lues."); return; }
    const size = getImageInitialSize(dimensions.width, dimensions.height, Math.min(250, PREVIEW_DEVICES.mobile.width * .65), PREVIEW_DEVICES.mobile.height * .45);
    let src = "";
    if (isSupabaseConfigured) {
      try { src = (await uploadProjectAsset(project, file, "image")).url; }
      catch { window.alert("L’image n’a pas pu être envoyée."); return; }
    } else {
      src = await new Promise<string>((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsDataURL(file); });
    }
    const element: EditorElement = {
      id: crypto.randomUUID(), type: "image", name: file.name,
      x: Math.max(20, (PREVIEW_DEVICES.mobile.width - size.width) / 2), y: 180,
      width: size.width, height: size.height, rotation: 0, opacity: 1, zIndex: Date.now(), visible: true,
      locked: false, src, alt: file.name, fit: "contain", animation: { type: "none", duration: .8, delay: 0 },
    };
    addElement(element);
  };

  return <div className="welcome-editor">
    {!embedded && <><div className="panel-kicker">Expérience d’entrée</div><h2>Page d’accueil</h2><p>Un écran indépendant affiché avant le faire-part scrollable.</p></>}
    <section>
      <label className="switch-row"><span><strong><Image size={14} /> Paysage</strong><small>Calque d’arrière-plan</small></span><input type="checkbox" checked={config.showBackground} onChange={(event) => update({ showBackground: event.target.checked })} /></label>
      {config.showBackground && <><h4 className="welcome-library-title">Paysages proposés</h4><div className="welcome-preset-grid">{WELCOME_BACKGROUNDS.map((preset) => <button key={preset.id} className={config.backgroundId === preset.id ? "selected" : ""} title={preset.name} onClick={() => update({ backgroundId: preset.id })}><img loading="lazy" src={preset.thumbnailUrl} alt="" /><span>{preset.name}</span></button>)}</div>
      {globalBackgrounds.length > 0 && <><h4 className="welcome-library-title">Bibliothèque de paysages</h4><div className="welcome-preset-grid">{globalBackgrounds.map((asset) => <button key={asset.id} className={config.backgroundId === `global-${asset.id}` ? "selected" : ""} title={asset.name} onClick={() => selectGlobalWelcomeAsset("background", asset)}><img loading="lazy" src={asset.thumbnailUrl ?? asset.url} alt="" /><span>{asset.name}</span></button>)}</div></>}
      <div className="welcome-library-heading"><h4>Mes paysages</h4><button type="button" disabled={uploadingAsset !== null} onClick={() => backgroundFileRef.current?.click()}><Upload size={12} /> {uploadingAsset === "background" ? "Import…" : "Importer"}</button></div>
      <input ref={backgroundFileRef} type="file" hidden accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" onChange={(event) => { void uploadWelcomeAsset("background", event.target.files?.[0]); event.currentTarget.value = ""; }} />
      {(config.customBackgrounds ?? []).some((asset) => !asset.globalAssetId) && <div className="welcome-preset-grid welcome-custom-grid">{(config.customBackgrounds ?? []).filter((asset) => !asset.globalAssetId).map((asset) => <div className={`welcome-custom-tile ${config.backgroundId === asset.id ? "selected" : ""}`} key={asset.id}><button type="button" title={asset.name} onClick={() => update({ backgroundId: asset.id, showBackground: true })}><img loading="lazy" src={asset.url} alt={asset.name} /><span>{asset.name}</span></button><PublishGlobalAssetButton compact input={asset.assetId ? { sourceAssetId: asset.assetId, type: "welcome_background", name: asset.name } : undefined} /><button type="button" className="welcome-custom-delete" title={`Supprimer ${asset.name}`} aria-label={`Supprimer ${asset.name}`} onClick={() => void removeWelcomeAsset("background", asset)}><Trash2 size={11} /></button></div>)}</div>}
      <div className="field-row"><Field label="Cadrage X"><input type="range" min="0" max="100" value={transforms.background.x} onChange={(e) => updateBackground({ x: Number(e.target.value) })} /></Field><Field label="Cadrage Y"><input type="range" min="0" max="100" value={transforms.background.y} onChange={(e) => updateBackground({ y: Number(e.target.value) })} /></Field></div>
      <Field label={`Zoom · ${transforms.background.scale.toFixed(2)}×`}><input type="range" min="1" max="2" step="0.05" value={transforms.background.scale} onChange={(e) => updateBackground({ scale: Number(e.target.value) })} /></Field></>}
      <div className="field-row"><Field label="Couleur"><input type="color" value={config.fallbackColor} onChange={(e) => update({ fallbackColor: e.target.value })} /></Field><Field label="Dégradé"><input type="color" value={config.fallbackColor2} onChange={(e) => update({ fallbackColor2: e.target.value })} /></Field></div>
    </section>
    <section>
      <label className="switch-row"><span><strong><Landmark size={14} /> Arche</strong><small>Décor au premier plan</small></span><input type="checkbox" checked={config.showArch} onChange={(event) => update({ showArch: event.target.checked })} /></label>
      {config.showArch && <><h4 className="welcome-library-title">Arches proposées</h4><div className="welcome-preset-grid arches">{WELCOME_ARCHES.map((preset) => <button key={preset.id} className={config.archId === preset.id ? "selected" : ""} title={preset.name} onClick={() => update({ archId: preset.id })}><img loading="lazy" src={preset.thumbnailUrl} alt="" /><span>{preset.name}</span></button>)}</div>
      {globalArches.length > 0 && <><h4 className="welcome-library-title">Bibliothèque d’arches</h4><div className="welcome-preset-grid arches">{globalArches.map((asset) => <button key={asset.id} className={config.archId === `global-${asset.id}` ? "selected" : ""} title={asset.name} onClick={() => selectGlobalWelcomeAsset("arch", asset)}><img loading="lazy" src={asset.thumbnailUrl ?? asset.url} alt="" /><span>{asset.name}</span></button>)}</div></>}
      <div className="welcome-library-heading"><h4>Mes arches</h4><button type="button" disabled={uploadingAsset !== null} onClick={() => archFileRef.current?.click()}><Upload size={12} /> {uploadingAsset === "arch" ? "Import…" : "Importer"}</button></div>
      <input ref={archFileRef} type="file" hidden accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" onChange={(event) => { void uploadWelcomeAsset("arch", event.target.files?.[0]); event.currentTarget.value = ""; }} />
      {(config.customArches ?? []).some((asset) => !asset.globalAssetId) && <div className="welcome-preset-grid arches welcome-custom-grid">{(config.customArches ?? []).filter((asset) => !asset.globalAssetId).map((asset) => <div className={`welcome-custom-tile ${config.archId === asset.id ? "selected" : ""}`} key={asset.id}><button type="button" title={asset.name} onClick={() => update({ archId: asset.id, showArch: true })}><img loading="lazy" src={asset.url} alt={asset.name} /><span>{asset.name}</span></button><PublishGlobalAssetButton compact input={asset.assetId ? { sourceAssetId: asset.assetId, type: "welcome_arch", name: asset.name } : undefined} /><button type="button" className="welcome-custom-delete" title={`Supprimer ${asset.name}`} aria-label={`Supprimer ${asset.name}`} onClick={() => void removeWelcomeAsset("arch", asset)}><Trash2 size={11} /></button></div>)}</div>}
      <div className="field-row"><Field label="Position X"><input type="range" min="0" max="100" value={transforms.arch.x} onChange={(e) => updateArch({ x: Number(e.target.value) })} /></Field><Field label="Position Y"><input type="range" min="0" max="100" value={transforms.arch.y} onChange={(e) => updateArch({ y: Number(e.target.value) })} /></Field></div>
      <Field label={`Largeur · ${transforms.arch.width}%`}><input type="range" min="30" max="160" value={transforms.arch.width} onChange={(e) => updateArch({ width: Number(e.target.value) })} /></Field></>}
      {previewDevice !== "mobile" && <button className="welcome-reset" onClick={resetResponsive}><RotateCcw size={13} /> Réinitialiser {PREVIEW_DEVICES[previewDevice].label}</button>}
    </section>
    {welcomeAssetError && <p className="welcome-asset-error" role="alert">{welcomeAssetError}</p>}
    <section className="welcome-content-library">
      <h3>Contenu de la Page d’accueil</h3>
      <div className="welcome-add-grid"><button onClick={() => addElement(makeTextElement())}><Type size={18} /><span>Texte</span></button><button onClick={() => fileRef.current?.click()}><ImagePlus size={18} /><span>Image</span></button><button onClick={() => { setShapeMenu((open) => !open); setHeartMenu(false); }}><Shapes size={18} /><span>Forme</span></button><button onClick={() => { setHeartMenu((open) => !open); setShapeMenu(false); }}><Heart size={18} /><span>Cœurs</span></button><button onClick={addDecoration}><span className="welcome-decoration-glyph">❦</span><span>Décoration</span></button></div>
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(event) => { void addImage(event.target.files?.[0]); event.currentTarget.value = ""; }} />
      {shapeMenu && <div className="shape-picker">{(["rectangle", "rounded-rectangle", "circle", "line"] as const).map((shape) => <button key={shape} onClick={() => { addElement(makeShapeElement(shape)); setShapeMenu(false); }}>{shape === "rounded-rectangle" ? "Arrondi" : shape === "circle" ? "Cercle" : shape === "line" ? "Ligne" : "Rectangle"}</button>)}</div>}
      {heartMenu && <div className="welcome-heart-list">{DECORATIVE_HEARTS.map((heart) => <button key={heart.id} onClick={() => { addElement(makeDecorativeHeartElement(heart.id)); setHeartMenu(false); }}>{heart.label}</button>)}</div>}
      <div className="background-tip"><span>Canvas libre</span><p>Cliquez sur un élément dans l’aperçu pour le déplacer et afficher toutes ses propriétés à droite.</p></div>
      <div className="welcome-layer-list">{config.elements.filter((element) => !(element.type === "button" && element.welcomeAction === "enter")).sort((a, b) => b.zIndex - a.zIndex).map((element) => <div className={`${selectedElementIds.includes(element.id) ? "active" : ""} ${element.locked ? "locked" : ""}`} key={element.id} onClick={(event) => selectElement(element.id, event.ctrlKey || event.metaKey)}><span>{element.name}</span><button style={{ display: "grid" }} className="layer-lock-button" title={element.locked ? "Déverrouiller l’élément" : "Verrouiller l’élément"} aria-label={element.locked ? `Déverrouiller ${element.name}` : `Verrouiller ${element.name}`} onClick={(event) => { event.stopPropagation(); toggleElementLocked(element.id); }}>{element.locked ? <LockKeyhole size={13} /> : <LockKeyholeOpen size={13} />}</button><button onClick={(event) => { event.stopPropagation(); moveLayer(element.id, "forward"); }}><ChevronUp size={12} /></button><button onClick={(event) => { event.stopPropagation(); moveLayer(element.id, "backward"); }}><ChevronDown size={12} /></button><button onClick={(event) => { event.stopPropagation(); removeElement(element.id); }}><Trash2 size={12} /></button></div>)}</div>
    </section>
    <section><h3>Bouton d’entrée</h3>{enterButton ? <button className="welcome-reset" onClick={() => selectElement(enterButton.id)}>Sélectionner et personnaliser le bouton</button> : <button className="secondary-action" onClick={addEnterButton}>Ajouter le bouton Entrer</button>}</section>
    <section>
      <h3>Animation d’entrée</h3>
      <Field label="Transition"><select value={config.transition} onChange={(e) => update({ transition: e.target.value as WelcomeTransition })}><option value="fade">Fondu</option><option value="zoom">Zoom à travers l’arche</option><option value="split">Ouverture latérale</option></select></Field>
      <Field label={`Durée · ${config.transitionDuration.toFixed(1)} s`}><input type="range" min="0.4" max="2.5" step="0.1" value={config.transitionDuration} onChange={(e) => update({ transitionDuration: Number(e.target.value) })} /></Field>
    </section>
  </div>;
}
