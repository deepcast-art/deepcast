import { describe, it, expect } from 'vitest'
import { claimNameStamp } from './claimNameRule.js'

describe('claimNameStamp — canonical name at the claim boundary', () => {
  it('attached account with a different name stamps its current name', () => {
    expect(
      claimNameStamp({ accountCreated: false, accountName: 'Ien', typedName: 'Kanye' })
    ).toEqual({ stamp: true, name: 'Ien' })
  })

  it('trims the account name before stamping', () => {
    expect(
      claimNameStamp({ accountCreated: false, accountName: '  Trace ', typedName: 'T' })
    ).toEqual({ stamp: true, name: 'Trace' })
  })

  it('a CREATED account never stamps (born matching, or email-derived)', () => {
    expect(
      claimNameStamp({ accountCreated: true, accountName: 'Bob', typedName: 'Bob' })
    ).toEqual({ stamp: false })
    // created from a blank typed name → account name is the email local part;
    // stamping it would render an email fragment as a person's name
    expect(
      claimNameStamp({ accountCreated: true, accountName: 'ien.chi96', typedName: '' })
    ).toEqual({ stamp: false })
  })

  it('blank or whitespace account name keeps the typed placeholder', () => {
    expect(claimNameStamp({ accountCreated: false, accountName: '', typedName: 'Bob' })).toEqual({
      stamp: false,
    })
    expect(claimNameStamp({ accountCreated: false, accountName: '   ', typedName: 'Bob' })).toEqual({
      stamp: false,
    })
    expect(
      claimNameStamp({ accountCreated: false, accountName: null, typedName: 'Bob' })
    ).toEqual({ stamp: false })
    expect(
      claimNameStamp({ accountCreated: false, accountName: undefined, typedName: 'Bob' })
    ).toEqual({ stamp: false })
  })

  it('an @-containing account name never stamps (email never rendered as a name)', () => {
    expect(
      claimNameStamp({
        accountCreated: false,
        accountName: 'someone@example.com',
        typedName: 'Bob',
      })
    ).toEqual({ stamp: false })
  })

  it('identical names skip the write (no-op)', () => {
    expect(
      claimNameStamp({ accountCreated: false, accountName: 'Bob', typedName: 'Bob' })
    ).toEqual({ stamp: false })
    expect(
      claimNameStamp({ accountCreated: false, accountName: 'Bob', typedName: ' Bob ' })
    ).toEqual({ stamp: false })
  })

  it('null typed name still stamps a real account name', () => {
    expect(
      claimNameStamp({ accountCreated: false, accountName: 'Georgie', typedName: null })
    ).toEqual({ stamp: true, name: 'Georgie' })
  })
})
