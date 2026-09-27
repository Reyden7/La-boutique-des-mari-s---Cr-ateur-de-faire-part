REVOKE EXECUTE ON FUNCTION public.finalize_project_payment(uuid, uuid, text, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fail_project_payment(uuid, uuid, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refund_project_payment(uuid, uuid, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_project_payment(uuid, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_project_payment(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_project_payment(uuid, uuid, text, text) TO service_role;;
