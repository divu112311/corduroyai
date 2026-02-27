# Corduroy AI — Current State Audit

**Audit Date:** 2026-02-27
**Branch:** `claude/audit-supabase-state-qm68p`
**Scope:** Supabase schema, RLS policies, and API-to-table interactions across the full stack (frontend React/TypeScript, Node.js server, Python FastAPI backend, and Supabase Edge Functions).

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Supabase Configuration](#supabase-configuration)
3. [Database Schema](#database-schema)
   - [auth.users (Supabase Managed)](#authusers-supabase-managed)
   - [user_metadata](#user_metadata)
   - [classification_runs](#classification_runs)
   - [user_products](#user_products)
   - [user_product_classification_results](#user_product_classification_results)
   - [user_product_classification_history](#user_product_classification_history)
   - [bulk_classification_runs](#bulk_classification_runs)
   - [bulk_classification_items](#bulk_classification_items)
   - [login_history](#login_history)
   - [user_sessions](#user_sessions)
   - [activity_log](#activity_log)
   - [hts_us_8](#hts_us_8)
4. [Database Triggers & Functions](#database-triggers--functions)
5. [Row Level Security Policies](#row-level-security-policies)
6. [Supabase Edge Functions](#supabase-edge-functions)
7. [API Routes & Table Interactions](#api-routes--table-interactions)
   - [Frontend Client (src/lib/)](#frontend-client-srclib)
   - [Python FastAPI Backend](#python-fastapi-backend)
   - [Node.js Server](#nodejs-server)
8. [Authentication Flow](#authentication-flow)
9. [External Service Integrations](#external-service-integrations)
10. [Environment Variables](#environment-variables)
11. [Known Notes & Gaps](#known-notes--gaps)

---

## Architecture Overview

```
┌─────────────────────┐       ┌─────────────────────────────┐
│   React Frontend    │──────▶│   Supabase (DB + Auth +     │
│   (Vite/TypeScript) │◀──────│   Edge Functions)           │
└─────────────────────┘       └──────────────┬──────────────┘
                                              │ Edge Function
                                              │ "python-dev"
                                              ▼
                               ┌─────────────────────────────┐
                               │  Python FastAPI Backend     │
                               │  (Cloud Run / Docker)       │
                               │  - /classify                │
                               │  - /bulk-classify           │
                               │  - /bulk-classify/{run_id}  │
                               └──────────────┬──────────────┘
                                              │
                          ┌───────────────────┼───────────────────┐
                          ▼                   ▼                   ▼
                    OpenAI API          Pinecone DB          Supabase DB
                    (embeddings         (vector              (hts_us_8
                     + GPT-4o)          search)              table)
```

**Key design decisions observed:**
- The frontend communicates with Supabase directly (using the anon key + RLS) for all database reads/writes.
- All AI classification requests go through the Supabase Edge Function `python-dev`, which proxies to the Python backend.
- The Python backend uses the **service role key** to bypass RLS when reading the `hts_us_8` reference table.
- Bulk classification state is currently stored **in-memory** (`BULK_RUNS` dict) in the Python backend, NOT in Supabase, despite the `bulk_classification_runs` and `bulk_classification_items` tables existing in the schema (those tables were created in a migration but are not yet wired up to the backend).

---

## Supabase Configuration

### Client Instances

| Location | File | Key Used | Purpose |
|---|---|---|---|
| Frontend | `src/lib/supabase.ts` | `VITE_SUPABASE_ANON_KEY` | All user-facing DB operations; PKCE auth flow |
| Node.js Server | `server/src/config/supabase.ts` | `SUPABASE_ANON_KEY` (user) + `SUPABASE_SERVICE_ROLE_KEY` (admin) | Server-side operations |
| Python Backend | `backend/tradeai/app/services/supabase.py` | `SUPABASE_SERVICE_ROLE_KEY` | Read `hts_us_8` table (bypasses RLS) |

### Auth Configuration (Frontend)
```typescript
createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    flowType: 'pkce',          // PKCE flow for OAuth
    detectSessionInUrl: true,
    autoRefreshToken: true,
    persistSession: true,
  },
});
```

---

## Database Schema

### auth.users (Supabase Managed)

Supabase's built-in auth table. Not directly queried by application code — referenced via `auth.uid()` in RLS policies and as a foreign key target.

**Referenced columns:** `id` (uuid), `email`, `app_metadata.provider`, `user_metadata`

---

### user_metadata

Stores extended profile information for each authenticated user. Appears to be auto-created via a database trigger on `auth.users` insert (mentioned in code comments; trigger SQL not found in migrations directory).

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `user_id` | uuid | PK, FK → auth.users(id) | |
| `email` | text | nullable | |
| `company_name` | text | nullable | |
| `profile_info` | jsonb | nullable | Contains `first_name`, `last_name`, `has_completed_onboarding` |
| `confidence_threshold` | numeric | default 0.8 | Per-user threshold for exception flagging |
| `auto_approve_single` | boolean | NOT NULL, default false | Added in `20260220_auto_approve_settings.sql` |
| `auto_approve_bulk` | boolean | NOT NULL, default false | Added in `20260220_auto_approve_settings.sql` |
| `created_at` | timestamptz | | |
| `last_login_at` | timestamptz | nullable | |

**RLS:** Not defined in migrations (likely relies on trigger-based creation and user_id match). Read/write via frontend using anon key.

---

### classification_runs

Tracks individual classification sessions (single or bulk). Created by the frontend client.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | integer/bigint | PK (serial, inferred from code returning `data.id` as number) | |
| `user_id` | uuid | NOT NULL, FK → auth.users(id) | |
| `status` | text | CHECK: `in_progress`, `completed`, `cancelled` | |
| `run_type` | text | CHECK: `single`, `bulk` | |
| `conversations` | jsonb | array of `ClarificationMessage` objects | |
| `created_at` | timestamptz | | |
| `completed_at` | timestamptz | nullable | Set when status → completed |

> **Note:** This table's full DDL is not in the migrations directory — it was created outside of the tracked migrations. Schema is inferred from `src/lib/classificationService.ts`.

---

### user_products

Stores product records submitted by users for classification.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | integer/bigint | PK (serial, inferred) | |
| `user_id` | uuid | NOT NULL, FK → auth.users(id) | |
| `classification_run_id` | integer | FK → classification_runs(id) | |
| `product_name` | text | | |
| `product_description` | text | nullable | |
| `country_of_origin` | text | nullable | |
| `materials` | jsonb | nullable | Can be string, array, or object |
| `unit_cost` | numeric | nullable | |
| `vendor` | text | nullable | |
| `sku` | text | nullable | |
| `updated_at` | timestamptz | | |

> **Note:** Full DDL not in tracked migrations. Schema inferred from `src/lib/classificationService.ts` and `src/lib/dashboardService.ts`.

---

### user_product_classification_results

Stores the AI classification output for each product. Core table for the application's classification workflow.

**Original columns** (inferred from code — base migration not tracked):

| Column | Type | Notes |
|---|---|---|
| `id` | integer/bigint | PK |
| `product_id` | integer | FK → user_products(id) |
| `classification_run_id` | integer | FK → classification_runs(id) |
| `hts_classification` | text | Primary HTS code result |
| `alternate_classification` | varchar | Single alternate HTS (original, now superseded by jsonb column) |
| `tariff_rate` | numeric | |
| `tariff_amount` | numeric | |
| `total_cost` | numeric | |
| `unit_cost` | numeric | |
| `confidence` | numeric | 0.0–1.0 |
| `model_version` | text | |
| `classified_at` | timestamptz | |

**Added in `20250217_add_bulk_classification_support.sql`:**

| Column | Type | Default | Notes |
|---|---|---|---|
| `alternate_classifications` | jsonb | `[]` | Replaces `alternate_classification` varchar |
| `reasoning` | text | | |
| `cbp_rulings` | jsonb | `[]` | |
| `hts_description` | text | | |
| `bulk_item_id` | uuid | nullable | FK → bulk_classification_items(id) ON DELETE SET NULL |

**Added in `20260220_classification_extended_fields.sql`:**

| Column | Type | Notes |
|---|---|---|
| `description` | text | HTS description text |
| `reasoning` | text | (duplicate — also added in prior migration; `IF NOT EXISTS` guards against errors) |
| `chapter_code` | text | |
| `chapter_title` | text | |
| `section_code` | text | |
| `section_title` | text | |
| `cbp_rulings` | jsonb | (duplicate — also added in prior migration) |
| `rule_verification` | jsonb | Rule engine output; contains `status`, `checks_passed`, `checks_failed`, `missing_info`, `reasoning`, `gri_applied` |
| `rule_confidence` | numeric | Confidence from rule engine |
| `similarity_score` | numeric | Raw Pinecone vector similarity score |
| `classification_trace` | text | Debug trace of classification steps |
| `alternate_classifications` | jsonb | (duplicate — also added in prior migration) |

---

### user_product_classification_history

Tracks approval/rejection decisions for classification results.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | integer/bigint | PK | |
| `product_id` | integer | FK → user_products(id) | |
| `classification_result_id` | integer | FK → user_product_classification_results(id) | |
| `approved` | boolean | | |
| `approved_at` | timestamptz | nullable | Set when approved = true |
| `approval_reason` | text | nullable | Added in `20260220_auto_approve_settings.sql` |

> **Note:** Full DDL not in tracked migrations. Schema inferred from `src/lib/classificationService.ts` and `src/lib/dashboardService.ts`.

---

### bulk_classification_runs

Created in `20250217_add_bulk_classification_support.sql`. Intended to track bulk upload sessions in Supabase, but **currently not wired up** — the Python backend uses in-memory storage (`BULK_RUNS` dict) instead.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | uuid | PK, default gen_random_uuid() | |
| `user_id` | uuid | NOT NULL, FK → auth.users(id) ON DELETE CASCADE | |
| `file_name` | text | NOT NULL | |
| `file_type` | text | NOT NULL, CHECK: `csv`, `xlsx`, `pdf` | |
| `file_url` | text | nullable | |
| `total_items` | integer | NOT NULL | |
| `status` | text | NOT NULL, default `pending`, CHECK: `pending`, `processing`, `completed`, `failed`, `cancelled` | |
| `progress_current` | integer | NOT NULL, default 0 | |
| `progress_total` | integer | NOT NULL | |
| `error_message` | text | nullable | |
| `results_summary` | jsonb | default `{"completed": 0, "exceptions": 0, "errors": 0}` | |
| `created_at` | timestamptz | NOT NULL, default now() | |
| `updated_at` | timestamptz | NOT NULL, default now() | Auto-updated via trigger |
| `completed_at` | timestamptz | nullable | |

**Indexes:**
- `idx_bulk_runs_user_id` on `(user_id)`
- `idx_bulk_runs_status` on `(status)`
- `idx_bulk_runs_created_at` on `(created_at DESC)`

---

### bulk_classification_items

Created in `20250217_add_bulk_classification_support.sql`. Tracks individual products within a bulk run. Also **currently not wired up** to the Python backend.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | uuid | PK, default gen_random_uuid() | |
| `run_id` | uuid | NOT NULL, FK → bulk_classification_runs(id) ON DELETE CASCADE | |
| `row_number` | integer | NOT NULL | |
| `extracted_data` | jsonb | NOT NULL, default `{}` | Raw product data extracted from file |
| `status` | text | NOT NULL, default `pending`, CHECK: `pending`, `processing`, `completed`, `exception`, `error` | |
| `classification_result_id` | uuid | nullable, FK → user_product_classification_results(id) ON DELETE SET NULL | |
| `error` | text | nullable | |
| `clarification_questions` | jsonb | nullable | |
| `clarification_answers` | jsonb | nullable | |
| `created_at` | timestamptz | NOT NULL, default now() | |
| `updated_at` | timestamptz | NOT NULL, default now() | Auto-updated via trigger |

**Constraints:**
- `UNIQUE(run_id, row_number)` — one row per run

**Indexes:**
- `idx_bulk_items_run_id` on `(run_id)`
- `idx_bulk_items_status` on `(status)`
- `idx_bulk_items_result_id` on `(classification_result_id)`
- `idx_bulk_items_created_at` on `(created_at DESC)`

---

### login_history

Created in `20260219_session_tracking.sql`. Records every login event.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | uuid | PK, default gen_random_uuid() | |
| `user_id` | uuid | NOT NULL, FK → auth.users(id) ON DELETE CASCADE | |
| `auth_method` | text | NOT NULL, default `unknown` | Values: `email`, `google`, `unknown` |
| `ip_address` | text | nullable | Reserved for server-side use; currently not set |
| `user_agent` | text | nullable | Browser User-Agent string |
| `created_at` | timestamptz | NOT NULL, default now() | |

**Indexes:**
- `idx_login_history_user_id` on `(user_id)`
- `idx_login_history_created_at` on `(created_at DESC)`

---

### user_sessions

Created in `20260219_session_tracking.sql`. Tracks active browser/device sessions with a heartbeat mechanism.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | uuid | PK | Generated client-side via `crypto.randomUUID()`, stored in `sessionStorage` |
| `user_id` | uuid | NOT NULL, FK → auth.users(id) ON DELETE CASCADE | |
| `device_info` | text | nullable | Full User-Agent string |
| `browser` | text | nullable | Parsed: `Chrome`, `Firefox`, `Microsoft Edge`, `Safari` |
| `os` | text | nullable | Parsed: `Windows`, `macOS`, `Linux`, `Android`, `iOS` |
| `last_active_at` | timestamptz | NOT NULL, default now() | Updated every 2 minutes via heartbeat |
| `created_at` | timestamptz | NOT NULL, default now() | |

**Indexes:**
- `idx_user_sessions_user_id` on `(user_id)`
- `idx_user_sessions_last_active` on `(last_active_at DESC)`

---

### activity_log

Created in `20260219_session_tracking.sql`. Audit trail for user actions.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | uuid | PK, default gen_random_uuid() | |
| `user_id` | uuid | NOT NULL, FK → auth.users(id) ON DELETE CASCADE | |
| `action` | text | NOT NULL | See valid actions below |
| `details` | jsonb | nullable | Optional structured data about the action |
| `created_at` | timestamptz | NOT NULL, default now() | |

**Valid `action` values** (defined in `src/lib/activityLogger.ts`):
`login`, `logout`, `signup`, `password_changed`, `settings_updated`, `classification_started`, `classification_completed`, `product_added`, `product_approved`, `product_rejected`, `bulk_upload_started`, `session_revoked`

**Indexes:**
- `idx_activity_log_user_id` on `(user_id)`
- `idx_activity_log_action` on `(action)`
- `idx_activity_log_created_at` on `(created_at DESC)`

---

### hts_us_8

Reference table containing US HTS (Harmonized Tariff Schedule) codes at the 8-digit level. Queried exclusively by the Python backend using the service role key.

| Column | Type | Notes |
|---|---|---|
| `hts8` | text | 8-digit HTS code (used as lookup key) |
| `description` | text | HTS code description |

> **Note:** Full DDL not present in tracked migrations — likely loaded via data import script. No RLS policies observed (bypassed by service role key in Python backend).

---

## Database Triggers & Functions

### `update_updated_at_column()`
Defined in `20250217_add_bulk_classification_support.sql`.

```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

Applied to:
- `bulk_classification_runs` — trigger `update_bulk_runs_updated_at` (BEFORE UPDATE)
- `bulk_classification_items` — trigger `update_bulk_items_updated_at` (BEFORE UPDATE)

### Implied Trigger (Not in tracked migrations)
Code comments in `src/lib/userService.ts` mention:
> "Check if user_metadata already exists (should exist due to trigger, but just in case)"

This implies a trigger on `auth.users` INSERT that auto-creates a `user_metadata` row. The trigger SQL is not present in the `supabase/migrations/` directory.

---

## Row Level Security Policies

### Tables with RLS Enabled

#### `bulk_classification_runs`
| Policy Name | Operation | Expression |
|---|---|---|
| `Users can view own bulk runs` | SELECT | `user_id = auth.uid()` |
| `Users can insert bulk runs` | INSERT | `user_id = auth.uid()` |
| `Users can update own bulk runs` | UPDATE | `user_id = auth.uid()` (USING and WITH CHECK) |

#### `bulk_classification_items`
| Policy Name | Operation | Expression |
|---|---|---|
| `Users can view bulk items` | SELECT | EXISTS (SELECT 1 FROM bulk_classification_runs WHERE id = run_id AND user_id = auth.uid()) |
| `Users can insert bulk items` | INSERT | EXISTS (SELECT 1 FROM bulk_classification_runs WHERE id = run_id AND user_id = auth.uid()) |
| `Users can update bulk items` | UPDATE | EXISTS (SELECT 1 FROM bulk_classification_runs WHERE id = run_id AND user_id = auth.uid()) |

#### `login_history`
| Policy Name | Operation | Expression |
|---|---|---|
| `Users can view own login history` | SELECT | `auth.uid() = user_id` |
| `Users can insert own login history` | INSERT | `auth.uid() = user_id` |

#### `user_sessions`
| Policy Name | Operation | Expression |
|---|---|---|
| `Users can view own sessions` | SELECT | `auth.uid() = user_id` |
| `Users can insert own sessions` | INSERT | `auth.uid() = user_id` |
| `Users can update own sessions` | UPDATE | `auth.uid() = user_id` |
| `Users can delete own sessions` | DELETE | `auth.uid() = user_id` |

#### `activity_log`
| Policy Name | Operation | Expression |
|---|---|---|
| `Users can view own activity log` | SELECT | `auth.uid() = user_id` |
| `Users can insert own activity log` | INSERT | `auth.uid() = user_id` |

### Tables Presumed to Have RLS (Not in Tracked Migrations)
The following tables have user-scoped data accessed via the frontend anon key, implying RLS is active, but their policies are not in the tracked migrations directory:
- `user_metadata` — filtered by `user_id = auth.uid()`
- `classification_runs` — filtered by `user_id = auth.uid()`
- `user_products` — filtered by `user_id = auth.uid()`
- `user_product_classification_results` — indirectly scoped via `product_id` join
- `user_product_classification_history` — indirectly scoped via `classification_result_id`

---

## Supabase Edge Functions

### `python-dev` (deployed as `python-proxy`)

**File:** `supabase/edge-function-python-proxy.ts`

This is the sole edge function. It acts as an authenticated proxy between the frontend and the Python FastAPI backend.

**Environment variables required:**
| Variable | Purpose |
|---|---|
| `PY_BASE_URL` | Base URL of the Python backend (e.g., Cloud Run URL) |
| `PY_BACKEND_TOKEN` | Bearer token for authenticating to the Python backend |
| `PY_PROXY_ALLOW_ORIGIN` | CORS allowed origin (default: `*`) |
| `PY_PROXY_ALLOW_HEADERS` | CORS allowed headers |

**Action → Backend Route Mapping:**

| `action` value | HTTP Method | Python Backend Path |
|---|---|---|
| `classify` | POST | `/classify` |
| `bulk-classify` | POST | `/bulk-classify` |
| `bulk-classify-status` | GET | `/bulk-classify/{run_id}` |
| `bulk-classify-clarify` | POST | `/bulk-classify/{run_id}/clarify` |
| `bulk-classify-cancel` | DELETE | `/bulk-classify/{run_id}` |
| `preprocess` (legacy) | POST | `/preprocess` |
| `parse` (legacy) | POST | `/parse` |
| `rules` (legacy) | POST | `/apply_rules` |
| `rulings` (legacy) | POST | `/generate_ruling` |

**Content handling:**
- JSON body: forwards body minus `action` and `run_id` fields
- Multipart/form-data (file upload): strips `action` field, forwards remaining form data

---

## API Routes & Table Interactions

### Frontend Client (src/lib/)

#### `src/lib/userService.ts`

| Function | Table | Operation | Columns |
|---|---|---|---|
| `getUserMetadata(userId)` | `user_metadata` | SELECT | `*` |
| `updateUserMetadata(userId, updates)` | `user_metadata` | UPDATE | `company_name`, `profile_info`, `confidence_threshold`, `auto_approve_single`, `auto_approve_bulk` |
| `updateLastLogin(userId)` | `user_metadata` | UPDATE | `last_login_at` |
| `createOrUpdateUserMetadata(userId, email, company)` | `user_metadata` | INSERT or UPDATE | `user_id`, `email`, `company_name` |

#### `src/lib/sessionService.ts`

| Function | Table | Operation | Notes |
|---|---|---|---|
| `recordLogin(userId, authMethod)` | `login_history` | INSERT | `user_id`, `auth_method`, `user_agent` |
| `getLoginHistory(userId, limit)` | `login_history` | SELECT | Ordered by `created_at DESC`, limit 20 |
| `upsertSession(userId)` | `user_sessions` | UPSERT | On conflict `id`; sets `id`, `user_id`, `device_info`, `browser`, `os`, `last_active_at` |
| `heartbeat(userId)` | `user_sessions` | UPDATE | `last_active_at`; filtered by `id` and `user_id` |
| `getActiveSessions(userId)` | `user_sessions` | SELECT | `*`, ordered by `last_active_at DESC` |
| `revokeSession(sessionId)` | `user_sessions` | DELETE | By `id` |
| `revokeAllOtherSessions(userId)` | `user_sessions` | DELETE | Where `user_id = userId AND id != currentId` |
| `removeCurrentSession()` | `user_sessions` | DELETE | By `id` from sessionStorage |

#### `src/lib/activityLogger.ts`

| Function | Table | Operation | Notes |
|---|---|---|---|
| `logActivity(userId, action, details)` | `activity_log` | INSERT | `user_id`, `action`, `details` |
| `getActivityLog(userId, limit)` | `activity_log` | SELECT | `*`, ordered by `created_at DESC`, limit 50 |

#### `src/lib/classificationService.ts`

| Function | Table | Operation | Notes |
|---|---|---|---|
| `createClassificationRun(userId, runType)` | `classification_runs` | INSERT | Returns `id` |
| `addClarificationMessage(runId, message)` | `classification_runs` | SELECT + UPDATE | Reads then appends to `conversations` jsonb array |
| `updateClassificationRunStatus(runId, status)` | `classification_runs` | UPDATE | Sets `status` and optionally `completed_at` |
| `saveProduct(userId, runId, productData)` | `user_products` | INSERT | Returns `id` |
| `saveClassificationResult(productId, runId, resultData)` | `user_product_classification_results` | INSERT | Returns `id`; stores all extended fields |
| `saveClassificationApproval(productId, resultId, approved, reason)` | `user_product_classification_history` | SELECT + INSERT or UPDATE | Upserts approval record |
| `getClassificationRun(runId)` | `classification_runs` | SELECT | `*` |

#### `src/lib/dashboardService.ts`

| Function | Tables Queried | Operations | Notes |
|---|---|---|---|
| `getExceptions(userId)` | `user_products`, `user_product_classification_results`, `user_product_classification_history` | 3× SELECT | Parallel queries; filters by confidence < threshold OR null; excludes approved results |
| `getRecentActivity(userId)` | `classification_runs`, `user_product_classification_results`, `user_products`, `user_product_classification_history` | 4× SELECT | Latest 3 completed runs; parallel queries |
| `getDashboardStats(userId)` | `user_metadata`, `classification_runs`, `user_products`, `user_product_classification_history`, `user_product_classification_results` | 5+ SELECT | Parallel queries for counts and averages |
| `getProductProfiles(userId)` | `user_products`, `user_product_classification_history`, `user_product_classification_results` | 3× SELECT | Returns only approved products; deduplicates by latest result per product |

#### `src/lib/supabaseFunctions.ts`

All functions in this file call `supabase.functions.invoke('python-dev', ...)` — they do not directly query database tables.

| Function | Edge Function Action | Backend Route |
|---|---|---|
| `classifyProduct(desc, userId, threshold, clarificationCtx?)` | `classify` | `POST /classify` |
| `startBulkClassification(file, userId, threshold)` | `bulk-classify` | `POST /bulk-classify` |
| `getBulkClassificationStatus(runId)` | `bulk-classify-status` | `GET /bulk-classify/{run_id}` |
| `clarifyBulkItem(runId, itemId, answers)` | `bulk-classify-clarify` | `POST /bulk-classify/{run_id}/clarify` |
| `cancelBulkClassification(runId)` | `bulk-classify-cancel` | `DELETE /bulk-classify/{run_id}` |
| `generateRuling(...)` | — | Returns null (deprecated/stub) |
| `preprocessProduct(...)` | — | Returns null (deprecated) |
| `parseProduct(...)` | — | Returns null (deprecated) |
| `applyRules(...)` | — | Returns null (deprecated) |

---

### Python FastAPI Backend

**File:** `backend/tradeai/app/main.py`

#### `POST /classify`

**Input:** `ClassifyRequest` — `product_description`, `user_id`, `confidence_threshold`, `is_clarification`, `original_query`, `clarification_response`

**Pipeline:**
1. `preprocess()` or `preprocess_clarification()` — LLM call via OpenRouter/OpenAI
2. `parse()` — LLM call to extract structured product attributes
3. `apply_rules()` — Embeds query with OpenAI `text-embedding-3-small`, queries Pinecone `hts-embeddings` namespace (top 10), optionally fetches HTS descriptions from Supabase `hts_us_8`
4. `generate_ruling()` — Rule engine verification + parallel CBP rulings fetch + GPT-4o rationale generation

**Supabase interaction:** `fetch_hts_rows(ids)` — SELECT from `hts_us_8` (`hts8`, `description`) using service role key

**Output types:** `answer`, `clarify`, `exception`, `error`

#### `POST /bulk-classify`

**Input:** Multipart form — `file` (CSV/XLSX/PDF), `user_id`, `confidence_threshold`

**Process:**
1. Parses file with `parse_file()`
2. Extracts structured product data with `extract_all_products()`
3. Creates run state in **in-memory `BULK_RUNS` dict** (NOT Supabase)
4. Spawns background thread with `process_bulk_run()`

**Supabase interaction:** None directly (state stored in-memory)

**Output:** `{ run_id, status, total_items, file_metadata }`

#### `GET /bulk-classify/{run_id}`

**Process:** Reads from in-memory `BULK_RUNS` dict.

**Supabase interaction:** None

**Output:** Full run state including all items

#### `POST /bulk-classify/{run_id}/clarify`

**Input:** `ClarifyRequest` — `item_id`, `answers`

**Process:** Re-runs classification for a single item using `preprocess_clarification()` → `parse()` → `apply_rules()` → `generate_ruling()`.

**Supabase interaction:** None directly (updates in-memory state)

#### `DELETE /bulk-classify/{run_id}`

**Process:** Sets `run["status"] = "cancelled"` in-memory.

**Supabase interaction:** None

---

### Node.js Server

**Location:** `server/src/config/supabase.ts`

The Node.js server has two Supabase clients configured (anon + service role), but no server route files were found in the `server/` directory beyond the config. This appears to be scaffolding for future server-side functionality or an unused layer.

---

## Authentication Flow

```
User action → Supabase Auth → onAuthStateChange callback → loadUserData()
```

**Sign In (email/password):**
1. `supabase.auth.signInWithPassword({ email, password })`
2. On success: `loadUserData(user)` →
   - `getUserMetadata(userId)` — SELECT from `user_metadata`
   - `createOrUpdateUserMetadata()` if no record exists
   - `updateLastLogin(userId)` — UPDATE `user_metadata.last_login_at`
   - `recordLogin(userId, 'email')` — INSERT into `login_history`
   - `upsertSession(userId)` — UPSERT into `user_sessions`
   - `logActivity(userId, 'login', { auth_method })` — INSERT into `activity_log`

**Sign In (Google OAuth):**
1. `supabase.auth.signInWithOAuth({ provider: 'google' })` — PKCE flow
2. Redirected back to app with `?code=...`
3. `supabase.auth.exchangeCodeForSession(code)`
4. `SIGNED_IN` event fires → `loadUserData(user)` (same as above)

**Sign Up:**
1. `supabase.auth.signUp(...)` (in `SignUpForm.tsx`)
2. `createOrUpdateUserMetadata()` — INSERT into `user_metadata`
3. `loadUserData()`
4. `logActivity(userId, 'signup', ...)` — INSERT into `activity_log`

**Sign Out:**
1. `logActivity(userId, 'logout')` — INSERT into `activity_log`
2. `removeCurrentSession()` — DELETE from `user_sessions`
3. `supabase.auth.signOut()`

**Session Management:**
- Heartbeat fires every 2 minutes: UPDATE `user_sessions.last_active_at`
- Idle timeout: 15 minutes inactivity → auto-logout (with 2-minute warning)
- Session ID: generated client-side via `crypto.randomUUID()`, stored in `sessionStorage`

**Password Reset:**
1. User requests reset → `supabase.auth.resetPasswordForEmail()`
2. Email link includes `type=recovery` in URL hash
3. App detects hash on load → shows `NewPasswordForm`
4. `supabase.auth.updateUser({ password })` — triggers `USER_UPDATED` event

---

## External Service Integrations

| Service | Purpose | Used By |
|---|---|---|
| **OpenAI** | Text embeddings (`text-embedding-3-small`), classification rationale (`gpt-4o`) | Python backend |
| **Pinecone** | Vector similarity search for HTS codes (`hts-embeddings` namespace, `hts-embeddings-wsprb2o.svc.aped-4627-b74a.pinecone.io`) | Python backend |
| **Google Cloud Storage** | HTS metadata lookup file (`corduroyai` bucket, `hts_metadata_lookup.json`) | Python backend (load_metadata_lookup, currently commented out in `rulings.py`) |
| **CBP (Customs and Border Protection)** | Ruling search API — fetches real CBP ruling letters | Python backend (`cbp_rulings.py`) |
| **Sentry** | Error monitoring and user identification | Frontend (`src/lib/sentry.ts`) |

---

## Environment Variables

### Frontend (`.env` / Vite)
| Variable | Required | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | Yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Public anon key |
| `VITE_SITE_URL` | No | Deployed URL for OAuth redirects; falls back to `window.location.origin` |
| `VITE_OPENROUTER_API_KEY` | No | Listed in `.env.example` but not observed in codebase |
| `VITE_SENTRY_DSN` | No | Sentry error tracking |

### Python Backend (`backend/.env`)
| Variable | Required | Notes |
|---|---|---|
| `OPENAI_API_KEY` | Yes | GPT-4o and embeddings |
| `PINECONE_API_KEY` | Yes | Vector search |
| `SUPABASE_URL` | Yes | For `hts_us_8` lookups |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Bypasses RLS for `hts_us_8` reads |
| `PINECONE_HOST` | No | Hardcoded in `embeddings.py` |

### Supabase Edge Function (`python-dev`)
| Variable | Required | Notes |
|---|---|---|
| `PY_BASE_URL` | Yes | Python backend base URL |
| `PY_BACKEND_TOKEN` | No | Bearer token for backend auth |
| `PY_PROXY_ALLOW_ORIGIN` | No | CORS origin, default `*` |
| `PY_PROXY_ALLOW_HEADERS` | No | CORS headers |

### Node.js Server (`server/.env`)
| Variable | Required | Notes |
|---|---|---|
| `SUPABASE_URL` | Yes | |
| `SUPABASE_ANON_KEY` | Yes | |
| `SUPABASE_SERVICE_ROLE_KEY` | No | For admin operations |

---

## Known Notes & Gaps

### 1. Bulk Classification State Not Persisted to Supabase
The `bulk_classification_runs` and `bulk_classification_items` tables exist in the schema and have full RLS policies, but the Python backend (`bulk_orchestrator.py`) uses an in-memory `BULK_RUNS` dictionary. This means:
- Bulk run data is lost on server restart
- Bulk runs cannot be listed in a user's history via Supabase queries
- The frontend `BulkClassificationRun` TypeScript interface matches the Supabase schema but the data source is the Python backend memory

### 2. Several Base Migrations Are Missing
The following tables are used heavily throughout the codebase but their DDL is not in the `supabase/migrations/` directory:
- `user_metadata`
- `classification_runs`
- `user_products`
- `user_product_classification_results`
- `user_product_classification_history`

Their schemas are reconstructed above from application code. Initial creation was likely done manually via the Supabase dashboard SQL editor.

### 3. Duplicate Column Additions
The `20260220_classification_extended_fields.sql` migration uses `IF NOT EXISTS` guards, but many columns it adds (`reasoning`, `cbp_rulings`, `alternate_classifications`) were already added in `20250217_add_bulk_classification_support.sql`. No data corruption occurs due to the guards, but it indicates the migrations are not strictly sequential.

### 4. `ip_address` Column Not Populated
The `login_history.ip_address` column is defined but the frontend sets it to `null` (comment: "reserved for server-side use"). No server-side mechanism currently captures this.

### 5. Auto-Approval Logic Not Fully Implemented
`user_metadata.auto_approve_single` and `auto_approve_bulk` columns exist and are readable/writable from the Settings page, but the auto-approval enforcement logic based on these flags is not visible in the reviewed code paths.

### 6. `hts_us_8` Has No RLS
This table is accessed only via the Python backend using the service role key, which bypasses RLS. There are no SELECT policies on this table, meaning any service-role query can read all rows.

### 7. Legacy Edge Function Actions Are Stubs
The `preprocess`, `parse`, `rules`, and `rulings` actions in the edge function map to individual Python endpoints, but the corresponding frontend functions (`preprocessProduct`, `parseProduct`, `applyRules`, `generateRuling`) are all deprecated stubs that return `null`. The current flow uses only `classify` and `bulk-classify*`.

### 8. GCS Metadata Lookup Is Commented Out
`rulings.py` has a `load_metadata_lookup()` function that loads HTS metadata from a GCS bucket (`corduroyai`), but its usage is commented out. The `chapter_code`, `chapter_title`, `section_code`, and `section_title` fields in the DB are populated via other means or may be empty.
