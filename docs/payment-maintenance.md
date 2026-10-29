# Maintenance des achats

Configuration serveur Supabase uniquement : `PAYMENTS_MAINTENANCE`.

- Variable absente, vide ou `false` : achats disponibles.
- `true` (ou valeur non vide inattendue) : suspension des nouvelles demandes.
- Aucun paramètre du navigateur ne peut changer cette configuration.

Les fonctions `create-checkout-session` et `create-commerce-checkout` retournent
HTTP 503, `Retry-After: 120`, `Cache-Control: no-store` et le code
`payments_maintenance`, avant tout accès à la base, à Stripe ou aux droits.
Les requêtes OPTIONS restent disponibles. Cela suspend aussi les nouvelles
publications gratuites et les demandes de reprise adressées à ces deux fonctions.

Le webhook Stripe, les consultations publiques et le RSVP ne consultent jamais
cette variable. Une session Stripe déjà créée peut encore être payée et son
webhook doit continuer à être traité. La maintenance n'expire aucune session.

Activation avec une session CLI administrateur autorisée :

```powershell
supabase secrets set PAYMENTS_MAINTENANCE=true --project-ref saaqgyjqecqbzizacvrp
```

Après validation de la base, des fonctions et du frontend :

```powershell
supabase secrets set PAYMENTS_MAINTENANCE=false --project-ref saaqgyjqecqbzizacvrp
```

Ne modifier aucune clé Stripe, aucun secret de signature et aucun réglage JWT
pour utiliser ce dispositif. Vérifier les réponses HTTP réelles après chaque
bascule ; ne pas conclure sur la seule réussite de la commande CLI.

Les tests exécutables de `tests/guest-checkout-webhook.test.mjs` couvrent les deux
fonctions, la configuration inactive par défaut, l'absence d'effets de bord,
le refus d'un contournement dans le body et les confirmations/reprises Stripe
pendant la suspension.
