begin;

create schema if not exists private;

create table private.content_releases (
  release_id text primary key,
  manifest_schema_version integer not null
    check (manifest_schema_version > 0),
  manifest_hash text not null unique
    check (manifest_hash ~ '^[0-9a-f]{64}$'),
  manifest jsonb not null
    check (jsonb_typeof(manifest) = 'object'),
  source_git_sha text not null
    check (length(btrim(source_git_sha)) > 0),
  created_at timestamptz not null default now()
);

create table private.exercise_revisions (
  revision_id uuid primary key default extensions.gen_random_uuid(),
  project_id text not null
    check (length(btrim(project_id)) > 0),
  exercise_id text not null
    check (length(btrim(exercise_id)) > 0),
  exercise_version integer not null
    check (exercise_version > 0),
  content_hash text not null
    check (content_hash ~ '^[0-9a-f]{64}$'),
  canonicalization_version integer not null
    check (canonicalization_version > 0),
  canonical_payload text not null
    check (length(canonical_payload) > 0),
  payload jsonb not null
    check (jsonb_typeof(payload) = 'object'),
  objective_id text,
  created_at timestamptz not null default now(),
  constraint exercise_revisions_identity_key
    unique (project_id, exercise_id, exercise_version)
);

create table private.content_release_entries (
  release_id text not null,
  revision_id uuid not null,
  primary key (release_id, revision_id),
  constraint content_release_entries_release_fk
    foreign key (release_id)
    references private.content_releases (release_id)
    on update restrict
    on delete restrict,
  constraint content_release_entries_revision_fk
    foreign key (revision_id)
    references private.exercise_revisions (revision_id)
    on update restrict
    on delete restrict
);

create index content_release_entries_revision_id_idx
  on private.content_release_entries (revision_id);

-- The archive owner may perform controlled maintenance, but every row-level
-- UPDATE or DELETE is rejected so a normal runtime path cannot mutate history.
create or replace function private.study_graph_archive_row_is_immutable()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'Study Graph archive rows are immutable';
  return null;
end;
$$;

create trigger content_releases_immutable
before update or delete on private.content_releases
for each row execute function private.study_graph_archive_row_is_immutable();

create trigger exercise_revisions_immutable
before update or delete on private.exercise_revisions
for each row execute function private.study_graph_archive_row_is_immutable();

create trigger content_release_entries_immutable
before update or delete on private.content_release_entries
for each row execute function private.study_graph_archive_row_is_immutable();

alter table private.content_releases enable row level security;
alter table private.exercise_revisions enable row level security;
alter table private.content_release_entries enable row level security;

-- No browser role receives schema or table privileges. A future server-side
-- archive path must receive an explicit, minimal INSERT grant separately.
revoke usage on schema private from public, anon, authenticated;
revoke all on table private.content_releases from public, anon, authenticated;
revoke all on table private.exercise_revisions from public, anon, authenticated;
revoke all on table private.content_release_entries from public, anon, authenticated;
revoke all on function private.study_graph_archive_row_is_immutable() from public, anon, authenticated;

commit;
