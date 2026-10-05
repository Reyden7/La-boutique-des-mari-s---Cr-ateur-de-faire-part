# Hauteur du Formulaire et dernière Section — 5 octobre 2026

Modifications locales uniquement : aucun déploiement, aucune migration, aucune modification Stripe/RSVP backend.

## Formulaire

- Champ `Hauteur` ajouté dans `Formulaire invité > Disposition`, avec saisie différée via `DimensionInput` (effacement puis saisie complète avant validation).
- Données : `rsvp.height` pour Smartphone, `rsvp.responsive.tablet.height` et `rsvp.responsive.desktop.height` pour les deux autres supports. Une modification de hauteur ne change ni la largeur ni la hauteur des autres supports.
- Sans hauteur explicite, le calcul automatique historique est conservé.
- Hauteur effective : maximum entre hauteur demandée et minimum nécessaire. Le hook commun `useRsvpBlockLayout` mesure le véritable contenu DOM avec `ResizeObserver`, à la largeur logique du support, après chargement des polices ; il protège également la place requise par le rendu simplifié Konva.
- Cette mesure est uniquement un état UI et n'est jamais sauvegardée dans le projet. Le même hook alimente Editor, propriétés, Preview et Public.
- Espacements et contrôles du formulaire utilisent le même repère logique que sa hauteur, même lorsque le viewport affiché est réduit. Le contenu ne subit plus de masquage `overflow: hidden` au niveau du bloc.
- Reset de disposition : retire également la hauteur personnalisée du support actif, sans retirer l'appartenance à une Section.

## Dernière Section

- Données : `SectionElement.isLastSection` pour Smartphone, overrides `responsive.tablet.isLastSection` et `responsive.desktop.isLastSection` pour les autres supports.
- `setLastSectionForDevice` garantit une seule Section marquée par support et gèle les fallbacks anciens pour empêcher les fuites entre supports.
- Marge finale `LAST_SECTION_BOTTOM_GAP = 0` px : la bande externe de 24 px initialement prévue a été retirée à la demande de l'utilisateur. Sans marqueur visible, comportement historique conservé (`DOCUMENT_BOTTOM_MARGIN = 120` et hauteur minimale du support).
- Le bas est calculé à partir de tout contenu visible, y compris les enfants qui dépassent, le padding de leur Section, les éléments plus bas, le Formulaire et les images tournées. Les anciennes tranches de fond ne forcent pas un vide final : elles sont décoratives et peuvent être tronquées après la dernière partie réelle.
- Une Section marquée mais masquée n'active pas la fin compacte.
- Déplacement/réordre : marqueur conservé. Duplication/coller : marqueur retiré de la copie sur tous les supports. Suppression : retour au comportement standard si aucun marqueur visible ne reste.
- Indication `Dernière` dans la hiérarchie.
- Flags et hauteurs conservés par sérialisation et par les snapshots/instanciations templates côté client ; aucune modification des droits commerciaux. Aucun template réel publié pour ces tests.

## Tests

- Suite complète Node après suppression de la marge résiduelle : **100/100 réussis**, aucun test ignoré, avec PGlite local ; aucun appel de paiement réel. Première exécution bloquée sur une lecture de dépendance React (EPERM), puis relance autorisée réussie.
- 20 tests spécifiques de layout : indépendance des trois supports, minimum, champ désactivé, reset, unicité, Section masquée/supprimée, enfants débordants, contenu plus bas, rotation image, réordre, copie, fonds historiques, Formulaire automatique/positionné, JSON. Les trois nouveaux tests reproduisent les dimensions fractionnaires de la capture (Y 2500, hauteur 650,42505, padding 0) : fin exactement au bas de la Section, Formulaire contenu ou débordant protégé et autres supports inchangés.
- Test supplémentaire du vrai sanitizer/instantiate client : conservation des marqueurs et hauteurs responsive sans droits achetés.
- Banc navigateur local de l'implémentation initiale avec les véritables `PropertiesPanel`, `EditorCanvas` et `WeddingRenderer`, sans autosave distant (les contrôles navigateur ci-dessous précèdent le retrait de la marge de 24 px ; cette correction ciblée a été vérifiée par les tests de layout partagés et le build) :
  - Smartphone : 1 000 px puis réduction sous minimum → 468 px ; Tablette/PC inchangés.
  - Hauteurs indépendantes 500/900/1 200 px : Preview/Public identiques, bouton visible ; document Editor et renderer cohérents.
  - Formulaire de dix champs avec longs labels/options : minima effectifs 1 986 / 2 234 / 2 234 px ; tous les champs et le bouton restent dans le bloc et dans le document.
  - PC dans viewport étroit, Preview et Public : aucun bouton coupé.
  - Section A puis B cochée : seule B reste dernière sur Smartphone ; pas de marqueur ajouté Tablette/PC.
  - Duplication : copie non marquée ; masquage : Formulaire enfant masqué ; suppression de la Section : Formulaire conservé avec parent null.
  - Rechargement JSON : configuration conservée. Console du banc propre lors des contrôles après rechargement. Le banc dispose explicitement sa racine React au HMR pour éviter une double initialisation pendant les modifications de code ; ce correctif ne concerne pas l'application.
- `npm run build` réussi (TypeScript + Vite) ; warning préexistant/non bloquant de chunk JavaScript supérieur à 500 kB.
- Capture locale : `layout-evidence-20261005/form-height.jpg`.

## Fichiers

- `src/types/editor.ts`
- `src/utils/documentLayout.ts`
- `src/utils/responsiveLayout.ts`
- `src/utils/sectionLayout.ts`
- `src/stores/editorStore.ts`
- `src/features/rsvp/useRsvpBlockLayout.tsx` (nouveau)
- `src/features/rsvp/RsvpFormEditor.tsx`
- `src/features/rsvp/RsvpFormRenderer.tsx`
- `src/features/elements/RichElementProperties.tsx`
- `src/components/editor/EditorCanvas.tsx`
- `src/components/renderer/WeddingRenderer.tsx`
- `src/components/sidebar/HierarchyList.tsx`
- `src/styles.css`
- `tests/document-end-layout.test.mjs` (nouveau)
- `tests/document-end-layout.browser.html` et `.tsx` (nouveaux)
- `tests/guest-project-data.test.mjs`
