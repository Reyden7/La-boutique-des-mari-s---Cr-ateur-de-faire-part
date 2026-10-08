# Mot de passe oublié — 8 octobre 2026

## Livraison

Parcours ajouté à la carte de connexion existante, sans refonte visuelle : lien discret sous le mot de passe, vue « Mot de passe oublié » dans la même carte, email, envoi et retour connexion sans reload. Nouvelle route publique `/reset-password` avec deux champs, validation, succès et lien de retour.

**Implémentation et tests locaux terminés. Configuration des redirect URLs hébergées et test email réel restent à confirmer. Aucun déploiement Netlify, aucune modification de compte, secret, Site URL, template email ou configuration Stripe.**

## Fichiers

- `src/pages/AuthPage.tsx` : vue de demande et lien, chargement, erreurs neutres, verrou synchrone anti-double clic.
- `src/pages/ResetPasswordPage.tsx` : nouveau mot de passe, confirmation, succès, lien invalide/expiré.
- `src/components/auth/AuthCard.tsx` : carte visuelle partagée, reprenant le markup existant.
- `src/contexts/AuthContext.tsx` : méthodes Auth partagées et état recovery.
- `src/lib/supabase.ts` : écoute de l'événement SDK au moment de créer le client, avant montage de la page ; erreurs d'initialisation invalident le marqueur UI.
- `src/lib/passwordRecovery.ts` : validation et appels Auth, marqueur UI temporaire.
- `src/App.tsx` : route publique `/reset-password`, non enveloppée dans `ProtectedRoute`.
- `src/styles.css` : styles ciblés du lien, focus clavier et boutons de retour.
- `tests/auth-recovery.test.mjs` : 13 tests.
- `tests/auth-recovery.browser.html` et `.tsx` : fixtures UI locales, sans compte/email/requête Supabase réelle.
- `docs/qa/20261008-auth-recovery/forgot-mobile.png` : capture du rendu local isolé sur Smartphone.
- Ce rapport.

## Supabase Auth

Envoi natif via le client partagé :

```ts
supabase.auth.resetPasswordForEmail(email.trim(), {
  redirectTo: `${window.location.origin}/reset-password`,
});
```

Modification après action explicite :

```ts
supabase.auth.updateUser({ password: newPassword });
```

Le client conserve `detectSessionInUrl: true` et son flow existant. Le SDK traite le lien et ses tokens ; aucun parsing artisanal de tokens, aucun token maison, aucune Edge Function ni table supplémentaire. Voir la [référence Supabase](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail).

Le handler écoute `PASSWORD_RECOVERY` dès la création du client pour ne pas manquer l'événement si la page React monte après l'initialisation. L'état recovery utilise un marqueur UI par onglet contenant uniquement ID utilisateur, date de connexion et expiration (maximum une heure, limitée à l'expiration initiale de la session). Ce marqueur n'est **ni un token ni une autorisation serveur**. Il permet le rafraîchissement de la page ; il n'est jamais créé à partir d'un paramètre URL.

Point important vérifié dans le SDK installé : il peut réémettre `SIGNED_IN` lors de la restauration/focus d'une session existante. Cet événement ne doit donc pas effacer systématiquement le flow recovery. Le même utilisateur/la même connexion conservent le marqueur ; une nouvelle connexion explicite, un autre compte, une déconnexion ou l'expiration l'effacent.

Avant `updateUser`, le helper contrôle le marqueur et la session, puis appelle `getUser` pour une vérification serveur. Une session normale sans récupération ne permet pas de modifier un mot de passe depuis cette page. Après succès : suppression du marqueur et déconnexion locale pour proposer une véritable nouvelle connexion, sans révoquer les autres appareils.

## Validation et messages

