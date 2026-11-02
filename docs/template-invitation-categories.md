# Templates Mariage / Naissance — validation locale

## Fonctionnement

La fenêtre de choix existante conserve ses cartes, miniatures et vidéos. Deux onglets accessibles au clavier, Mariage et Naissance, filtrent les modèles sans rechargement. Mariage est sélectionné à chaque nouvelle ouverture. La catégorie choisie est conservée lors d’un aperçu et de son retour.

La création vierge reste la première carte des deux galeries. Une création naissance ouvre une page vide nommée « Mon faire-part de naissance » dans le même éditeur. La création mariage conserve son point de départ existant. Le formulaire RSVP reste désactivé par défaut, sans condition tarifaire ni droit supplémentaire.

La catégorie d’invitation est distincte du style visuel existant :

- Métadonnée SQL du template : `invitation_category`, valeurs `wedding` / `birth`, défaut `wedding`.
- Métadonnée frontend : `invitationCategory`.
- Projet nouvellement créé : `project_data.invitationCategory`.
- Le champ historique `category` est conservé pour les styles comme Floral ou Romantique.

Les templates historiques sans métadonnée appartiennent à Mariage. Aucun classement ne dépend du nom du modèle. Les anciens projets sans champ continuent à être lus comme mariage sans injecter un nouveau champ dans leur contenu publié.

L’administration peut changer la catégorie, y compris lors d’une publication ou republication depuis un projet source. Cette opération ne modifie ni le contenu, ni la version, ni les miniatures/vidéos du modèle. Les nouveaux projets héritent de la métadonnée du template, qui prime sur une éventuelle ancienne valeur présente dans son JSON. La catégorie survit à la sauvegarde, au rechargement et à la conversion d’un brouillon invité après inscription.

Les fonctions de suppression, publication, dépublication, aperçu et gestion des vidéos restent en place. Le filtrage public garde `is_published=true` et les politiques RLS existantes. Une catégorie vide conserve la création vierge et affiche le message prévu.

## Migration et Edge Function

Migration créée localement : `20261102083049_template_invitation_categories.sql`.

Elle ajoute la colonne avec contrainte et index, adapte l’instanciation pour transmettre la catégorie et conserve celle-ci lors d’une duplication admin. Elle ne réécrit aucun `template_data`, aucun projet existant et aucun snapshot payé. Les fonctions remplacées gardent leurs contrôles d’authentification/admin et leurs permissions ; aucune politique RLS n’est modifiée.

Edge Function concernée : `publish-template`, avec le helper `_shared/invitationCategory.ts`. La catégorie est validée côté serveur et enregistrée avec le passage final du modèle à l’état publié, après la copie des assets. Les anciennes requêtes de republication sans catégorie explicite conservent la catégorie déjà enregistrée.

Après accord, appliquer uniquement les migrations explicitement approuvées dans l’ordre, puis déployer `publish-template` et enfin le frontend du site existant. Le nouveau champ d’administration nécessite la migration avant son utilisation. Aucun déploiement n’a été effectué pour cette intervention.

## Validation

- Suite complète sous Node 22.23.4 : 581 tests réussis, aucun échec ni test ignoré.
- Build TypeScript/Vite réussi ; avertissement préexistant sur la taille du bundle.
- `git diff --check` propre.
- Tests SQL sur PostgreSQL embarqué PGlite : migration additive, anciennes données intactes, classification historique, changement de catégorie, duplication, héritage côté serveur, suppression des droits payants à l’instanciation, refus des templates privés et permissions admin/propriétaire/visiteur.
- Tests frontend/services/Edge : filtrage par métadonnée, historique par défaut, transmission et validation de la catégorie, modifications limitées aux métadonnées, sauvegarde/rechargement et conversion invité après inscription.
- Navigateur isolé avec Supabase simulé : Mariage par défaut, bascule Naissance, clavier, modèles privés masqués, aperçu puis retour en Naissance, ouverture du même éditeur en découverte avec avertissement, modification admin et déplacement du modèle, état vide avec création vierge, projet vierge naissance portant la catégorie `birth`.
- Responsive contrôlé à 390×844, 768×1024 et 1440×900 : fenêtre visible et absence de débordement horizontal.

Ces vérifications n’appliquent aucune migration à la base hébergée. Stripe, la tarification, les versions payantes, les tokens familiaux et les réponses RSVP n’ont pas été modifiés. Aucun paiement réel, commit ou push.

## Fichiers modifiés ou ajoutés

- `src/features/discovery/persistGuestDraft.ts`
- `src/features/templates/TemplatePublishModal.tsx`
- `src/pages/AdminTemplatesPage.tsx`
- `src/pages/HomePage.tsx`
- `src/services/templateRepository.ts`
- `src/templates/templates.ts`
- `src/types/editor.ts`
- `src/types/templates.ts`
- `src/utils/storage.ts`
- `src/utils/templateSnapshot.ts`
- `supabase/functions/publish-template/index.ts`
- `tests/discovery.browser.tsx`
- `tests/discovery.mock.tsx`
- `tests/discovery.test.mjs`
- `docs/template-invitation-categories.md`
- `src/features/templates/TemplateChooser.tsx`
- `src/features/templates/invitationCategory.ts`
- `src/features/templates/templateChooser.css`
- `supabase/functions/_shared/invitationCategory.ts`
- `supabase/migrations/20261102083049_template_invitation_categories.sql`
- `tests/template-categories-edge.test.mjs`
- `tests/template-categories-repository.test.mjs`
- `tests/template-categories-sql.test.mjs`
- `tests/template-categories.test.mjs`
