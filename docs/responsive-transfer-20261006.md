# Transfert semi-automatique Smartphone → Tablette / PC

Implémentation locale du 6 octobre 2026. Aucun déploiement, paiement, modification de secret ou écriture de projet distant.

## Utilisation

Le bouton compact **Transférer**, à gauche des trois formats, ouvre **Adapter depuis Smartphone**. Tablette et PC sont cochés par défaut et peuvent être choisis séparément. Aucune cible : action désactivée. Le support sélectionné dans l’éditeur ne change jamais la source du transfert.

Un avertissement précède le remplacement des layouts présentant des différences effectives : géométrie, typographie, visibilité, ordre, appartenance, bordures, recadrage ou styles générés. Les simples overrides identiques matérialisés par la normalisation ne suffisent pas à déclencher l’avertissement. Le store refuse aussi un remplacement non confirmé, indépendamment du contrôle UI.

Une notification confirme les cibles réellement transférées. L’opération complète produit une seule entrée Undo/Redo et conserve la sélection et le support actif.

## Calcul / données

- Dimensions logiques existantes : Smartphone 390, Tablette 768, PC 1440 px.
- Facteur uniforme : largeur cible / 390, soit environ 1,969 et 3,692.
- X, Y, largeur et hauteur adaptés depuis Smartphone, sans modifier les champs de référence. Largeur plafonnée au canvas ; réduction proportionnelle des images trop larges ; X recalé dans le canvas et Y non négatif.
- Textes : police plafonnée à 128 px. Programme : heures 64, titres 72, descriptions 48, icônes 128. Boutons et texte scratch : 48. Formulaire : titre 96, labels 32, champs 36. Espacements internes Programme / Formulaire limités à un facteur 3.
- Visibilité, `sectionId`, z-index, rotation, dernière Section et silhouettes décoratives copiés depuis Smartphone. Aucun contenu, URL, orientation, calendrier/date, animation, musique, particule ou droit commercial remplacé.
- Les styles visuels sans ancien override dédié utilisent `responsive[target].visualStyle` : tailles d’icônes, padding, traits, radius, offsets scratch, indicateur et cadre. Un résolveur commun, idempotent, alimente Konva, les renderers DOM et les propriétés. Les corrections manuelles de ces valeurs restent sur la cible.
- Programme : ses trois polices / gap réutilisent les overrides existants ; les icônes et espaces internes suivent la même logique de rendu partagée.
- Calendrier : la scène possède déjà son propre fit uniforme ; ses polices ne sont donc pas multipliées deux fois. Des plafonds visuels limitent les extrêmes.
- Image : crop / flip Smartphone recopiés sur la cible, rotation / ratio préservés, cadre et bandes décoratives adaptés sans remplacer l’asset.
- Formulaire : géométrie dans `rsvp.responsive[target]`, `formTypography` et `formSpacingScale` indépendants. Le minimum de contenu reste mesuré par le renderer commun et protège les champs / bouton.
- Hauteur du document dérivée des éléments, Sections et du formulaire après transfert, via les helpers existants ; aucun nouveau `documentHeight` persistant.
- Si l’introduction Page d’accueil est active, ses éléments libres sont également transférés et recalés dans son viewport fixe. Paysage, arche et leurs réglages restent inchangés. Cette base peut demander des retouches, notamment dans la Page d’accueil où le ratio du viewport diffère.
- Les projets existants sans nouvelles propriétés gardent leur rendu. La sérialisation et les snapshots templates conservent les overrides.

## Tests

**293 tests locaux réussis**, dont **11 nouveaux tests** de transfert :

- Tous les types actuels : Texte, Image, Forme, Cœur, décoration, Carrousel, Lieu, Programme, Scratch, Bouton, Section, Calendrier et RSVP.
- Smartphone et données non responsive inchangés ; seules les cibles demandées changent.
- Visibilité / hiérarchie / z-index / rotation / crop / flip conservés ; bordures, padding et indicateur adaptés.
- Confirmation effective, refus du store sans confirmation, cibles invalides / vides sans action.
- Clamp, ratios, polices plafonnées, absence de double scale du calendrier et des renderers.
- Undo / Redo atomicité ; sauvegarde / relecture via le stockage local réel ; instanciation depuis snapshot template.
- Corrections manuelles de géométrie / style / cadre indépendantes ; droits commerciaux existants conservés.

**Banc navigateur local**, sans `EditorPage` / autosave distante :

- Popover, deux cibles cochées, aucun choix → bouton désactivé.
- Transfert Tablette seul : PC conserve le titre 320 px / 38 px. Transfert PC seul : Tablette conserve sa largeur initiale.
- Confirmation affichée, annulation sans modification et remplacement explicitement confirmé.
- Un transfert = une action annulable ; Undo revient aux 320 px initiaux, Redo rétablit l’adaptation.
- Modification de l’icône Programme sur Tablette : 51 px ; Smartphone reste 22 px.
- Sauvegarde locale / relecture conserve le layout PC.
- Aperçu Tablette : titre 74,8308 px, titre formulaire 66,9538 px, Programme horizontal sur deux colonnes.
- Renderer Public local PC : titre 128 px, titre formulaire 96 px, même Programme horizontal. Aucun bouton de transfert dans Aperçu / Public.
- Console navigateur : aucune erreur observée.
- Écran étroit 375 px : popover bornée de X=71 à X=363, toutes les commandes accessibles. Override de viewport restauré après test.

Les mesures de police DOM sont ramenées aux pixels logiques à partir de `clientWidth`, sans confondre la mise à l’échelle visuelle du cadre Preview avec le layout sauvegardé.

Captures : `docs/qa/20261006-responsive-transfer/tablette-editor.jpg`, `confirmation.jpg`, `preview-pc.jpg`, `small-screen-popover.jpg`.

La sauvegarde Supabase et un vrai faire-part déjà publié n’ont pas été modifiés ou testés par écriture : validation de la sérialisation locale et du même renderer Public uniquement.

## Vérifications finales

- `npm run build` : succès (TypeScript + Vite).
- Avertissement Vite habituel : bundle principal supérieur à 500 kB ; aucun échec de compilation.
- `git diff --check` : aucun défaut de whitespace.

## Fichiers

Nouveaux :

- `src/components/editor/ResponsiveTransferButton.tsx`
- `src/utils/responsiveTransfer.ts`
- `src/utils/responsiveVisualStyle.ts`
- `tests/responsive-transfer.test.mjs`
- `tests/responsive-transfer.fixture.ts`
- `tests/responsive-transfer.browser.html`
- `tests/responsive-transfer.browser.tsx`

Modifiés :

- `src/types/editor.ts`
- `src/stores/editorStore.ts`
- `src/components/editor/PreviewDeviceSwitcher.tsx`
- `src/components/editor/EditorCanvas.tsx`
- `src/components/properties/PropertiesPanel.tsx`
- `src/components/renderer/WeddingRenderer.tsx`
- `src/features/elements/RichElementRenderer.tsx`
- `src/features/rsvp/RsvpFormEditor.tsx`
- `src/features/rsvp/RsvpFormRenderer.tsx`
- `src/features/rsvp/useRsvpBlockLayout.tsx`
- `src/utils/responsiveLayout.ts`
- `src/utils/documentLayout.ts`
- `src/utils/sectionLayout.ts`
- `src/utils/scheduleLayout.ts`
- `src/styles.css`

Documentation et captures locales ajoutées dans `docs/`.
