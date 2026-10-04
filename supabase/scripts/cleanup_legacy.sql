-- Run after the cutover has been verified (keep the backup!). Removes the MVP tables and the
-- temporary migration helpers. Irreversible.
drop function if exists public.legacy_image_batch(int);
drop function if exists public.legacy_image_attach(uuid, text, text);
drop table if exists public.legacy_image_skips;
drop schema if exists legacy cascade;
