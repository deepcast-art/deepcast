#!/usr/bin/env node
/**
 * READ-ONLY: who the pass-it-on sweep would email right now, addresses
 * masked, every excluded row with its reason. The same loader the hourly
 * tick and the owner's route use (server/passItOnSweep.js) — one path.
 * Nothing is stamped, minted or sent; this file never imports the
 * dispatcher. Usage: node server/pass-it-on-dry-run.js
 */
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { loadPassItOnCandidates, previewEntry, tallyReasons } from './passItOnSweep.js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env')
  process.exit(1)
}
const supabase = createClient(supabaseUrl, supabaseKey)
const now = new Date()
const { evaluated, selected, migrated, missingColumns } = await loadPassItOnCandidates(supabase, now)
console.log(`pass-it-on dry run — ${now.toISOString()} — migration ${migrated ? 'applied' : 'NOT applied'}${missingColumns.length ? ` (missing columns read as null: ${missingColumns.join(', ')})` : ''}`)
console.log(`watched rows with an email and an account: ${evaluated.length}; would email: ${selected.length}`)
console.log('')
console.log('WOULD EMAIL (oldest first):')
for (const e of selected) console.log(' ', JSON.stringify(previewEntry(e, now)))
console.log('')
console.log('EXCLUDED, by reason:', JSON.stringify(tallyReasons(evaluated)))
for (const e of evaluated.filter((x) => x.reason)) console.log(' ', JSON.stringify(previewEntry(e, now)))
process.exit(0)
