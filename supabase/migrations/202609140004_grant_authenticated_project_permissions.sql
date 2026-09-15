-- Le frontend authentifié doit pouvoir travailler sur ses propres projets.
-- Les policies RLS restent responsables de déterminer quelles lignes
-- l'utilisateur est réellement autorisé à lire/modifier.

grant select, insert, update, delete
on table public.projects
to authenticated;


-- L'utilisateur peut consulter ses propres paiements.
-- Les modifications des paiements restent réservées au serveur.
grant select
on table public.project_payments
to authenticated;


-- Aucun accès direct anonyme à ces tables.
-- Les invitations publiques passent par get_public_project().
revoke all
on table public.projects
from anon;

revoke all
on table public.project_payments
from anon;