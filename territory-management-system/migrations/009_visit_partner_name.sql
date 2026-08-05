-- Records which Ministry Partner (partnership name, e.g. "Juan & Maria") logged a given visit.
-- Publisher-submitted visits have no auth.users session to key `created_by` off of (that column
-- stays reserved for admin-logged visits, joined to profiles.full_name) — this is the publisher
-- equivalent, so visit history can show who was last to visit a given contact.
alter table public.territory_record_visits add column partner_name text;
