import { describe, it, expect } from 'vitest'
import { validateReadOnlySql } from './db-read.js'

describe('validateReadOnlySql', () => {
  describe('accepts plain reads', () => {
    it('accepts a simple SELECT', () => {
      expect(validateReadOnlySql('select id, status from invites limit 5').ok).toBe(true)
    })

    it('accepts a SELECT with a trailing semicolon', () => {
      expect(validateReadOnlySql('select count(*) from invites;').ok).toBe(true)
    })

    it('accepts WITH...SELECT', () => {
      const q = `with opened as (select * from invites where status in ('opened','watched'))
                 select sender_id, count(*) from opened group by sender_id`
      expect(validateReadOnlySql(q).ok).toBe(true)
    })

    it('accepts joins, subqueries, and aggregates', () => {
      const q = `select f.title, (select count(*) from invites i where i.film_id = f.id) as invites
                 from films f order by f.title`
      expect(validateReadOnlySql(q).ok).toBe(true)
    })

    it('does not trip on column names that merely contain a keyword (updated_at)', () => {
      expect(validateReadOnlySql('select id, updated_at, created_at from films').ok).toBe(true)
    })
  })

  describe('rejects non-queries and chaining', () => {
    it('rejects empty / missing input', () => {
      expect(validateReadOnlySql('').ok).toBe(false)
      expect(validateReadOnlySql('   ').ok).toBe(false)
      expect(validateReadOnlySql(undefined).ok).toBe(false)
      expect(validateReadOnlySql(null).ok).toBe(false)
      expect(validateReadOnlySql(42).ok).toBe(false)
    })

    it('rejects multiple statements chained with semicolons', () => {
      const v = validateReadOnlySql('select 1; select 2')
      expect(v.ok).toBe(false)
      expect(v.reason).toMatch(/single statement/i)
    })

    it('rejects a write chained after a read', () => {
      expect(validateReadOnlySql('select 1; delete from invites').ok).toBe(false)
    })

    it('rejects statements that do not start with SELECT or WITH', () => {
      expect(validateReadOnlySql('explain select 1').ok).toBe(false)
      expect(validateReadOnlySql('show search_path').ok).toBe(false)
      expect(validateReadOnlySql('begin').ok).toBe(false)
    })
  })

  describe('rejects every write/DDL keyword anywhere in the query', () => {
    const writes = [
      'insert into invites (id) values (1)',
      'update invites set status = $1',
      'delete from invites where id = 1',
      'drop table invites',
      'truncate invites',
      'alter table invites add column x int',
      'grant all on invites to anon',
      'create table x (id int)',
      'revoke select on invites from anon',
      'copy invites to stdout',
      'merge into invites using x on true when matched then do nothing',
      'call some_procedure()',
      'do $x$ begin null; end $x$',
      'vacuum invites',
      'lock table invites',
    ]
    for (const q of writes) {
      it(`rejects: ${q.slice(0, 40)}`, () => {
        expect(validateReadOnlySql(q).ok).toBe(false)
      })
    }
  })

  describe('rejects writes hidden inside WITH clauses', () => {
    it('rejects DELETE inside a CTE', () => {
      const v = validateReadOnlySql(
        'with gone as (delete from invites where status = $1 returning id) select count(*) from gone'
      )
      expect(v.ok).toBe(false)
      expect(v.reason).toMatch(/DELETE/i)
    })

    it('rejects INSERT inside a CTE', () => {
      expect(
        validateReadOnlySql('with x as (insert into invites (id) values (1) returning id) select * from x').ok
      ).toBe(false)
    })

    it('rejects UPDATE inside a nested CTE', () => {
      const q = `with a as (select 1), b as (update invites set status = 'opened' returning id)
                 select * from a, b`
      expect(validateReadOnlySql(q).ok).toBe(false)
    })

    it('rejects keywords regardless of case or spacing', () => {
      expect(validateReadOnlySql('WITH x AS (DeLeTe FROM invites RETURNING id) SELECT * FROM x').ok).toBe(false)
      expect(validateReadOnlySql('select 1 where exists (select 1) UNION select 2 FOR UPDATE').ok).toBe(false)
    })
  })

  describe('rejects smuggling via comments and dollar quoting', () => {
    it('rejects line comments', () => {
      expect(validateReadOnlySql('select 1 -- ; delete from invites').ok).toBe(false)
    })

    it('rejects block comments', () => {
      expect(validateReadOnlySql('select /* hide */ 1').ok).toBe(false)
    })

    it('rejects dollar-quoted blocks', () => {
      expect(validateReadOnlySql('select $$delete from invites$$').ok).toBe(false)
    })
  })

  it('returns the normalized single statement on success', () => {
    const v = validateReadOnlySql('  select 1;  ')
    expect(v).toEqual({ ok: true, sql: 'select 1' })
  })
})
