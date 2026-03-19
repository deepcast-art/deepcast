import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Landing() {
  const [networkCount, setNetworkCount] = useState(null)

  useEffect(() => {
    let isMounted = true

    async function loadNetworkCount() {
      const { count, error } = await supabase
        .from('users')
        .select('id', { count: 'exact', head: true })

      if (!error && isMounted) {
        setNetworkCount(count ?? 0)
      }
    }

    loadNetworkCount()

    return () => {
      isMounted = false
    }
  }, [])


  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="max-w-2xl mx-auto text-center">
        <p className="text-accent text-sm tracking-[0.3em] uppercase mb-8 animate-fade-in">
          Deepcast
        </p>

        <h1 className="text-3xl sm:text-5xl font-display leading-tight tracking-tight mb-8 animate-fade-in animate-delay-200">
          Some films are not for everyone.
          <br />
          <span className="text-text-muted">Just the right ones.</span>
        </h1>
        <p className="text-text-muted text-sm tracking-[0.2em] uppercase mb-8 animate-fade-in animate-delay-300">
          Depth is the new viral
        </p>

        <p className="text-text-muted text-lg font-light max-w-md mx-auto mb-10 animate-fade-in animate-delay-300">
          A private screening platform where films spread through personal invitation.
          No public catalogue. No algorithm. Just trust.
        </p>

        <div className="animate-fade-in animate-delay-500">
          <div className="w-px h-16 bg-border mx-auto mb-8" />
        </div>
      </div>

      <div className="fixed bottom-8 left-0 right-0 text-center animate-fade-in animate-delay-600">
        <Link
          to="/login"
          className="text-text-muted text-xs hover:text-accent transition-colors duration-300"
        >
          Are you a filmmaker?
        </Link>
      </div>
    </div>
  )
}
