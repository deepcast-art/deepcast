/**
 * db-read.js — read-only database inspection from the command line.
 *
 *   node server/db-read.js "select id, status from invites limit 10"
 *
 * All read-only inspection (checking, comparing, verifying data) goes through
 * this script so the owner is only ever prompted for genuine database WRITES.
 *
 * Two independent layers guarantee read-only:
 *  1. validateReadOnlySql() below rejects anything that is not a single
 *     SELECT / WITH...SELECT statement, including writes hidden in WITH clauses.
 *  2. The query runs through the `db_read` Postgres function (STABLE, invoked
 *     over GET), which Postgres executes inside a READ ONLY transaction — any
 *     write that somehow slipped past validation fails at the database itself.
 *
 * One-time setup: apply supabase/migrations/20260610_db_read_function.sql.
 */
import 'dotenv/config'
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'

/** Statements / keywords that can write, change schema, or escalate. A query
 *  containing any of these as a whole word is rejected outright — even inside
 *  a WITH clause, a subquery, a string, or a comment. Conservative on purpose:
 *  a false rejection costs a reworded query; a false accept costs data. */
const FORBIDDEN_KEYWORDS = [
  'insert',
  'update',
  'delete',
  'drop',
  'truncate',
  'alter',
  'grant',
  'create',
  'revoke',
  'copy',
  'merge',
  'call',
  'do',
  'execute',
  'vacuum',
  'reindex',
  'refresh',
  'lock',
  'comment',
  'set',
  'reset',
  'listen',
  'notify',
  'prepare',
  'deallocate',
  'security',
  'import',
]

/**
 * Validate that `sql` is a single, purely read-only statement.
 * Returns { ok: true, sql } with a normalized query, or { ok: false, reason }.
 */
export function validateReadOnlySql(input) {
  if (typeof input !== 'string' || !input.trim()) {
    return { ok: false, reason: 'Provide one SQL query as a single argument.' }
  }
  let sql = input.trim()

  // One trailing semicolon is tolerated; any other semicolon means
  // multiple statements (or an attempt to chain one) — rejected.
  if (sql.endsWith(';')) sql = sql.slice(0, -1).trimEnd()
  if (sql.includes(';')) {
    return { ok: false, reason: 'Only a single statement is allowed (no semicolon chaining).' }
  }

  // Comments and dollar-quoting are rejected so nothing can be smuggled past
  // the keyword scan or the leading-keyword check.
  if (sql.includes('--') || sql.includes('/*') || sql.includes('$$')) {
    return { ok: false, reason: 'Comments and dollar-quoted blocks are not allowed.' }
  }

  // Must be a plain SELECT or a WITH ... SELECT.
  if (!/^\s*(select|with)\b/i.test(sql)) {
    return { ok: false, reason: 'Only SELECT or WITH...SELECT queries are allowed.' }
  }

  for (const kw of FORBIDDEN_KEYWORDS) {
    const re = new RegExp(`\\b${kw}\\b`, 'i')
    if (re.test(sql)) {
      return { ok: false, reason: `Forbidden keyword "${kw.toUpperCase()}" — this tool is read-only.` }
    }
  }

  return { ok: true, sql }
}

async function main() {
  const input = process.argv[2]
  const verdict = validateReadOnlySql(input)
  if (!verdict.ok) {
    console.error(`Rejected: ${verdict.reason}`)
    console.error('Usage: node server/db-read.js "select ... from ... "')
    process.exit(1)
  }

  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, supabaseKey)
  // get:true → PostgREST runs the STABLE function in a READ ONLY transaction.
  const { data, error } = await supabase.rpc('db_read', { query: verdict.sql }, { get: true })
  if (error) {
    if (/db_read/.test(error.message) && /not.*find|does not exist|404/i.test(error.message)) {
      console.error(
        'The db_read function is not installed yet. One-time setup:\n' +
          'apply supabase/migrations/20260610_db_read_function.sql to the project.'
      )
    } else {
      console.error(`Query failed: ${error.message}`)
    }
    process.exit(1)
  }

  const rows = Array.isArray(data) ? data : []
  console.log(JSON.stringify(rows, null, 2))
  console.error(`(${rows.length} row${rows.length === 1 ? '' : 's'})`)
}

// Run only as a CLI — importing this module (e.g. from tests) must not execute a query.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
