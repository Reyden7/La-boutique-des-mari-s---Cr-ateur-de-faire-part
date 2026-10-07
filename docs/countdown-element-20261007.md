# Compte à rebours — 7 octobre 2026

## Résultat

Nouvelle tuile « Compte à rebours » dans Contenu > + Ajouter. L’élément utilise les mécanismes communs de sélection, déplacement, redimensionnement, rotation, verrouillage, visibilité par support, Sections, CALQUES, renommage, duplication, suppression, historique et animations. Aucune animation par défaut.

Les paramètres sont regroupés dans les PropertySection existantes : Disposition, Date, Police, Apparence et Animation. FontPicker et ColorAlphaInput sont réutilisés, sans système de polices ou couleurs parallèle. Nombre et libellé ont chacun leur taille et couleur ; le libellé accepte plusieurs lignes. Alignements gauche/centre/droite, dispositions verticale/horizontale, espacement, fond transparent facultatif, bordure, rayon et padding sont disponibles.

## Données

```ts
{
  type: "countdown",
  targetDate: "2027-08-15", // YYYY-MM-DD, jamais le nombre calculé
  label: "jours",
  layout: "vertical", // ou horizontal
  fontFamily: "Cormorant Garamond",
  numberFontSize: 64,
  labelFontSize: 20,
  numberColor: "#000000",
  labelColor: "#000000",
  textAlign: "center",
  gap: 6,
  backgroundColor: "#00000000",
  borderColor: "#00000000",
  borderWidth: 0,
  borderRadius: 0,
  padding: 8,
  opacity: 1,
  animation: { type: "none", duration: 0.8, delay: 0 },
  // Champs communs : id, name/editorName, x/y/width/height,
  // rotation, visible, locked, zIndex, sectionId, responsive...
}
```

La date initiale est aujourd’hui + un an (29 février ramené au 28 février si nécessaire). La géométrie est indépendante par support. Le transfert Smartphone → Tablette/PC adapte géométrie, tailles de police et espacement sans modifier Smartphone ni la date. Les snapshots de templates conservent date et style.

## Calcul et rendu partagés

`getCountdownDays` parse explicitement année/mois/jour, valide la date et compare des jours calendaires normalisés. Aujourd’hui et dates passées donnent 0. La référence de journée est **Europe/Paris**, identique pour les visiteurs dans tous les fuseaux ; ce choix est indiqué dans les paramètres. Les journées de 23 ou 25 heures n’altèrent pas le décompte.

Le hook partagé recalcule au montage, au prochain minuit parisien, ainsi qu’au retour de focus/visibilité/pageshow. Aucun intervalle par seconde et aucune sauvegarde déclenchée par le passage du temps.

Konva et DOM utilisent la même scène de rendu (mesure du texte, retours à la ligne, alignement et dimensions). L’opacité globale reste appliquée une seule fois par le pipeline parent. En cas de boîte trop petite, le contenu est réduit uniformément pour rester lisible sans déformer les caractères.

## Fichiers

Nouveaux fichiers applicatifs :

- `src/utils/countdownDate.ts`
- `src/utils/countdownLayout.ts`
- `src/hooks/useCountdownDay.ts`
- `src/features/elements/CountdownCanvasContent.tsx`
- `src/features/elements/CountdownRenderer.tsx`
- `src/features/elements/CountdownProperties.tsx`

Intégrations modifiées :

- `src/types/editor.ts` : type et tailles transférables.
- `src/features/elements/elementFactories.ts` : valeurs initiales.
- `src/components/sidebar/LeftSidebar.tsx` : tuile Timer.
- `src/components/properties/PropertiesPanel.tsx` : réglages.
- `src/components/editor/EditorCanvas.tsx` : rendu Konva.
- `src/features/elements/RichElementRenderer.tsx` et `src/components/renderer/WeddingRenderer.tsx` : Aperçu/Public.
- `src/utils/editorNames.ts` : nom automatique.
- `src/utils/responsiveTransfer.ts` : adaptation des tailles.
- `src/utils/scheduleLayout.ts` : export de la mesure de texte existante.
- `src/styles.css` : conteneur du renderer.

Tests : `tests/countdown-{date,layout,persistence,renderer}.test.mjs`, fixture locale `tests/countdown.browser.{html,tsx}` et capture `docs/qa/20261007-countdown/editor-public.jpg`.

## Vérifications

- Dates futures/du jour/passées, dates invalides, années bissextiles, années 1–99, changements d’heure et fuseaux différents.
- Planification du prochain minuit : 23/24/25 heures et dernière milliseconde.
- Géométrie, multiligne, boîte très petite, couleurs alpha et absence de double opacité.
- Store réel : ajout, sélection, Section, déplacement de Section, entrée/sortie et réordonnancement, verrouillage, responsive, visibilité, renommage, duplication, suppression, undo/redo.
- Sauvegarde/rechargement local, snapshot et instanciation de template, transfert et personnalisation typographique par support.
- Renderer DOM exécuté réellement, recomptage et échappement HTML du libellé.
- Navigateur : 36 comparaisons Konva/DOM (3 supports × 2 dispositions × 3 alignements × Aperçu/Public), toutes conformes.
- Navigateur : simulation du passage à minuit, 1 → 0 sans reload ; date passée → 0 ; retour date future ; police Lora ; taille 72 ; alpha 50 % ; libellé multiligne ; rechargement JSON ; ajout via la tuile.
- Suite complète : 404 tests réussis.
- `npm run build` réussi. Avertissement Vite préexistant : bundle principal supérieur à 500 kB.

## Limites et périmètre

Validation sur les trois formats logiques dans le navigateur local, pas sur des appareils physiques. Le renderer Public réel a été testé localement, pas sur un faire-part déployé. Les systèmes communs de polices projet/globales sont réutilisés ; aucun upload global de police ni sauvegarde Supabase de test n’a été effectué. Aucun déploiement, changement de secret, écriture Supabase ou paiement.
