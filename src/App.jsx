import { lazy, Suspense, useEffect, useState } from 'react'
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from './lib/auth'
import { supabase } from './lib/supabase'

const InviteScreening = lazy(() => import('./pages/InviteScreening.jsx'))
const Signup = lazy(() => import('./pages/Signup.jsx'))
const Login = lazy(() => import('./pages/Login.jsx'))
const Profile = lazy(() => import('./pages/Profile.jsx'))
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'))
const Upload = lazy(() => import('./pages/Upload.jsx'))
const NetworkMap = lazy(() => import('./pages/NetworkMap.jsx'))
const TeamJoin = lazy(() => import('./pages/TeamJoin.jsx'))
const Unsubscribe = lazy(() => import('./pages/Unsubscribe.jsx'))
const ResetPassword = lazy(() => import('./pages/ResetPassword.jsx'))

function RouteFallback({ inverse = false }) {
  return (
    <div
      className={`min-h-screen flex items-center justify-center dc-fade-in ${
        inverse ? 'theme-inverse' : 'bg-bg-page'
      }`}
    >
      <div
        className="w-6 h-6 border-[0.5px] border-accent border-t-transparent rounded-full animate-spin"
        aria-hidden
      />
    </div>
  )
}

/** If auth is in password-recovery mode, always show /reset-password (hash may already be consumed). */
function RecoveryRouteSync() {
  const { isRecovery } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()

  useEffect(() => {
    if (isRecovery && pathname !== '/reset-password') {
      navigate('/reset-password', { replace: true })
    }
  }, [isRecovery, pathname, navigate])

  return null
}

function ProtectedRoute({ children, requiredRole, requiredRoles }) {
  const { user, profile, loading, profileLoaded } = useAuth()

  // Still loading auth or profile
  if (loading || (user && !profileLoaded)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  // Profile was fetched but doesn't exist — send to signup
  if (profileLoaded && !profile) return <Navigate to="/signup" replace />

  if (requiredRoles?.length && !requiredRoles.includes(profile.role)) {
    return <Navigate to="/profile" replace />
  }

  if (requiredRole && profile.role !== requiredRole) return <Navigate to="/profile" replace />

  return children
}

/**
 * Gates viewer-only routes behind "has shared at least once". A viewer who has never sent an
 * invite is bounced to their screening's share form; everyone else passes through untouched.
 *
 * Safety: ONLY viewers are ever gated. Non-viewers (creators / team_members) resolve to
 * `allowed` synchronously with no spinner and are never redirected. For viewers we wait for the
 * async "ever shared" check to finish before deciding, so a viewer who HAS shared is never
 * flashed/bounced. Must wrap a ProtectedRoute (which guarantees `profile` exists).
 */
function ViewerShareGate({ children }) {
  const { profile } = useAuth()
  const isViewer = profile?.role === 'viewer'
  // Non-viewers: decided immediately, never gated. Viewers: undecided until the check resolves.
  const [gate, setGate] = useState(() =>
    isViewer ? { checked: false, allowed: false, to: null } : { checked: true, allowed: true, to: null }
  )

  useEffect(() => {
    // Non-viewers are decided by the initializer; never gated, no setState, no spinner.
    if (!isViewer) return
    let cancelled = false
    ;(async () => {
      // "Ever shared ≥1" signal: any invite this viewer has sent, across all films.
      const { count } = await supabase
        .from('invites')
        .select('id', { count: 'exact', head: true })
        .eq('sender_id', profile.id)
      if (cancelled) return
      if (count && count > 0) {
        setGate({ checked: true, allowed: true, to: null })
        return
      }
      // Never shared → send them to their share form. Target = most-recent received invite token.
      let to = '/profile' // safest minimal fallback when no invite token exists.
      const email = (profile.email || '').trim()
      if (email) {
        const { data } = await supabase
          .from('invites')
          .select('token')
          .ilike('recipient_email', email)
          .order('created_at', { ascending: false })
          .limit(1)
        const token = data?.[0]?.token
        if (token) to = `/i/${token}`
      }
      if (!cancelled) setGate({ checked: true, allowed: false, to })
    })()
    return () => {
      cancelled = true
    }
  }, [isViewer, profile?.id, profile?.email])

  if (!gate.checked) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }
  if (!gate.allowed) {
    const state = gate.to?.startsWith('/i/') ? { showShare: true } : undefined
    return <Navigate to={gate.to} replace state={state} />
  }
  return children
}

export default function App() {
  return (
    <>
      <RecoveryRouteSync />
    <Routes>
      <Route
        path="/"
        element={
          <Suspense fallback={<RouteFallback />}>
            <Login />
          </Suspense>
        }
      />
      <Route
        path="/i/:token"
        element={
          <Suspense fallback={<RouteFallback />}>
            <InviteScreening />
          </Suspense>
        }
      />
      <Route
        path="/signup"
        element={
          <Suspense fallback={<RouteFallback />}>
            <Signup />
          </Suspense>
        }
      />
      <Route
        path="/login"
        element={
          <Suspense fallback={<RouteFallback />}>
            <Login />
          </Suspense>
        }
      />
      <Route
        path="/reset-password"
        element={
          <Suspense fallback={<RouteFallback />}>
            <ResetPassword />
          </Suspense>
        }
      />
      <Route
        path="/team/join"
        element={
          <Suspense fallback={<RouteFallback />}>
            <TeamJoin />
          </Suspense>
        }
      />
      <Route
        path="/unsubscribe"
        element={
          <Suspense fallback={<RouteFallback />}>
            <Unsubscribe />
          </Suspense>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <Suspense fallback={<RouteFallback />}>
              <Profile />
            </Suspense>
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute
            requiredRoles={['creator', 'team_member', 'viewer']}
          >
            <ViewerShareGate>
              <Suspense fallback={<RouteFallback />}>
                <Dashboard />
              </Suspense>
            </ViewerShareGate>
          </ProtectedRoute>
        }
      />
      <Route
        path="/upload"
        element={
          <ProtectedRoute requiredRole="creator">
            <Suspense fallback={<RouteFallback />}>
              <Upload />
            </Suspense>
          </ProtectedRoute>
        }
      />
      <Route
        path="/network"
        element={
          <ProtectedRoute>
            <ViewerShareGate>
              <Suspense fallback={<RouteFallback />}>
                <NetworkMap />
              </Suspense>
            </ViewerShareGate>
          </ProtectedRoute>
        }
      />
    </Routes>
    </>
  )
}
