import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './lib/auth'
import Landing from './pages/Landing'
import InviteScreening from './pages/InviteScreening'
import Signup from './pages/Signup'
import Login from './pages/Login'
import Profile from './pages/Profile'
import Dashboard from './pages/Dashboard'
import Upload from './pages/Upload'
import NetworkMap from './pages/NetworkMap'
import PostShare from './pages/PostShare'

function ProtectedRoute({ children, requiredRole }) {
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

  if (requiredRole && profile.role !== requiredRole) return <Navigate to="/profile" replace />

  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/i/:token" element={<InviteScreening />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/login" element={<Login />} />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <Profile />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute requiredRole="creator">
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/upload"
        element={
          <ProtectedRoute requiredRole="creator">
            <Upload />
          </ProtectedRoute>
        }
      />
      <Route
        path="/network"
        element={
          <ProtectedRoute>
            <NetworkMap />
          </ProtectedRoute>
        }
      />
      <Route
        path="/impact"
        element={
          <ProtectedRoute>
            <PostShare />
          </ProtectedRoute>
        }
      />
    </Routes>
  )
}
