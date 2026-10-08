# Correction du routage Password Recovery — 8 octobre 2026

## Causes identifiées dans le code

1. Le marqueur `PASSWORD_RECOVERY` était déjà enregistré par le client partagé, mais `AuthPage` redirigeait tout utilisateur connecté vers sa destination normale. `ProtectedRoute` acceptait aussi cette session sans distinguer une récupération. Seule la page `/reset-password` consultait le marqueur : une arrivée sur la racine ou la connexion pouvait donc ouvrir le dashboard.
2. Le SDK Auth installé sauvegarde la session puis programme `PASSWORD_RECOVERY` dans un `setTimeout(..., 0)`. Un `getSession()` et l'événement `INITIAL_SESSION` peuvent exposer l'utilisateur avant cette notification. Le provider terminait son chargement trop tôt.

Cela explique deux voies possibles vers le symptôme. L'URL réellement suivie par l'email de production et l'allowlist hébergée n'ont pas pu être inspectées ; elles ne sont pas présentées comme une cause confirmée.

## Correction

- `RecoveryRouteGuard` donne une priorité globale au flow de récupération, avant le montage des pages normales et des pages admin. Une récupération valide est maintenue sur `/reset-password`.
- `AuthPage` et `ProtectedRoute` utilisent également le même helper `getRecoveryRedirect`, pour rester corrects lorsqu'ils sont montés indépendamment.
- `AuthProvider` traite le marqueur avant d'exposer la session et attend l'initialisation Auth plus la notification différée du SDK avant de libérer le chargement. `INITIAL_SESSION` ne peut plus l'interrompre prématurément.
- Le type de callback est capturé avant que Supabase ne nettoie l'URL. Ce renseignement sert uniquement à afficher le chargement, jamais à autoriser le formulaire.
- Le marqueur UI existant reste lié à l'utilisateur, à sa connexion et à une expiration maximale d'une heure. Il survit au rafraîchissement, mais une session normale ne suffit pas. Aucun mot de passe/token n'est ajouté au stockage ou aux logs.
- Le reset reste natif : validation de six caractères et confirmation, vérification `getUser()`, `updateUser({ password })`, déconnexion locale, succès et bouton `Se connecter`.
- `/login` est un alias de la connexion existante `/auth`, sans supprimer cette dernière. Le bouton de succès et la demande d'un nouveau lien utilisent `/login`.

Références vérifiées : [Password recovery](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail), [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls). Changelog officiel consulté : pas de breaking change pertinent au routage de récupération des projets hébergés.

## Fichiers

- `src/components/auth/RecoveryRouteGuard.tsx` (nouveau)
- `src/components/auth/ProtectedRoute.tsx`
- `src/contexts/AuthContext.tsx`
- `src/lib/passwordRecovery.ts`
- `src/lib/supabase.ts`
- `src/pages/AuthPage.tsx`
- `src/pages/ResetPasswordPage.tsx`
- `src/App.tsx`
- `tests/auth-recovery.test.mjs`
- `tests/auth-recovery.browser.tsx`
- Ce rapport et la capture locale `docs/qa/20261008-auth-recovery/recovery-routing-admin.jpg`.

## Vérifications réalisées

- **17 tests Auth réussis** : priorité sur racine/connexion/admin, notification différée, initialisation invalide, session normale refusée, marqueur/refresh, expiration, autre compte, règles de mot de passe, update natif vérifié et déconnexion.
- **Suite locale : 441 tests, 439 réussis, aucun échec, deux ignorés**. Les deux tests SQL optionnels nécessitent `PGLITE_MODULE_PATH` ; aucun ne concerne Auth. Aucune requête SQL en production.
- **Navigateur, fixtures locales** : récupération sur `/auth`, `/` et `/admin/assets` → formulaire sur `/reset-password` ; session normale sur `/reset-password` → lien invalide ; demande d'un nouveau lien → vue dédiée `/login` ; validation simulée → succès → connexion ; connexion normale → dashboard. Aucun email envoyé ni compte réel modifié.
- **Vraie route locale**, ouverture et rafraîchissement sans session → message de lien invalide, jamais dashboard.
- **Build réussi sous Node 22.23.3** (`npm run build`, TypeScript + Vite). Seul warning existant : bundle > 500 kB.

## Vérification hébergée restante

Le dashboard Supabase accessible dans le navigateur demande une connexion. L'allowlist n'a donc pas pu être vérifiée ou changée ici. Confirmer dans [Authentication → URL Configuration](https://supabase.com/dashboard/project/saaqgyjqecqbzizacvrp/auth/url-configuration) :

- `https://www.laboutiquedesmaries.fr/reset-password`
- `https://laboutiquedesmaries.fr/reset-password` si cette origine est utilisée pour demander l'email.

`resetPasswordForEmail` utilise déjà `${window.location.origin}/reset-password`, sans changement de l'envoi email. Ne pas changer le Site URL ni supprimer les Redirect URLs existantes. Après déploiement, demander un nouveau lien avec un compte de test et laisser son titulaire saisir puis valider le nouveau mot de passe.

**Non réalisés :** déploiement, clic d'un email réel, modification d'un mot de passe réel, audit authentifié de l'allowlist. Aucun secret, template email, Site URL, migration, paiement ou réglage de production modifié.
