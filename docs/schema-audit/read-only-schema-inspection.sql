/*
  NexaNotion Business Dashboard — Docker-free schema inspection

  Safety properties:
  - This is one SELECT statement. It performs no DDL or DML.
  - It reads PostgreSQL/Supabase catalog metadata only.
  - It never selects rows from public, auth, storage, or application tables.
  - It scopes application objects to the public schema. Foreign-key targets may
    name a referenced non-public table, but no rows or columns beyond the
    referenced key metadata are read.
  - It does not return database passwords, connection strings, Auth users,
    Storage objects, table rows, or estimated/exact business row counts.
  - Definition text is redacted for common credential, endpoint, personal
    identifier, and high-entropy literal patterns before it is returned.
  - sensitive_value_signals reports only the object and signal category. It
    never returns the matched value.

  Run this script separately in the production and development Supabase SQL
  Editors. Each run returns exactly one row and one column named
  schema_metadata_json. Review sensitive_value_signals before retaining or
  sharing the result.
*/

with
scope_relations as (
  select
    c.oid as relation_oid,
    n.nspname as schema_name,
    c.relname as relation_name,
    c.relkind,
    c.relpersistence,
    c.relrowsecurity,
    c.relforcerowsecurity,
    c.relispartition
  from pg_catalog.pg_class as c
  join pg_catalog.pg_namespace as n
    on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p', 'v', 'm', 'f', 'S')
),
scope_functions as (
  select
    p.oid as function_oid,
    n.nspname as schema_name,
    p.proname as function_name,
    pg_catalog.pg_get_function_identity_arguments(p.oid) as identity_arguments,
    p.prokind,
    p.proowner,
    p.proacl,
    p.prosecdef,
    p.provolatile,
    p.proparallel,
    p.proconfig,
    l.lanname as language_name
  from pg_catalog.pg_proc as p
  join pg_catalog.pg_namespace as n
    on n.oid = p.pronamespace
  join pg_catalog.pg_language as l
    on l.oid = p.prolang
  where n.nspname = 'public'
    and not exists (
      select 1
      from pg_catalog.pg_depend as d
      join pg_catalog.pg_extension as e
        on e.oid = d.refobjid
      where d.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
        and d.objid = p.oid
        and d.deptype = 'e'
    )
),
raw_definition_text as (
  select
    'column_default'::text as object_kind,
    r.schema_name,
    r.relation_name || '.' || a.attname as object_name,
    'default'::text as field_name,
    pg_catalog.pg_get_expr(d.adbin, d.adrelid, true) as raw_text,
    true as include_in_export
  from scope_relations as r
  join pg_catalog.pg_attribute as a
    on a.attrelid = r.relation_oid
   and a.attnum > 0
   and not a.attisdropped
  join pg_catalog.pg_attrdef as d
    on d.adrelid = a.attrelid
   and d.adnum = a.attnum
  where r.relkind in ('r', 'p', 'v', 'm', 'f')

  union all

  select
    'constraint',
    r.schema_name,
    r.relation_name || '.' || c.conname,
    'definition',
    pg_catalog.pg_get_constraintdef(c.oid, true),
    true
  from pg_catalog.pg_constraint as c
  join scope_relations as r
    on r.relation_oid = c.conrelid

  union all

  select
    'index',
    r.schema_name,
    r.relation_name || '.' || index_class.relname,
    'definition',
    pg_catalog.pg_get_indexdef(i.indexrelid, 0, true),
    true
  from pg_catalog.pg_index as i
  join scope_relations as r
    on r.relation_oid = i.indrelid
  join pg_catalog.pg_class as index_class
    on index_class.oid = i.indexrelid

  union all

  select
    'index',
    r.schema_name,
    r.relation_name || '.' || index_class.relname,
    'predicate',
    pg_catalog.pg_get_expr(i.indpred, i.indrelid, true),
    true
  from pg_catalog.pg_index as i
  join scope_relations as r
    on r.relation_oid = i.indrelid
  join pg_catalog.pg_class as index_class
    on index_class.oid = i.indexrelid
  where i.indpred is not null

  union all

  select
    'policy',
    r.schema_name,
    r.relation_name || '.' || p.polname,
    'using_expression',
    pg_catalog.pg_get_expr(p.polqual, p.polrelid, true),
    true
  from pg_catalog.pg_policy as p
  join scope_relations as r
    on r.relation_oid = p.polrelid
  where p.polqual is not null

  union all

  select
    'policy',
    r.schema_name,
    r.relation_name || '.' || p.polname,
    'with_check_expression',
    pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid, true),
    true
  from pg_catalog.pg_policy as p
  join scope_relations as r
    on r.relation_oid = p.polrelid
  where p.polwithcheck is not null

  union all

  select
    'trigger',
    r.schema_name,
    r.relation_name || '.' || t.tgname,
    'definition',
    pg_catalog.pg_get_triggerdef(t.oid, true),
    true
  from pg_catalog.pg_trigger as t
  join scope_relations as r
    on r.relation_oid = t.tgrelid
  where not t.tgisinternal

  union all

  select
    'function',
    f.schema_name,
    f.function_name || '(' || f.identity_arguments || ')',
    'definition',
    pg_catalog.pg_get_functiondef(f.function_oid),
    true
  from scope_functions as f
  where f.prokind in ('f', 'p')

  union all

  select
    'function',
    f.schema_name,
    f.function_name || '(' || f.identity_arguments || ')',
    'configuration',
    pg_catalog.array_to_string(f.proconfig, ', '),
    true
  from scope_functions as f
  where f.proconfig is not null

  union all

  select
    case when r.relkind = 'm' then 'materialized_view' else 'view' end,
    r.schema_name,
    r.relation_name,
    'definition',
    pg_catalog.pg_get_viewdef(r.relation_oid, true),
    true
  from scope_relations as r
  where r.relkind in ('v', 'm')

  union all

  select
    'relation_comment',
    r.schema_name,
    r.relation_name,
    'comment',
    pg_catalog.obj_description(r.relation_oid, 'pg_class'),
    false
  from scope_relations as r
  where pg_catalog.obj_description(r.relation_oid, 'pg_class') is not null

  union all

  select
    'column_comment',
    r.schema_name,
    r.relation_name || '.' || a.attname,
    'comment',
    pg_catalog.col_description(r.relation_oid, a.attnum),
    false
  from scope_relations as r
  join pg_catalog.pg_attribute as a
    on a.attrelid = r.relation_oid
   and a.attnum > 0
   and not a.attisdropped
  where pg_catalog.col_description(r.relation_oid, a.attnum) is not null

  union all

  select
    'function_comment',
    f.schema_name,
    f.function_name || '(' || f.identity_arguments || ')',
    'comment',
    pg_catalog.obj_description(f.function_oid, 'pg_proc'),
    false
  from scope_functions as f
  where pg_catalog.obj_description(f.function_oid, 'pg_proc') is not null
),
sanitized_definition_text as (
  select
    object_kind,
    schema_name,
    object_name,
    field_name,
    include_in_export,
    pg_catalog.regexp_replace(
      pg_catalog.regexp_replace(
        pg_catalog.regexp_replace(
          pg_catalog.regexp_replace(
            pg_catalog.regexp_replace(
              pg_catalog.regexp_replace(
                pg_catalog.regexp_replace(
                  pg_catalog.regexp_replace(
                    pg_catalog.regexp_replace(
                      pg_catalog.regexp_replace(
                        pg_catalog.regexp_replace(
                          raw_text,
                          $audit$((password|passwd|pwd|secret|api[_-]?key|service[_-]?role[_-]?key|access[_-]?token|refresh[_-]?token|authorization)[[:space:]]*[:=]+[[:space:]]*)('[^']*'|"[^"]*"|[^,;[:space:]]+)$audit$,
                          E'\\1[redacted assigned value]',
                          'gi'
                        ),
                        $audit$-----BEGIN [A-Z ]*(PRIVATE|SECRET) KEY-----([[:space:][:alnum:]/+=-])*-----END [A-Z ]*(PRIVATE|SECRET) KEY-----$audit$,
                        '[redacted private key]',
                        'gi'
                      ),
                      $audit$(postgresql?|mysql|mongodb(\+srv)?|redis)://[^[:space:]'"<>]+$audit$,
                      '[redacted connection string]',
                      'gi'
                    ),
                    $audit$https?://[^[:space:]'"<>]+$audit$,
                    '[redacted URL]',
                    'gi'
                  ),
                  $audit$[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$audit$,
                  '[redacted email]',
                  'gi'
                ),
                $audit$[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}$audit$,
                '[redacted token]',
                'g'
              ),
              $audit$(sb_secret_|sb_publishable_|sk_live_|sk_test_|pk_live_|pk_test_|ghp_|github_pat_|AKIA)[A-Za-z0-9_+=/-]{8,}$audit$,
              '[redacted key or token]',
              'gi'
            ),
            $audit$[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$audit$,
            '[redacted UUID]',
            'gi'
          ),
          $audit$(\+?880|0)1[3-9][0-9]{8}$audit$,
          '[redacted phone]',
          'g'
        ),
        $audit$'([[:alnum:]_+/=-]{32,})'$audit$,
        $replacement$'[redacted long literal]'$replacement$,
        'g'
      ),
      $audit$"([[:alnum:]_+/=-]{32,})"$audit$,
      $replacement$"[redacted long literal]"$replacement$,
      'g'
    ) as safe_text
  from raw_definition_text
),
sensitive_value_signals as (
  select distinct
    d.object_kind,
    d.schema_name,
    d.object_name,
    d.field_name,
    signal_check.reason
  from raw_definition_text as d
  cross join lateral (
    values
      ('credential_assignment', d.raw_text ~* $audit$(password|passwd|pwd|secret|api[_-]?key|service[_-]?role[_-]?key|access[_-]?token|refresh[_-]?token|authorization)[[:space:]]*[:=]+$audit$),
      ('private_key_marker', d.raw_text ~* $audit$-----BEGIN [A-Z ]*(PRIVATE|SECRET) KEY-----$audit$),
      ('connection_string', d.raw_text ~* $audit$(postgresql?|mysql|mongodb(\+srv)?|redis)://$audit$),
      ('url_literal', d.raw_text ~* $audit$https?://$audit$),
      ('email_literal', d.raw_text ~* $audit$[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$audit$),
      ('jwt_like_token', d.raw_text ~ $audit$[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}$audit$),
      ('known_key_prefix', d.raw_text ~* $audit$(sb_secret_|sb_publishable_|sk_live_|sk_test_|pk_live_|pk_test_|ghp_|github_pat_|AKIA)[A-Za-z0-9_+=/-]{8,}$audit$),
      ('uuid_literal', d.raw_text ~* $audit$[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$audit$),
      ('bangladesh_phone_literal', d.raw_text ~ $audit$(\+?880|0)1[3-9][0-9]{8}$audit$),
      ('long_quoted_literal', d.raw_text ~ $audit$['"][[:alnum:]_+/=-]{32,}['"]$audit$),
      ('sensitive_keyword', d.raw_text ~* $audit$(password|passwd|pwd|secret|service_role|api[_-]?key|access[_-]?token|refresh[_-]?token|authorization|bearer)$audit$)
  ) as signal_check(reason, is_match)
  where signal_check.is_match
),
enum_metadata as (
  select
    n.nspname as schema_name,
    t.typname as enum_name,
    pg_catalog.jsonb_agg(e.enumlabel order by e.enumsortorder) as labels
  from pg_catalog.pg_type as t
  join pg_catalog.pg_namespace as n
    on n.oid = t.typnamespace
  join pg_catalog.pg_enum as e
    on e.enumtypid = t.oid
  where n.nspname = 'public'
  group by n.nspname, t.typname
),
object_grants as (
  select
    case when r.relkind = 'S' then 'sequence' else 'relation' end as object_type,
    r.schema_name,
    r.relation_name as object_name,
    case when acl.grantor = 0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(acl.grantor) end as grantor,
    case when acl.grantee = 0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(acl.grantee) end as grantee,
    acl.privilege_type,
    acl.is_grantable
  from scope_relations as r
  join pg_catalog.pg_class as c
    on c.oid = r.relation_oid
  cross join lateral pg_catalog.aclexplode(
    coalesce(
      c.relacl,
      pg_catalog.acldefault(
        case when r.relkind = 'S' then 'S' else 'r' end::"char",
        c.relowner
      )
    )
  ) as acl

  union all

  select
    'function',
    f.schema_name,
    f.function_name || '(' || f.identity_arguments || ')',
    case when acl.grantor = 0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(acl.grantor) end,
    case when acl.grantee = 0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(acl.grantee) end,
    acl.privilege_type,
    acl.is_grantable
  from scope_functions as f
  cross join lateral pg_catalog.aclexplode(
    coalesce(f.proacl, pg_catalog.acldefault('f'::"char", f.proowner))
  ) as acl

  union all

  select
    'schema',
    n.nspname,
    n.nspname,
    case when acl.grantor = 0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(acl.grantor) end,
    case when acl.grantee = 0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(acl.grantee) end,
    acl.privilege_type,
    acl.is_grantable
  from pg_catalog.pg_namespace as n
  cross join lateral pg_catalog.aclexplode(
    coalesce(n.nspacl, pg_catalog.acldefault('n'::"char", n.nspowner))
  ) as acl
  where n.nspname = 'public'

  union all

  select
    'enum_type',
    n.nspname,
    t.typname,
    case when acl.grantor = 0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(acl.grantor) end,
    case when acl.grantee = 0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(acl.grantee) end,
    acl.privilege_type,
    acl.is_grantable
  from pg_catalog.pg_type as t
  join pg_catalog.pg_namespace as n
    on n.oid = t.typnamespace
  cross join lateral pg_catalog.aclexplode(
    coalesce(t.typacl, pg_catalog.acldefault('T'::"char", t.typowner))
  ) as acl
  where n.nspname = 'public'
    and t.typtype = 'e'
),
rls_diagnostics as (
  select
    r.schema_name,
    r.relation_name,
    case
      when not r.relrowsecurity then 'rls_disabled'
      when not exists (
        select 1
        from pg_catalog.pg_policy as p
        where p.polrelid = r.relation_oid
      ) then 'rls_enabled_without_policy'
      when not r.relforcerowsecurity then 'rls_not_forced_for_owner'
      else 'rls_enabled_with_policy'
    end as status
  from scope_relations as r
  where r.relkind in ('r', 'p')
),
foreign_key_index_diagnostics as (
  select
    r.schema_name,
    r.relation_name,
    c.conname as constraint_name,
    exists (
      select 1
      from pg_catalog.pg_index as i
      where i.indrelid = c.conrelid
        and i.indisvalid
        and i.indisready
        and i.indpred is null
        and i.indexprs is null
        and (
          select pg_catalog.array_agg(idx_key.attnum order by idx_key.ordinal_pos)
          from unnest(i.indkey::smallint[]) with ordinality as idx_key(attnum, ordinal_pos)
          where idx_key.ordinal_pos <= pg_catalog.cardinality(c.conkey)
        ) = c.conkey
    ) as has_matching_leading_index_order
  from pg_catalog.pg_constraint as c
  join scope_relations as r
    on r.relation_oid = c.conrelid
  where c.contype = 'f'
)
select pg_catalog.jsonb_pretty(
  pg_catalog.jsonb_build_object(
    'audit', pg_catalog.jsonb_build_object(
      'format_version', 1,
      'generated_at', pg_catalog.statement_timestamp(),
      'server_version', pg_catalog.current_setting('server_version'),
      'server_version_num', pg_catalog.current_setting('server_version_num'),
      'database_timezone', pg_catalog.current_setting('TimeZone'),
      'scope_schema', 'public',
      'contains_application_rows', false,
      'contains_auth_users', false,
      'contains_storage_objects', false,
      'contains_role_passwords_or_memberships', false
    ),
    'summary', pg_catalog.jsonb_build_object(
      'relation_count', (select count(*) from scope_relations),
      'table_count', (select count(*) from scope_relations where relkind in ('r', 'p')),
      'view_count', (select count(*) from scope_relations where relkind in ('v', 'm')),
      'sequence_count', (select count(*) from scope_relations where relkind = 'S'),
      'column_count', (
        select count(*)
        from scope_relations as r
        join pg_catalog.pg_attribute as a
          on a.attrelid = r.relation_oid
         and a.attnum > 0
         and not a.attisdropped
        where r.relkind in ('r', 'p', 'v', 'm', 'f')
      ),
      'constraint_count', (
        select count(*)
        from pg_catalog.pg_constraint as c
        join scope_relations as r on r.relation_oid = c.conrelid
      ),
      'index_count', (
        select count(*)
        from pg_catalog.pg_index as i
        join scope_relations as r on r.relation_oid = i.indrelid
      ),
      'policy_count', (
        select count(*)
        from pg_catalog.pg_policy as p
        join scope_relations as r on r.relation_oid = p.polrelid
      ),
      'trigger_count', (
        select count(*)
        from pg_catalog.pg_trigger as t
        join scope_relations as r on r.relation_oid = t.tgrelid
        where not t.tgisinternal
      ),
      'function_count', (select count(*) from scope_functions),
      'sensitive_value_signal_count', (select count(*) from sensitive_value_signals)
    ),
    'extensions', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'name', e.extname,
          'version', e.extversion,
          'schema', n.nspname
        ) order by e.extname
      )
      from pg_catalog.pg_extension as e
      join pg_catalog.pg_namespace as n on n.oid = e.extnamespace
    ), '[]'::jsonb),
    'relations', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'schema', r.schema_name,
          'name', r.relation_name,
          'kind', case r.relkind
            when 'r' then 'table'
            when 'p' then 'partitioned_table'
            when 'v' then 'view'
            when 'm' then 'materialized_view'
            when 'f' then 'foreign_table'
            when 'S' then 'sequence'
          end,
          'persistence', case r.relpersistence
            when 'p' then 'permanent'
            when 'u' then 'unlogged'
            when 't' then 'temporary'
          end,
          'is_partition', r.relispartition
        ) order by r.schema_name, r.relation_name
      )
      from scope_relations as r
    ), '[]'::jsonb),
    'columns', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'schema', r.schema_name,
          'relation', r.relation_name,
          'ordinal_position', a.attnum,
          'name', a.attname,
          'data_type', pg_catalog.format_type(a.atttypid, a.atttypmod),
          'is_nullable', not a.attnotnull,
          'identity', case a.attidentity
            when 'a' then 'always'
            when 'd' then 'by_default'
            else null
          end,
          'generated', case a.attgenerated
            when 's' then 'stored'
            else null
          end,
          'collation', case
            when a.attcollation = 0 then null
            else coll_ns.nspname || '.' || coll_ref.collname
          end,
          'has_default', d.oid is not null,
          'default_definition_ref', case when d.oid is not null
            then r.schema_name || '.' || r.relation_name || '.' || a.attname || ':default'
            else null
          end
        ) order by r.schema_name, r.relation_name, a.attnum
      )
      from scope_relations as r
      join pg_catalog.pg_attribute as a
        on a.attrelid = r.relation_oid
       and a.attnum > 0
       and not a.attisdropped
      left join pg_catalog.pg_attrdef as d
        on d.adrelid = a.attrelid
       and d.adnum = a.attnum
      left join pg_catalog.pg_collation as coll_ref
        on coll_ref.oid = a.attcollation
      left join pg_catalog.pg_namespace as coll_ns
        on coll_ns.oid = coll_ref.collnamespace
      where r.relkind in ('r', 'p', 'v', 'm', 'f')
    ), '[]'::jsonb),
    'enums', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'schema', e.schema_name,
          'name', e.enum_name,
          'labels', e.labels
        ) order by e.schema_name, e.enum_name
      )
      from enum_metadata as e
    ), '[]'::jsonb),
    'constraints', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'schema', r.schema_name,
          'relation', r.relation_name,
          'name', c.conname,
          'type', case c.contype
            when 'p' then 'primary_key'
            when 'f' then 'foreign_key'
            when 'u' then 'unique'
            when 'c' then 'check'
            when 'x' then 'exclusion'
            when 't' then 'constraint_trigger'
            else c.contype::text
          end,
          'is_validated', c.convalidated,
          'is_deferrable', c.condeferrable,
          'is_initially_deferred', c.condeferred,
          'definition_ref', r.schema_name || '.' || r.relation_name || '.' || c.conname || ':definition'
        ) order by r.schema_name, r.relation_name, c.conname
      )
      from pg_catalog.pg_constraint as c
      join scope_relations as r on r.relation_oid = c.conrelid
    ), '[]'::jsonb),
    'foreign_keys', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'schema', r.schema_name,
          'relation', r.relation_name,
          'name', c.conname,
          'columns', (
            select pg_catalog.jsonb_agg(a.attname order by fk_source_col.ordinal_pos)
            from unnest(c.conkey) with ordinality as fk_source_col(attnum, ordinal_pos)
            join pg_catalog.pg_attribute as a
              on a.attrelid = c.conrelid
             and a.attnum = fk_source_col.attnum
          ),
          'referenced_schema', referenced_namespace.nspname,
          'referenced_relation', referenced_relation.relname,
          'referenced_columns', (
            select pg_catalog.jsonb_agg(a.attname order by fk_target_col.ordinal_pos)
            from unnest(c.confkey) with ordinality as fk_target_col(attnum, ordinal_pos)
            join pg_catalog.pg_attribute as a
              on a.attrelid = c.confrelid
             and a.attnum = fk_target_col.attnum
          ),
          'match_type', case c.confmatchtype
            when 'f' then 'full'
            when 'p' then 'partial'
            when 's' then 'simple'
          end,
          'on_update', case c.confupdtype
            when 'a' then 'no_action'
            when 'r' then 'restrict'
            when 'c' then 'cascade'
            when 'n' then 'set_null'
            when 'd' then 'set_default'
          end,
          'on_delete', case c.confdeltype
            when 'a' then 'no_action'
            when 'r' then 'restrict'
            when 'c' then 'cascade'
            when 'n' then 'set_null'
            when 'd' then 'set_default'
          end,
          'is_validated', c.convalidated,
          'is_deferrable', c.condeferrable,
          'is_initially_deferred', c.condeferred
        ) order by r.schema_name, r.relation_name, c.conname
      )
      from pg_catalog.pg_constraint as c
      join scope_relations as r on r.relation_oid = c.conrelid
      join pg_catalog.pg_class as referenced_relation on referenced_relation.oid = c.confrelid
      join pg_catalog.pg_namespace as referenced_namespace on referenced_namespace.oid = referenced_relation.relnamespace
      where c.contype = 'f'
    ), '[]'::jsonb),
    'indexes', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'schema', r.schema_name,
          'relation', r.relation_name,
          'name', index_class.relname,
          'access_method', access_method.amname,
          'is_unique', i.indisunique,
          'is_primary', i.indisprimary,
          'is_exclusion', i.indisexclusion,
          'is_valid', i.indisvalid,
          'is_ready', i.indisready,
          'is_partial', i.indpred is not null,
          'is_expression', i.indexprs is not null,
          'definition_ref', r.schema_name || '.' || r.relation_name || '.' || index_class.relname || ':definition',
          'predicate_ref', case when i.indpred is not null
            then r.schema_name || '.' || r.relation_name || '.' || index_class.relname || ':predicate'
            else null
          end
        ) order by r.schema_name, r.relation_name, index_class.relname
      )
      from pg_catalog.pg_index as i
      join scope_relations as r on r.relation_oid = i.indrelid
      join pg_catalog.pg_class as index_class on index_class.oid = i.indexrelid
      join pg_catalog.pg_am as access_method on access_method.oid = index_class.relam
    ), '[]'::jsonb),
    'rls', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'schema', r.schema_name,
          'relation', r.relation_name,
          'enabled', r.relrowsecurity,
          'forced_for_owner', r.relforcerowsecurity
        ) order by r.schema_name, r.relation_name
      )
      from scope_relations as r
      where r.relkind in ('r', 'p')
    ), '[]'::jsonb),
    'policies', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'schema', r.schema_name,
          'relation', r.relation_name,
          'name', p.polname,
          'permissive', p.polpermissive,
          'command', case p.polcmd
            when 'r' then 'select'
            when 'a' then 'insert'
            when 'w' then 'update'
            when 'd' then 'delete'
            when '*' then 'all'
          end,
          'roles', coalesce((
            select pg_catalog.jsonb_agg(
              case when role_oid = 0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(role_oid) end
              order by role_oid
            )
            from unnest(p.polroles) as role_oid
          ), '[]'::jsonb),
          'using_definition_ref', case when p.polqual is not null
            then r.schema_name || '.' || r.relation_name || '.' || p.polname || ':using_expression'
            else null
          end,
          'with_check_definition_ref', case when p.polwithcheck is not null
            then r.schema_name || '.' || r.relation_name || '.' || p.polname || ':with_check_expression'
            else null
          end
        ) order by r.schema_name, r.relation_name, p.polname
      )
      from pg_catalog.pg_policy as p
      join scope_relations as r on r.relation_oid = p.polrelid
    ), '[]'::jsonb),
    'grants', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'object_type', g.object_type,
          'schema', g.schema_name,
          'object', g.object_name,
          'grantor', g.grantor,
          'grantee', g.grantee,
          'privilege', g.privilege_type,
          'is_grantable', g.is_grantable
        ) order by g.object_type, g.schema_name, g.object_name, g.grantee, g.privilege_type
      )
      from object_grants as g
    ), '[]'::jsonb),
    'triggers', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'schema', r.schema_name,
          'relation', r.relation_name,
          'name', t.tgname,
          'enabled_mode', case t.tgenabled
            when 'O' then 'origin_and_local'
            when 'D' then 'disabled'
            when 'R' then 'replica'
            when 'A' then 'always'
          end,
          'function_schema', function_namespace.nspname,
          'function_name', function_proc.proname,
          'definition_ref', r.schema_name || '.' || r.relation_name || '.' || t.tgname || ':definition'
        ) order by r.schema_name, r.relation_name, t.tgname
      )
      from pg_catalog.pg_trigger as t
      join scope_relations as r on r.relation_oid = t.tgrelid
      join pg_catalog.pg_proc as function_proc on function_proc.oid = t.tgfoid
      join pg_catalog.pg_namespace as function_namespace on function_namespace.oid = function_proc.pronamespace
      where not t.tgisinternal
    ), '[]'::jsonb),
    'functions', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'schema', f.schema_name,
          'name', f.function_name,
          'identity_arguments', f.identity_arguments,
          'kind', case f.prokind
            when 'f' then 'function'
            when 'p' then 'procedure'
            when 'a' then 'aggregate'
            when 'w' then 'window_function'
          end,
          'return_type', pg_catalog.pg_get_function_result(f.function_oid),
          'language', f.language_name,
          'security_definer', f.prosecdef,
          'volatility', case f.provolatile
            when 'i' then 'immutable'
            when 's' then 'stable'
            when 'v' then 'volatile'
          end,
          'parallel_safety', case f.proparallel
            when 's' then 'safe'
            when 'r' then 'restricted'
            when 'u' then 'unsafe'
          end,
          'definition_ref', case when f.prokind in ('f', 'p')
            then f.schema_name || '.' || f.function_name || '(' || f.identity_arguments || '):definition'
            else null
          end,
          'configuration_ref', case when f.proconfig is not null
            then f.schema_name || '.' || f.function_name || '(' || f.identity_arguments || '):configuration'
            else null
          end
        ) order by f.schema_name, f.function_name, f.identity_arguments
      )
      from scope_functions as f
    ), '[]'::jsonb),
    'definitions', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'object_kind', d.object_kind,
          'schema', d.schema_name,
          'object', d.object_name,
          'field', d.field_name,
          'reference', d.schema_name || '.' || d.object_name || ':' || d.field_name,
          'redacted_text', d.safe_text
        ) order by d.object_kind, d.schema_name, d.object_name, d.field_name
      )
      from sanitized_definition_text as d
      where d.include_in_export
    ), '[]'::jsonb),
    'rls_diagnostics', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'schema', d.schema_name,
          'relation', d.relation_name,
          'status', d.status
        ) order by d.schema_name, d.relation_name
      )
      from rls_diagnostics as d
    ), '[]'::jsonb),
    'foreign_key_index_diagnostics', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'schema', d.schema_name,
          'relation', d.relation_name,
          'constraint', d.constraint_name,
          'has_matching_leading_index_order', d.has_matching_leading_index_order
        ) order by d.schema_name, d.relation_name, d.constraint_name
      )
      from foreign_key_index_diagnostics as d
    ), '[]'::jsonb),
    'sensitive_value_signals', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'object_kind', s.object_kind,
          'schema', s.schema_name,
          'object', s.object_name,
          'field', s.field_name,
          'reason', s.reason,
          'matched_value_included', false
        ) order by s.object_kind, s.schema_name, s.object_name, s.field_name, s.reason
      )
      from sensitive_value_signals as s
    ), '[]'::jsonb),
    'safety_review', pg_catalog.jsonb_build_object(
      'definition_text_redacted', true,
      'comments_included', false,
      'comments_scanned_for_signals', true,
      'matched_sensitive_values_included', false,
      'manual_review_required_before_retention', true,
      'review_instruction', 'Review sensitive_value_signals and definitions before saving, sharing, or copying into Git.'
    )
  )
) as schema_metadata_json;
