/**
 * The comments migration — FOUNDER-RUN (Tier 3), 2026-09-10.
 *
 * What this script is, honestly: there is NO Postgres client on this
 * machine or in the project (no psql, no Supabase CLI, no `pg` package —
 * every previous migration was applied through the Supabase connector),
 * so this script cannot execute the DDL itself. It does everything around
 * the one step the founder pastes into the Supabase dashboard's SQL editor:
 *
 *   node server/comments-migration.js            # DRY RUN (default): checks
 *        the table is absent, prints the migration SQL VERBATIM and the
 *        exact steps. Writes nothing anywhere.
 *   node server/comments-migration.js --verify   # AFTER the paste: checks
 *        the after-state (table present, every column, RLS on, ZERO
 *        policies, no anon/authenticated grants), prints PASS/FAIL per
 *        check, and writes a JSON record of the verification to
 *        ~/deepcast-backups/<date>-comments-migration/. Exits non-zero on
 *        any FAIL.
 *
 * There is no --execute: the script refuses the flag and says why. Every
 * database call here goes through the READ-ONLY db_read function (the same
 * one server/db-read.js uses) — this script can never write to production.
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in the environment (.env is loaded).
 */
import 'dotenv/config'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const MIGRATION_FILE = path.join(HERE, '..', 'supabase', 'migrations', '20260910_comments.sql')
const VERIFY = process.argv.includes('--verify')
const BACKUP_ROOT = path.join(os.homedir(), 'deepcast-backups')

const EXPECTED_COLUMNS = [
  'id',
  'film_id',
  'user_id',
  'parent_comment_id',
  'body',
  'created_at',
  'deleted_at',
  'deleted_by',
]

/** The read-only verification queries — the same ones handed to the verifier. */
export const VERIFY_QUERIES = {
  table: "select to_regclass('public.comments') as comments_table",
  columns:
    "select column_name from information_schema.columns where table_schema='public' and table_name='comments' order by ordinal_position",
  rls: "select relrowsecurity as rls_on from pg_class where oid = 'public.comments'::regclass",
  policies: "select count(*) as policies from pg_policies where schemaname='public' and tablename='comments'",
  grants:
    "select grantee, privilege_type from information_schema.role_table_grants where table_schema='public' and table_name='comments' and grantee in ('anon','authenticated') order by 1,2",
}

function fail(msg) {
  console.error(`\n✖ ${msg}`)
  process.exit(1)
}

function jwtRole(jwt) {
  try {
    return JSON.parse(Buffer.from(jwt.split('.')[1], 'base64').toString('utf8')).role
  } catch {
    return null
  }
}

async function readOnly(supabase, query) {
  // get:true → PostgREST runs the STABLE db_read function in a READ ONLY transaction.
  const { data, error } = await supabase.rpc('db_read', { query }, { get: true })
  if (error) fail(`read failed: ${error.message}`)
  return Array.isArray(data) ? data : []
}

async function main() {
  if (process.argv.includes('--execute')) {
    fail(
      'This script has no --execute: there is no database client on this machine, so the DDL is pasted ' +
        'into the Supabase dashboard SQL editor by the founder. Run without flags for the dry run, then --verify.'
    )
  }
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) fail('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the environment.')
  if (jwtRole(key) !== 'service_role') fail('SUPABASE_SERVICE_ROLE_KEY is not a service_role key.')
  const supabase = createClient(url, key)
  const sql = fs.readFileSync(MIGRATION_FILE, 'utf8')

  const [{ comments_table }] = await readOnly(supabase, VERIFY_QUERIES.table)

  if (!VERIFY) {
    console.log('\n=== Comments migration — DRY RUN (nothing is written) ===')
    console.log(`Migration file: ${path.relative(process.cwd(), MIGRATION_FILE)}`)
    console.log(`Current state:  public.comments ${comments_table ? 'ALREADY EXISTS' : 'does not exist'}`)
    if (comments_table) {
      console.log('\nThe table already exists. The migration is idempotent, but there is nothing to do —')
      console.log('run `node server/comments-migration.js --verify` to check its after-state instead.')
      return
    }
    console.log('\nSteps (founder):')
    console.log('  1. Supabase dashboard → SQL editor → new query.')
    console.log('  2. Paste the SQL below EXACTLY as printed, and run it once.')
    console.log('  3. Back here: node server/comments-migration.js --verify')
    console.log('  4. Paste the --verify output to the verifier.')
    console.log('\n----- BEGIN supabase/migrations/20260910_comments.sql -----')
    process.stdout.write(sql)
    console.log('----- END -----\n')
    return
  }

  console.log('\n=== Comments migration — VERIFY (read-only) ===')
  const checks = []
  const record = (name, pass, detail) => {
    checks.push({ name, pass, detail })
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
  }

  record('table exists', Boolean(comments_table), comments_table || 'missing')
  if (comments_table) {
    const columns = (await readOnly(supabase, VERIFY_QUERIES.columns)).map((r) => r.column_name)
    const missing = EXPECTED_COLUMNS.filter((c) => !columns.includes(c))
    record('every column present', missing.length === 0, missing.length ? `missing: ${missing.join(', ')}` : columns.join(', '))
    const [{ rls_on }] = await readOnly(supabase, VERIFY_QUERIES.rls)
    record('row level security ON', rls_on === true, String(rls_on))
    const [{ policies }] = await readOnly(supabase, VERIFY_QUERIES.policies)
    record('zero policies (nobody but the service role)', Number(policies) === 0, `${policies} policies`)
    const grants = await readOnly(supabase, VERIFY_QUERIES.grants)
    record(
      'no anon / authenticated grants',
      grants.length === 0,
      grants.length ? grants.map((g) => `${g.grantee}:${g.privilege_type}`).join(' ') : 'none'
    )
  }

  const allPass = checks.every((c) => c.pass)
  const stamp = new Date().toISOString()
  const dir = path.join(BACKUP_ROOT, `${stamp.slice(0, 10)}-comments-migration`)
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `verify-${stamp.replace(/[:.]/g, '-')}.json`)
  fs.writeFileSync(file, JSON.stringify({ verifiedAt: stamp, allPass, checks, migrationSql: sql }, null, 2))
  console.log(`\nRecord written: ${file}`)
  console.log(allPass ? '\n✔ All checks passed.' : '\n✖ At least one check FAILED — do not merge until it passes.')
  if (!allPass) process.exit(1)
}

main()
