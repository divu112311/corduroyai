-- ============================================================================
-- Migration: Session Tracking, Login History & Activity Audit Log
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard)
-- Project → SQL Editor → New Query → Paste this → Click "Run"
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. LOGIN HISTORY
-- Records every login event with auth method and browser info.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists login_history (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  auth_method text        not null default 'unknown',   -- 'email', 'google', 'unknown'
  ip_address  text,                                      -- reserved for server-side use
  user_agent  text,                                      -- browser User-Agent string
  created_at  timestamptz not null default now()
);

-- Indexes
create index if not exists idx_login_history_user_id on login_history(user_id);
create index if not exists idx_login_history_created_at on login_history(created_at desc);

-- Row Level Security
alter table login_history enable row level security;

create policy "Users can view own login history"
  on login_history for select
  using (auth.uid() = user_id);

create policy "Users can insert own login history"
  on login_history for insert
  with check (auth.uid() = user_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. USER SESSIONS (Active Devices)
-- Tracks each browser/device session with a heartbeat timestamp.
-- The app pings last_active_at every 2 minutes to keep sessions alive.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists user_sessions (
  id             uuid        primary key,                -- generated client-side (crypto.randomUUID)
  user_id        uuid        not null references auth.users(id) on delete cascade,
  device_info    text,                                    -- full User-Agent string
  browser        text,                                    -- parsed: 'Chrome', 'Firefox', etc.
  os             text,                                    -- parsed: 'Windows', 'macOS', etc.
  last_active_at timestamptz not null default now(),
  created_at     timestamptz not null default now()
);

-- Indexes
create index if not exists idx_user_sessions_user_id on user_sessions(user_id);
create index if not exists idx_user_sessions_last_active on user_sessions(last_active_at desc);

-- Row Level Security
alter table user_sessions enable row level security;

create policy "Users can view own sessions"
  on user_sessions for select
  using (auth.uid() = user_id);

create policy "Users can insert own sessions"
  on user_sessions for insert
  with check (auth.uid() = user_id);

create policy "Users can update own sessions"
  on user_sessions for update
  using (auth.uid() = user_id);

create policy "Users can delete own sessions"
  on user_sessions for delete
  using (auth.uid() = user_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. ACTIVITY LOG (Audit Trail)
-- Records user actions: login, logout, signup, password_changed,
-- settings_updated, classification_started, etc.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists activity_log (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users(id) on delete cascade,
  action     text        not null,        -- e.g. 'login', 'logout', 'settings_updated'
  details    jsonb,                        -- optional structured data about the action
  created_at timestamptz not null default now()
);

-- Indexes
create index if not exists idx_activity_log_user_id on activity_log(user_id);
create index if not exists idx_activity_log_action on activity_log(action);
create index if not exists idx_activity_log_created_at on activity_log(created_at desc);

-- Row Level Security
alter table activity_log enable row level security;

create policy "Users can view own activity log"
  on activity_log for select
  using (auth.uid() = user_id);

create policy "Users can insert own activity log"
  on activity_log for insert
  with check (auth.uid() = user_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. (Optional) Auto-cleanup: delete stale sessions older than 30 days
-- You can schedule this as a Supabase cron job under Database → Extensions → pg_cron
-- ─────────────────────────────────────────────────────────────────────────────
-- select cron.schedule(
--   'cleanup-stale-sessions',
--   '0 3 * * *',  -- run daily at 3 AM UTC
--   $$delete from user_sessions where last_active_at < now() - interval '30 days'$$
-- );
