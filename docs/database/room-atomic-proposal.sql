-- REVIEW COPY. Registered staging-only in 20261027033306_atomic_manual_room_writes.sql; no production execution authorized.
-- HYG-205 records approval, migration registration and rollout status.
-- Service-only RPCs are invoker functions. No grants or RLS policies on application tables change.
-- Only manual room actions change. No triggers, account/profile cascade or provisioning changes.
BEGIN;

CREATE OR REPLACE FUNCTION public.room_create_atomic(
  _actor_id uuid, _name text, _description text, _visibility text
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE _room_id uuid;
BEGIN
  IF _actor_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _actor_id) THEN
    RAISE EXCEPTION 'A signed-in profile is required' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(btrim(_name), '') IS NULL OR _visibility IS NULL OR _visibility NOT IN ('public', 'private') THEN
    RAISE EXCEPTION 'Invalid room name or visibility' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.rooms(name, description, visibility, scope_id, creator_id)
  VALUES (left(btrim(_name), 120), NULLIF(left(btrim(_description), 500), ''), _visibility, NULL, _actor_id)
  RETURNING id INTO _room_id;
  INSERT INTO public.room_members(room_id, profile_id, is_admin)
  VALUES (_room_id, _actor_id, true);
  RETURN _room_id;
END;
$$;
REVOKE ALL ON FUNCTION public.room_create_atomic(uuid,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.room_create_atomic(uuid,text,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.room_set_member_admin_atomic(
  _actor_id uuid, _room_id uuid, _target_id uuid, _is_admin boolean
) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  PERFORM id FROM public.rooms WHERE id = _room_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Room not found' USING ERRCODE = 'P0002'; END IF;
  -- This check runs after obtaining the parent lock, not against an earlier application snapshot.
  IF _actor_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.room_members WHERE room_id = _room_id AND profile_id = _actor_id AND is_admin
  ) THEN
    RAISE EXCEPTION 'Room admin access required' USING ERRCODE = '42501';
  END IF;
  IF _is_admin IS NULL THEN RAISE EXCEPTION 'Admin status is required' USING ERRCODE = '22023'; END IF;
  IF NOT _is_admin AND EXISTS (SELECT 1 FROM public.room_members WHERE room_id = _room_id AND profile_id = _target_id AND is_admin)
     AND NOT EXISTS (SELECT 1 FROM public.room_members WHERE room_id = _room_id AND profile_id <> _target_id AND is_admin) THEN
    RAISE EXCEPTION 'Cannot remove the last room admin' USING ERRCODE = '23514';
  END IF;
  UPDATE public.room_members SET is_admin = _is_admin WHERE room_id = _room_id AND profile_id = _target_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Room member not found' USING ERRCODE = 'P0002'; END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.room_set_member_admin_atomic(uuid,uuid,uuid,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.room_set_member_admin_atomic(uuid,uuid,uuid,boolean) TO service_role;
CREATE OR REPLACE FUNCTION public.room_remove_member_atomic(
  _actor_id uuid, _room_id uuid, _target_id uuid
) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE _actor_admin boolean; _target_admin boolean;
BEGIN
  PERFORM id FROM public.rooms WHERE id = _room_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Room not found' USING ERRCODE = 'P0002'; END IF;
  SELECT is_admin INTO _actor_admin FROM public.room_members WHERE room_id = _room_id AND profile_id = _actor_id;
  IF NOT FOUND OR _actor_id IS NULL OR (_target_id IS DISTINCT FROM _actor_id AND NOT _actor_admin) THEN
    RAISE EXCEPTION 'Room membership or admin access required' USING ERRCODE = '42501';
  END IF;
  SELECT is_admin INTO _target_admin FROM public.room_members WHERE room_id = _room_id AND profile_id = _target_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Room member not found' USING ERRCODE = 'P0002'; END IF;
  IF _target_admin AND NOT EXISTS (
    SELECT 1 FROM public.room_members WHERE room_id = _room_id AND profile_id <> _target_id AND is_admin
  ) THEN RAISE EXCEPTION 'Cannot remove the last room admin' USING ERRCODE = '23514'; END IF;
  DELETE FROM public.room_members WHERE room_id = _room_id AND profile_id = _target_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.room_remove_member_atomic(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.room_remove_member_atomic(uuid,uuid,uuid) TO service_role;
COMMIT;
