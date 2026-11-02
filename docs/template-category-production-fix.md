# Correction PGRST204 — production, 2 novembre 2026

Projet vérifié : `saaqgyjqecqbzizacvrp`.

## Cause et correction

`public.templates.invitation_category` était réellement absente. La migration locale existait mais n’était pas enregistrée à distance. L’erreur ne provenait donc pas uniquement du cache PostgREST.

Migration appliquée par la CLI sous sa version exacte : `20261102083049_template_invitation_categories.sql`.

Le lot isolé comprenait les 26 migrations déjà enregistrées et cette seule migration en attente. Le dry-run n’a annoncé que celle-ci. Aucun ancien SQL n’a été rejoué ; `20261102075451_rsvp_included_pricing_v3.sql` a été explicitement exclue et reste non appliquée.

Les dépendances étaient présentes. Les corps des deux RPC remplacées correspondaient aux versions locales attendues avant intervention. La migration ajoute une colonne texte NOT NULL, défaut `wedding`, contrainte `wedding` / `birth`, un index et la transmission de catégorie à l’instanciation/duplication. Elle inclut `NOTIFY pgrst, 'reload schema'`.

## Vérifications obtenues

- Migration présente dans `supabase_migrations.schema_migrations` sous la version `20261102083049`.
- Sept templates avant et après ; sept catégories historiques `wedding`.
- Empreinte de toutes les anciennes colonnes, avant et après : `005fb6fdc25d76d0ec2dc4126c2c3468`. Aucun contenu, miniature, vidéo ou autre ancienne métadonnée modifié.
- RLS active et quatre politiques de templates identiques avant/après.
- API PostgREST, accès anonyme : sélection de `invitation_category` sur les modèles publiés HTTP 200, sept résultats ; filtre des modèles privés HTTP 200, aucun résultat ; filtre `birth` HTTP 200, aucun résultat puisque les sept modèles restent classés Mariage.
- Vérification réelle en transaction, sous rôle `authenticated` et contexte d’un administrateur existant : passage d’un modèle à `birth`, lecture de la valeur enregistrée, instanciation d’un projet `birth` en brouillon/non payé/sans lien public et duplication privée.
- Dans la même transaction, sous rôle anonyme sans identité administrateur : modèle naissance publié accessible par filtre et duplication privée invisible.
- Retour à `wedding` et relecture réussis sous rôle administrateur.
- Transaction de vérification intégralement annulée : aucun nouveau projet ni template persistant, aucun reclassement laissé sur les modèles existants.
- Neuf tests locaux ciblés `template-categories*.test.mjs` réussis sous Node 22.
- Dry-run final du lot isolé : aucune migration restante dans ce lot.

Le clic d’enregistrement dans une session navigateur de production authentifiée n’a pas été rejoué. Le stockage a été testé via SQL avec les droits administrateur et l’exposition du schéma via l’API HTTP publique ; les tests d’affichage navigateur isolés sont documentés dans `template-invitation-categories.md`.

## Périmètre conservé

Aucun changement Stripe, tarif, snapshot publié ou réponse RSVP. Aucun paiement réel, commit ou push. Aucune Edge Function redéployée.

Constat séparé : `publish-template` reste en version déployée 3, sans le nouveau helper de catégorie. Cela n’empêche pas l’enregistrement des catégories depuis `/admin/templates`, qui utilise une mise à jour REST directe. Pour prendre en compte immédiatement la catégorie lors de la publication d’un nouveau modèle depuis l’éditeur, la version locale de cette fonction devra être déployée dans une intervention autorisée distincte.
