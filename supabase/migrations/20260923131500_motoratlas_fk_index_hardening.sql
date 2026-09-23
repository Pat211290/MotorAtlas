-- Mirrors migration applied to the MotorAtlas Supabase backend.
-- Adds covering indexes for remaining foreign-key columns reported by the database advisor.

create index if not exists idx_work_order_events_actor_user_id
  on public.work_order_events(actor_user_id);

create index if not exists idx_work_order_events_workshop_id
  on public.work_order_events(workshop_id);

create index if not exists idx_work_orders_appointment_id
  on public.work_orders(appointment_id);

create index if not exists idx_workshop_member_invites_invited_by
  on public.workshop_member_invites(invited_by);

create index if not exists idx_workshop_member_invites_invited_user_id
  on public.workshop_member_invites(invited_user_id);