- Email non vide et format raisonnable : « Veuillez saisir une adresse email valide. »
- Envoi réussi, compte connu ou inconnu : « Si un compte existe avec cette adresse, un email de réinitialisation vient d’être envoyé. »
- Erreur technique d'envoi : message générique, jamais de détail Supabase à l'écran.
- Mot de passe : au moins **6 caractères**, comme l'inscription existante ; confirmation identique obligatoire.
- Champs : labels réels, `current-password` à la connexion et `new-password` sur les deux champs de reset.
- Route sans récupération, lien invalide/expiré ou session révoquée : « Ce lien de réinitialisation est invalide ou a expiré. » puis « Demander un nouveau lien », ouvrant directement la vue de demande.
- Succès : « Votre mot de passe a bien été modifié. » puis « Se connecter ».
- Aucune modification silencieuse pour un utilisateur déjà connecté ; aucun appel update à l'ouverture de la page.

Les mots de passe restent uniquement en mémoire des champs pendant la saisie et sont transmis directement à Supabase Auth. Ils ne sont stockés dans aucune table, aucun local/session storage, aucun log, aucun helper backend personnalisé. Les logs nouveaux n'impriment que le nom d'opération et un code d'erreur technique, jamais le payload.

## Redirect URLs — point restant

Le dashboard du projet `saaqgyjqecqbzizacvrp` redirige vers la connexion Supabase ; aucun outil connecté ne permet ici de lire/modifier cette configuration Auth. **Les redirect URLs hébergées n'ont donc pas pu être confirmées.** Le Site URL n'a pas été modifié.

Dans [Supabase → Authentication → URL Configuration](https://supabase.com/dashboard/project/saaqgyjqecqbzizacvrp/auth/url-configuration), vérifier/autoriser les URLs exactes nécessaires :

- `https://www.laboutiquedesmaries.fr/reset-password`
- `https://laboutiquedesmaries.fr/reset-password` si le site reste accessible sur cette origine
- `http://127.0.0.1:5173/reset-password` : origine effectivement utilisée pour les tests Vite de ce rapport
- `http://localhost:5173/reset-password` si utilisé en développement

Ne pas remplacer le Site URL ni supprimer les redirections existantes. Le paramètre `redirectTo` doit être couvert par l'allowlist ; voir [la documentation officielle](https://supabase.com/docs/guides/auth/redirect-urls). Si un template email custom existe, vérifier qu'il utilise bien le lien natif de confirmation/redirection attendu ; aucun template n'a été modifié ici.

## Tests

**437 tests de régression passent**, dont 13 nouveaux tests Auth ; aucun échec ni test ignoré. Les fixtures SQL de la suite sont locales et n'écrivent pas en production.

Tests Auth avec Supabase simulé : email valide/invalide, trim et URL production/localhost/127.0.0.1, même succès pour email inconnu, erreurs techniques neutres, règle 6 caractères/confirmation, absence de récupération sur une connexion normale/anonyme, recovery et refresh, réémission `SIGNED_IN` du même flow, expiration, changement de compte, storage indisponible/corrompu, vérification serveur avant update, session révoquée, succès, marqueur effacé, déconnexion locale et échec de déconnexion ne donnant pas un faux échec de reset.

Tests navigateur locaux sur les vrais composants avec fixtures en mémoire : lien, vue dans la même carte, email invalide sans requête, double clic donnant une seule demande simulée et bouton « Envoi... » désactivé, message neutre, retour connexion, lien invalide et nouvelle demande, minimum de longueur, confirmation différente, réussite simulée et lien de connexion. Aucun email ni mot de passe réel n'est utilisé.

La vraie route `/reset-password` locale a aussi été ouverte puis rafraîchie sans session : elle reste accessible et affiche correctement le message d'invalidité. Le rendu a été contrôlé sur PC, Smartphone 390 × 844 et Tablette 768 × 1024 ; aucun débordement horizontal observé.

**Non réalisés** : réception effective d'un email, ouverture d'un lien natif émis par le projet hébergé, reset d'un compte réel/de test Supabase, connexion avec le nouveau mot de passe et refus de l'ancien, parcours sur le frontend de production (non déployé). À vérifier avec un compte de test après confirmation des redirect URLs. Le titulaire du compte doit saisir et valider lui-même le nouveau mot de passe.

`npm run build` : réussi (TypeScript + Vite). Warning existant sur les chunks > 500 kB, non bloquant. Aucun nouveau package.
