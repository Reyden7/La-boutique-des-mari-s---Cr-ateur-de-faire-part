import type { SidebarView } from "../../stores/editorStore";

export type TutorialStep = { id: string; title: string; description: string; targets: string[]; tab?: SidebarView; panel?: "tools" | "properties"; select?: "any" | "text"; section?: string };
export const MAIN_TUTORIAL: TutorialStep[] = [
  { id: "welcome", title: "Bienvenue dans votre studio de création", description: "Imaginez un faire-part qui vous ressemble, à partir d’un modèle ou de votre propre design. Cette visite est facultative : vous pouvez la quitter à tout moment.", targets: ["canvas"] },
  { id: "tabs", title: "Tous vos outils sont ici", description: "Arrière-plan, Introduction, Contenu, Musique et Effets : chaque onglet regroupe les outils d’une partie de votre création.", targets: ["creation-tabs"], panel: "tools" },
  { id: "background", title: "Personnalisez votre arrière-plan", description: "Choisissez une couleur, un dégradé ou une image pour le fond du document. Pour ajouter de la matière, les Sections proposent aussi Couleur + texture.", targets: ["background-tab", "properties-panel"], tab: "design", panel: "properties" },
  { id: "introduction", title: "Créez une ouverture mémorable", description: "Accueillez vos invités avec une enveloppe ou des portes personnalisables, une page d’accueil, ou choisissez un accès direct sans introduction.", targets: ["introduction-tab"], tab: "introduction", panel: "tools" },
  { id: "content", title: "Donnez vie à votre faire-part", description: "Ajoutez des textes, images, décorations, Calendrier, Compte à rebours ou Programme. Vous pouvez lire la visite sans ajouter quoi que ce soit.", targets: ["add-element"], tab: "elements", panel: "tools" },
  { id: "edit", title: "Tout est personnalisable", description: "Sélectionnez un élément pour retrouver ses propriétés ici : position, dimensions, police et couleurs. Vous pouvez aussi déplacer et redimensionner directement sur le canvas. Un élément verrouillé doit d’abord être déverrouillé.", targets: ["properties-panel", "canvas"], tab: "elements", panel: "properties", select: "any" },
  { id: "layers", title: "Organisez votre faire-part", description: "Regroupez les éléments en Sections. Les calques règlent leur ordre ; leurs commandes permettent de masquer, verrouiller, dupliquer ou supprimer. La visite ne modifie aucun élément.", targets: ["layers"], tab: "elements", panel: "tools" },
  { id: "devices", title: "Adaptez votre création à chaque écran", description: "Smartphone, Tablette et PC ont chacun leur disposition. Une belle version Smartphone ne garantit pas un PC parfait : vérifiez les trois. Transférer permet de partir de la mise en page Smartphone, puis d’ajuster.", targets: ["device-selector"], panel: undefined },
  { id: "animation", title: "Animez votre création", description: "Choisissez un effet et sa durée. L’apparition initiale joue quand l’élément est visible ; les éléments plus bas se révèlent au scroll. Vérifiez le résultat en Aperçu.", targets: ["property-animation"], tab: "elements", panel: "properties", select: "any", section: "animation" },
  { id: "ambience", title: "Créez une ambiance unique", description: "Musique propose une bibliothèque et vos imports. Effets ajoute notamment des particules. La musique démarre au premier geste de l’invité, conformément aux règles des navigateurs.", targets: ["music-tab", "effects-tab"], tab: "music", panel: "tools" },
  { id: "preview", title: "Découvrez le résultat", description: "Aperçu vous montre le faire-part comme un invité : introductions, animations, textes et formats. Rejouez l’ouverture et vérifiez chaque support avant de partager.", targets: ["preview-button"], panel: undefined },
  { id: "publish", title: "Votre faire-part est prêt !", description: "Enregistrez sur votre compte, puis publiez quand vous êtes satisfait. La publication suit le parcours et les tarifs habituels ; aucun achat n’est déclenché par cette visite.", targets: ["save-button", "publish-button"], panel: undefined },
];

export const MINI_TUTORIALS: Record<string, { title: string; steps: TutorialStep[] }> = {
  text: { title: "Textes et polices", steps: [MAIN_TUTORIAL[4], { id: "text-font", title: "Personnalisez vos textes", description: "Sélectionnez un texte, puis modifiez son contenu, sa police, sa taille et sa couleur. Vous pouvez aussi importer votre propre police.", targets: ["property-police"], tab: "elements", panel: "properties", select: "text", section: "police" }] },
  curve: { title: "Courber un texte", steps: [{ id: "curve", title: "Dessinez un arc avec vos mots", description: "Sur un texte existant, activez Courbure, choisissez le sens puis ajustez l’intensité. Une valeur de zéro conserve un texte droit. La visite ne change pas ces réglages.", targets: ["property-courbure"], tab: "elements", panel: "properties", select: "text", section: "courbure" }] },
  responsive: { title: "Smartphone, Tablette et PC", steps: [MAIN_TUTORIAL[7], MAIN_TUTORIAL[10]] },
  music: { title: "Musique et effets", steps: [MAIN_TUTORIAL[9], { id: "effects", title: "Des effets tout en douceur", description: "Choisissez la forme, les couleurs et la quantité des particules. Un effet discret laisse les informations du faire-part bien lisibles.", targets: ["effects-tab"], tab: "effects", panel: "tools" }] },
};

export const FEATURE_GUIDES = [
  { title: "Textes et polices", description: "Contenu → Texte, puis Police dans les propriétés.", tour: "text" },
  { title: "Courber un texte", description: "Sélectionnez un texte, puis ouvrez Courbure.", tour: "curve" },
  { title: "Importer des images", description: "Contenu → Image : importez un PNG, JPG, WebP ou GIF. Ajustement contrôle son cadrage." },
  { title: "Sections et calques", description: "Contenu → Section pour structurer ; les Calques organisent ordre, visibilité et verrouillage." },
  { title: "Calendrier et agenda", description: "Contenu → Calendrier. Configurez la date et le bouton Ajouter à mon agenda dans ses propriétés." },
  { title: "Compte à rebours", description: "Contenu → Compte à rebours. Choisissez la date du mariage et le style d’affichage." },
  { title: "Programme", description: "Contenu → Programme. Renseignez les horaires, lieux et icônes des étapes." },
  { title: "Formulaire invité", description: "Contenu → Formulaire. Personnalisez les questions ; la collecte suit l’option payante prévue lors de la publication." },
  { title: "Enveloppe et Porte", description: "Introduction → ouverture classique. Choisissez chaque PNG, importez vos designs et ajustez leur position." },
  { title: "Musique et particules", description: "Onglets Musique et Effets pour composer une ambiance.", tour: "music" },
  { title: "Animations", description: "Sélectionnez un élément, puis Animation : effet et durée. Vérifiez son apparition en Aperçu." },
  { title: "Formats responsive", description: "Vérifiez chaque support et ajustez ses dimensions et positions.", tour: "responsive" },
  { title: "Sauvegarde et tarifs", description: "Un compte conserve la création. La publication est payante selon le nombre d’invités et les options choisies, dont le formulaire invité. Consultez le récapitulatif détaillé avant de confirmer le paiement." },
];

export function getTutorialSteps(id: string): TutorialStep[] { return id === "main" ? MAIN_TUTORIAL : MINI_TUTORIALS[id]?.steps ?? []; }
export const isEditorTutorialRoute = (path: string) => /^\/studio\/[^/]+\/?$/.test(path);
