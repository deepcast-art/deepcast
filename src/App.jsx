import { lazy, Suspense, useEffect } from 'react'
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from './lib/auth'

// const Landing = lazy(() => import('./pages/Landing.jsx'))
const InviteScreening = lazy(() => import('./pages/InviteScreening.jsx'))
const Signup = lazy(() => import('./pages/Signup.jsx'))
const Login = lazy(() => import('./pages/Login.jsx'))
const Profile = lazy(() => import('./pages/Profile.jsx'))
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'))
const Upload = lazy(() => import('./pages/Upload.jsx'))
const NetworkMap = lazy(() => import('./pages/NetworkMap.jsx'))
const PostShare = lazy(() => import('./pages/PostShare.jsx'))
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

export default function App() {
  return (
    <>
      <RecoveryRouteSync />
    <Routes>
      {/* Landing page commented out — Login is now the home page
      <Route
        path="/landing"
        element={
          <Suspense fallback={<RouteFallback />}>
            <Landing />
          </Suspense>
        }
      />
      */}
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
            <Suspense fallback={<RouteFallback />}>
              <Dashboard />
            </Suspense>
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
            <Suspense fallback={<RouteFallback />}>
              <NetworkMap />
            </Suspense>
          </ProtectedRoute>
        }
      />
      <Route
        path="/impact"
        element={
          <ProtectedRoute>
            <Suspense fallback={<RouteFallback />}>
              <PostShare />
            </Suspense>
          </ProtectedRoute>
        }
      />
    </Routes>
    </>
  )
}
