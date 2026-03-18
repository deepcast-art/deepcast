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
        .single()

      if (error) {
        console.warn('Profile fetch failed:', error.message)
        setProfile(null)
      } else {
        setProfile(data)
      }
      setProfileLoaded(true)
      return data
    } catch (err) {
      console.error('Profile fetch error:', err)
      setProfile(null)
      setProfileLoaded(true)
      return null
    }
  }

  async function createProfile(userId, email, name, role) {
    const newProfile = {
      id: userId,
      email,
      name,
      role,
      invite_allocation: role === 'creator' ? 0 : 5,
    }

    const { error } = await supabase.from('users').insert(newProfile)
    if (error) {
      console.error('Profile insert failed:', error.message)
      throw error
    }

    setProfile(newProfile)
    setProfileLoaded(true)
    return newProfile
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
      const { data, error } = await supabase.auth.signUp({ email, password })

      // If user already exists in auth, sign them in and ensure profile exists
      if (error && error.message?.includes('already registered')) {
        isSigningUp.current = false
        const result = await signIn(email, password)

        // If they signed in but profile was auto-created as viewer, update to requested role
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

      // If no session returned (email confirmation required), try auto sign-in
      let activeUser = data.user
      if (!data.session && data.user) {
        await new Promise(resolve => setTimeout(resolve, 500))

        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        })

        if (signInError) {
          isSigningUp.current = false
          return { ...data, requiresEmailConfirmation: true }
        }

        activeUser = signInData?.user || data.user
      }

      // Create the profile — this runs in ALL cases where we have a user
      if (activeUser) {
        await createProfile(activeUser.id, email, name, role)

        // Best-effort: link existing invites
        void supabase
          .from('invites')
          .update({ status: 'signed_up' })
          .eq('recipient_email', email)
          .eq('status', 'watched')

        // Best-effort: attach invites sent before signup
        void supabase
          .from('invites')
          .update({ sender_id: activeUser.id, sender_name: name, sender_email: email })
          .eq('sender_email', email)
          .is('sender_id', null)
      }

      isSigningUp.current = false
      return data
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
      currentProfile = await fetchProfile(data.user.id)

      // If auth user exists but no profile row, create one
      if (!currentProfile) {
        try {
          currentProfile = await createProfile(
            data.user.id,
            email,
            email.split('@')[0],
            'viewer'
          )
        } catch (e) {
          console.error('Auto-create profile on login failed:', e.message)
        }
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
