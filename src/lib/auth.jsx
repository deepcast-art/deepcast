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

  async function fetchProfile(userId) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)

      const row = Array.isArray(data) ? data[0] : data

      if (error) {
        console.warn('Profile fetch failed:', error.message)
        setProfile(null)
      } else {
        setProfile(row || null)
      }
      setProfileLoaded(true)
      return row || null
    } catch (err) {
      console.error('Profile fetch error:', err)
      setProfile(null)
      setProfileLoaded(true)
      return null
    }
  }

  async function createProfile(userId, email, name, role) {
    const safeName = name && name.trim() ? name.trim() : email.split('@')[0]

    const profileRow = {
      id: userId,
      email,
      name: safeName,
      role,
      invite_allocation: role === 'creator' ? 0 : 5,
    }

    console.log('[createProfile] inserting via fetch:', profileRow)

    const { data: sessionData } = await supabase.auth.getSession()
    const accessToken = sessionData?.session?.access_token
    console.log('[createProfile] access token:', accessToken ? 'present' : 'MISSING')

    const supabaseUrl = 'https://wmtjgpxhjtbocsmutqqc.supabase.co'
    const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtdGpncHhoanRib2NzbXV0cXFjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4OTU5MTcsImV4cCI6MjA4NzQ3MTkxN30.IeeS2KToh7YPsKcVhFtojcX5fuwjAwEzIt5_RO09tQg'

    const res = await fetch(`${supabaseUrl}/rest/v1/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${accessToken || supabaseAnonKey}`,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify(profileRow),
    })

    console.log('[createProfile] fetch status:', res.status)

    if (res.status === 409 || res.status === 409) {
      console.log('[createProfile] conflict, updating...')
      const updateRes = await fetch(`${supabaseUrl}/rest/v1/users?id=eq.${userId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseAnonKey,
          'Authorization': `Bearer ${accessToken || supabaseAnonKey}`,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({ name: safeName, role, invite_allocation: profileRow.invite_allocation }),
      })
      console.log('[createProfile] update status:', updateRes.status)
    } else if (!res.ok) {
      const body = await res.text()
      console.error('[createProfile] insert failed:', res.status, body)
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
        await fetchProfile(session.user.id)
      }
      setLoading(false)
    }).catch(async () => {
      // If getSession itself throws, clear everything
      await supabase.auth.signOut().catch(() => {})
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session)
        setUser(session?.user ?? null)
        if (session?.user && !isSigningUp.current) {
          await fetchProfile(session.user.id)
        } else if (!session?.user) {
          setProfile(null)
          setProfileLoaded(false)
        }
        setLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const signUp = async (email, password, name, role = 'viewer') => {
    isSigningUp.current = true
    setProfileLoaded(false)

    try {
      console.log('[signUp] start:', email, 'name:', name, 'role:', role)
      const { data, error } = await supabase.auth.signUp({ email, password })
      console.log('[signUp] auth result:', { error: error?.message, userId: data?.user?.id, session: !!data?.session, identities: data?.user?.identities?.length })

      const alreadyRegistered =
        error && /already registered|already been registered|already exists/i.test(error.message)

      const fakeUser =
        !error && data?.user && (!data.user.identities || data.user.identities.length === 0)

      if (alreadyRegistered || fakeUser) {
        console.log('[signUp] existing user detected, signing in...')
        isSigningUp.current = false
        const result = await signIn(email, password)
        console.log('[signUp] signIn result:', { userId: result?.user?.id, profile: result?.profile?.name })

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
        console.log('[signUp] no session, trying auto sign-in...')
        await new Promise(resolve => setTimeout(resolve, 500))

        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        })

        if (signInError) {
          console.log('[signUp] auto sign-in failed:', signInError.message)
          isSigningUp.current = false
          throw new Error('Account created but email confirmation may be required. Please check your inbox and then sign in.')
        }

        activeUser = signInData?.user || activeUser
        activeSession = signInData?.session
      }

      if (activeUser) {
        await new Promise(resolve => setTimeout(resolve, 300))
        console.log('[signUp] creating profile for:', activeUser.id)
        const createdProfile = await createProfile(activeUser.id, email, name, role)
        console.log('[signUp] profile created:', createdProfile?.name)

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
      console.log('[signUp] done successfully')
      return { ...data, session: activeSession, user: activeUser, profile }
    } catch (err) {
      console.error('[signUp] error:', err.message)
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
      currentProfile = await fetchProfile(data.user.id)

      if (!currentProfile) {
        currentProfile = await createProfile(
          data.user.id,
          email,
          email.split('@')[0],
          'viewer'
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
