import { createContext, useContext, useEffect, useState, useRef } from 'react'
import { supabase } from './supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [profileLoaded, setProfileLoaded] = useState(false)
  const isSigningUp = useRef(false)

  const SUPABASE_URL = 'https://wmtjgpxhjtbocsmutqqc.supabase.co'
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtdGpncHhoanRib2NzbXV0cXFjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4OTU5MTcsImV4cCI6MjA4NzQ3MTkxN30.IeeS2KToh7YPsKcVhFtojcX5fuwjAwEzIt5_RO09tQg'

  /**
   * Auth user exists but public.users row is missing (e.g. invited viewer who never hit signup insert).
   * RLS allows insert where id = auth.uid().
   */
  async function ensurePublicUserRowForAuthUser(userId) {
    const { data: authData } = await supabase.auth.getUser()
    const authUser = authData?.user
    if (!authUser?.id || authUser.id !== userId) return null
    const safeEmail = (authUser.email || '').trim()
    if (!safeEmail) return null

    const safeName = safeEmail.split('@')[0] || 'Member'
    const { data: created, error: insErr } = await supabase
      .from('users')
      .insert({
        id: userId,
        email: safeEmail,
        name: safeName,
        first_name: safeName,
        last_name: '',
        role: 'viewer',
        invite_allocation: 5,
      })
      .select()
      .single()

    if (!insErr && created) return created

    if (insErr?.code === '23505') {
      const { data: byId } = await supabase.from('users').select('*').eq('id', userId).maybeSingle()
      if (byId) return byId
    }

    return null
  }

  async function fetchProfileViaSupabaseClient(userId) {
    const { data, error } = await supabase.from('users').select('*').eq('id', userId).maybeSingle()
    if (error) {
      console.warn('Profile fetch (supabase client):', error.message)
      return null
    }
    return data ?? null
  }

  async function fetchProfile(userId, token) {
    try {
      let accessToken = token
      if (!accessToken) {
        const stored = localStorage.getItem('sb-wmtjgpxhjtbocsmutqqc-auth-token')
        if (stored) {
          try { accessToken = JSON.parse(stored)?.access_token } catch { /* ignore */ }
        }
      }

      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/users?id=eq.${userId}&select=*`,
        {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${accessToken || SUPABASE_ANON_KEY}`,
          },
        }
      )

      const rows = await res.json()

      if (!res.ok) {
        console.error('Profile fetch failed:', res.status, rows)
        const viaClient = await fetchProfileViaSupabaseClient(userId)
        if (viaClient) {
          setProfile(viaClient)
          setProfileLoaded(true)
          return viaClient
        }
        const ensured = await ensurePublicUserRowForAuthUser(userId)
        if (ensured) {
          setProfile(ensured)
          setProfileLoaded(true)
          return ensured
        }
        setProfile(null)
        setProfileLoaded(true)
        return null
      }

      if (!Array.isArray(rows)) {
        console.error('Profile fetch unexpected response:', rows)
        const viaClient = await fetchProfileViaSupabaseClient(userId)
        if (viaClient) {
          setProfile(viaClient)
          setProfileLoaded(true)
          return viaClient
        }
        const ensured = await ensurePublicUserRowForAuthUser(userId)
        if (ensured) {
          setProfile(ensured)
          setProfileLoaded(true)
          return ensured
        }
        setProfile(null)
        setProfileLoaded(true)
        return null
      }

      let row = rows[0] ?? null

      if (!row) {
        row = await fetchProfileViaSupabaseClient(userId)
      }

      if (!row) {
        row = await ensurePublicUserRowForAuthUser(userId)
      }

      setProfile(row || null)
      setProfileLoaded(true)
      return row || null
    } catch (err) {
      console.error('Profile fetch error:', err)
      const viaClient = await fetchProfileViaSupabaseClient(userId).catch(() => null)
      if (viaClient) {
        setProfile(viaClient)
        setProfileLoaded(true)
        return viaClient
      }
      const ensured = await ensurePublicUserRowForAuthUser(userId).catch(() => null)
      if (ensured) {
        setProfile(ensured)
        setProfileLoaded(true)
        return ensured
      }
      setProfile(null)
      setProfileLoaded(true)
      return null
    }
  }

  async function createProfile(userId, email, name, role, firstName = '', lastName = '', accessToken = null) {
    const safeName = name && name.trim() ? name.trim() : email.split('@')[0]
    const safeFirst = firstName && firstName.trim() ? firstName.trim() : safeName.split(' ')[0]
    const safeLast = lastName && lastName.trim() ? lastName.trim() : safeName.split(' ').slice(1).join(' ') || ''

    const profileRow = {
      id: userId,
      email,
      name: safeName,
      first_name: safeFirst,
      last_name: safeLast,
      role,
      invite_allocation: role === 'creator' ? 0 : 5,
    }

    const token = accessToken || SUPABASE_ANON_KEY

    const res = await fetch(`${SUPABASE_URL}/rest/v1/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify(profileRow),
    })

    if (res.status === 409) {
      await fetch(`${SUPABASE_URL}/rest/v1/users?id=eq.${userId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${token}`,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({ name: safeName, first_name: safeFirst, last_name: safeLast, role, invite_allocation: profileRow.invite_allocation }),
      })
    } else if (!res.ok) {
      const body = await res.text()
      throw new Error(`Profile creation failed: ${body}`)
    }

    setProfile(profileRow)
    setProfileLoaded(true)
    return profileRow
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session }, error }) => {
      // Clear stale/invalid sessions (e.g. deleted users with leftover tokens)
      if (error || (!session && localStorage.getItem('sb-wmtjgpxhjtbocsmutqqc-auth-token'))) {
        console.warn('Clearing stale auth session')
        await supabase.auth.signOut().catch(() => {})
        setSession(null)
        setUser(null)
        setProfile(null)
        setProfileLoaded(false)
        setLoading(false)
        return
      }

      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        await fetchProfile(session.user.id, session.access_token)
      }
      setLoading(false)
    }).catch(async () => {
      // If getSession itself throws, clear everything
      await supabase.auth.signOut().catch(() => {})
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session)
        setUser(session?.user ?? null)
        if (session?.user && !isSigningUp.current) {
          fetchProfile(session.user.id, session.access_token).catch(() => {})
        } else if (!session?.user) {
          setProfile(null)
          setProfileLoaded(false)
        }
        setLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const signUp = async (email, password, name, role = 'viewer', firstName = '', lastName = '') => {
    isSigningUp.current = true
    setProfileLoaded(false)

    try {
      const { data, error } = await supabase.auth.signUp({ email, password })

      const alreadyRegistered =
        error && /already registered|already been registered|already exists/i.test(error.message)

      const fakeUser =
        !error && data?.user && (!data.user.identities || data.user.identities.length === 0)

      if (alreadyRegistered || fakeUser) {
        isSigningUp.current = false
        const result = await signIn(email, password)

        if (result.profile && result.profile.role !== role) {
          await supabase.from('users')
            .update({ role, invite_allocation: role === 'creator' ? 0 : 5 })
            .eq('id', result.user.id)
          const updated = { ...result.profile, role, invite_allocation: role === 'creator' ? 0 : 5 }
          setProfile(updated)
          return { ...result, profile: updated }
        }

        return result
      }

      if (error) throw error

      let activeUser = data.user
      let activeSession = data.session

      if (!activeSession && activeUser) {
        await new Promise(resolve => setTimeout(resolve, 500))

        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        })

        if (signInError) {
          isSigningUp.current = false
          throw new Error('Account created but email confirmation may be required. Please check your inbox and then sign in.')
        }

        activeUser = signInData?.user || activeUser
        activeSession = signInData?.session
      }

      if (activeUser) {
        const token = activeSession?.access_token || null
        await createProfile(activeUser.id, email, name, role, firstName, lastName, token)

        setUser(activeUser)
        setSession(activeSession)

        void supabase
          .from('invites')
          .update({ status: 'signed_up' })
          .eq('recipient_email', email)
          .eq('status', 'watched')

        void supabase
          .from('invites')
          .update({ sender_id: activeUser.id, sender_name: name, sender_email: email })
          .eq('sender_email', email)
          .is('sender_id', null)
      }

      isSigningUp.current = false
      return { ...data, session: activeSession, user: activeUser, profile }
    } catch (err) {
      isSigningUp.current = false
      throw err
    }
  }

  const signIn = async (email, password) => {
    setProfileLoaded(false)

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (error) throw error

    let currentProfile = null
    if (data.user) {
      currentProfile = await fetchProfile(data.user.id, data.session?.access_token)

      if (!currentProfile) {
        throw new Error(
          'Your account signed in, but your profile could not be loaded. If you use a different email for invitations, sign in with the same address you were invited on.'
        )
      }
    }

    return { ...data, profile: currentProfile }
  }

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    setProfile(null)
    setProfileLoaded(false)
  }

  return (
    <AuthContext.Provider
      value={{ session, user, profile, loading, profileLoaded, signUp, signIn, signOut, fetchProfile }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
