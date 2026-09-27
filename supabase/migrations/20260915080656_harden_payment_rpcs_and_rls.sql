-- Payment state RPCs must only be callable by the server-side service role.
REVOKE EXECUTE ON FUNCTION public.finalize_project_payment(uuid, uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fail_project_payment(uuid, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refund_project_payment(uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_project_payment(uuid, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_project_payment(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_project_payment(uuid, uuid, text, text) TO service_role;

-- Owner-only policies should apply only to authenticated users, not PUBLIC.
DROP POLICY IF EXISTS "owners can read their projects" ON public.projects;
CREATE POLICY "owners can read their projects" ON public.projects FOR SELECT TO authenticated USING (owner_id = (select auth.uid()));

DROP POLICY IF EXISTS "owners can delete projects" ON public.projects;
CREATE POLICY "owners can delete projects" ON public.projects FOR DELETE TO authenticated USING (owner_id = (select auth.uid()));

DROP POLICY IF EXISTS "owners can update editable project fields" ON public.projects;
CREATE POLICY "owners can update editable project fields" ON public.projects FOR UPDATE TO authenticated USING (owner_id = (select auth.uid())) WITH CHECK (owner_id = (select auth.uid()));

DROP POLICY IF EXISTS "owners can create draft unpaid projects" ON public.projects;
CREATE POLICY "owners can create draft unpaid projects" ON public.projects FOR INSERT TO authenticated WITH CHECK (owner_id = (select auth.uid()) AND status = 'draft'::text AND payment_status = 'unpaid'::text AND public_id IS NULL AND published_at IS NULL);

DROP POLICY IF EXISTS "owners can read project assets" ON public.assets;
CREATE POLICY "owners can read project assets" ON public.assets FOR SELECT TO authenticated USING (owner_id = (select auth.uid()));

DROP POLICY IF EXISTS "owners can create project assets" ON public.assets;
CREATE POLICY "owners can create project assets" ON public.assets FOR INSERT TO authenticated WITH CHECK (owner_id = (select auth.uid()) AND EXISTS (SELECT 1 FROM public.projects WHERE projects.id = assets.project_id AND projects.owner_id = (select auth.uid())));

DROP POLICY IF EXISTS "owners can update project assets" ON public.assets;
CREATE POLICY "owners can update project assets" ON public.assets FOR UPDATE TO authenticated USING (owner_id = (select auth.uid())) WITH CHECK (owner_id = (select auth.uid()));

DROP POLICY IF EXISTS "owners can delete project assets" ON public.assets;
CREATE POLICY "owners can delete project assets" ON public.assets FOR DELETE TO authenticated USING (owner_id = (select auth.uid()));

DROP POLICY IF EXISTS "owners can read their project payments" ON public.project_payments;
CREATE POLICY "owners can read their project payments" ON public.project_payments FOR SELECT TO authenticated USING (owner_id = (select auth.uid()));

-- Cover foreign keys used by ownership and payment lookups.
CREATE INDEX IF NOT EXISTS assets_owner_id_idx ON public.assets(owner_id);
CREATE INDEX IF NOT EXISTS project_payments_project_owner_idx ON public.project_payments(project_id, owner_id);;
