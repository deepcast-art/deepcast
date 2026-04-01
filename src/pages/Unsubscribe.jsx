import { Link } from 'react-router-dom'
import DeepcastLogo from '../components/DeepcastLogo'

export default function Unsubscribe() {
  return (
    <div className="min-h-screen bg-bg-page text-text dc-fade-in">
      <div className="mx-auto flex min-h-screen max-w-lg flex-col px-6 py-16">
        <Link to="/" className="mb-12 inline-block w-fit">
          <DeepcastLogo variant="ink" className="h-8" />
        </Link>
        <h1 className="font-serif-v3 text-2xl text-text sm:text-3xl tracking-tight">
          Screening invitation emails
        </h1>
        <p className="mt-6 font-body text-sm leading-relaxed text-text-muted">
          Deepcast sends private screening links when someone you know shares a film with you. These
          messages are not bulk marketing mail; each invitation is tied to a specific share.
        </p>
        <p className="mt-4 font-body text-sm leading-relaxed text-text-muted">
          If you do not want to receive further screening invitations at this email address, you can
          mark messages as spam in your inbox, or reply to the invitation and ask the sender to stop
          sharing to this address.
        </p>
        <p className="mt-4 font-body text-sm leading-relaxed text-text-muted">
          For account or privacy questions, contact the person who invited you or visit{' '}
          <Link to="/" className="text-accent underline-offset-2 hover:underline">
            deepcast.art
          </Link>
          .
        </p>
        <Link
          to="/"
          className="mt-10 inline-block font-sans text-[11px] uppercase tracking-[0.2em] text-accent transition-opacity hover:opacity-80"
        >
          Return home
        </Link>
      </div>
    </div>
  )
}
