-- Sync v2 ("only what changed") — run once in the Supabase SQL editor
-- (project jamnnwzjluserpabsgxk). Safe to re-run.
--
-- Every synced table gets:
--   updated_at  set by the SERVER on every insert/update (trigger), so devices can
--               ask for "rows changed since X" without trusting phone clocks
--   deleted_at  a delete marker: deleted rows stay as tombstones so other devices
--               learn about the delete instead of the row silently vanishing
-- plus an index for the "changed since" query.

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'user_preferences', 'activities', 'logs', 'tags', 'tasks', 'check_ins',
    'journal_prompts', 'journal_entries', 'wellbeing_notes', 'library',
    'notifications', 'daily_drafts', 'daily_message_defaults', 'custom_emotions',
    'reward_milestones', 'milestone_seen'
  ] loop
    execute format('alter table public.%I add column if not exists updated_at timestamptz default now()', t);
    execute format('update public.%I set updated_at = now() where updated_at is null', t);
    execute format('alter table public.%I alter column updated_at set not null', t);
    execute format('alter table public.%I add column if not exists deleted_at timestamptz', t);
    execute format('drop trigger if exists touch_updated_at on public.%I', t);
    execute format('create trigger touch_updated_at before insert or update on public.%I
                    for each row execute function public.touch_updated_at()', t);
    execute format('create index if not exists %I on public.%I (user_id, updated_at)', t || '_user_updated_idx', t);
  end loop;
end $$;

-- Check: every table should list both columns and the trigger.
select c.table_name,
       bool_or(c.column_name = 'updated_at') as has_updated_at,
       bool_or(c.column_name = 'deleted_at') as has_deleted_at,
       exists (select 1 from information_schema.triggers tr
               where tr.event_object_table = c.table_name
                 and tr.trigger_name = 'touch_updated_at') as has_trigger
from information_schema.columns c
where c.table_schema = 'public'
  and c.table_name in ('user_preferences', 'activities', 'logs', 'tags', 'tasks', 'check_ins',
    'journal_prompts', 'journal_entries', 'wellbeing_notes', 'library', 'notifications',
    'daily_drafts', 'daily_message_defaults', 'custom_emotions', 'reward_milestones', 'milestone_seen')
group by c.table_name
order by c.table_name;
