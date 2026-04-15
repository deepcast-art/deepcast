import { Link } from 'react-router-dom'
import NetworkGraph from '../../components/NetworkGraph'

export default function DesktopPassItOn({
  graphLayout,
  showPostFilm,
  passItOnLayerActive,
  slotsRemaining,
  sentLetters,
  letterError,
  letterSuccess,
  letterRecipientFirst,
  setLetterRecipientFirst,
  letterRecipientLast,
  setLetterRecipientLast,
  letterNote,
  setLetterNote,
  letterRecipientEmail,
  setLetterRecipientEmail,
  letterSenderName,
  setLetterSenderName,
  letterSenderEmail,
  setLetterSenderEmail,
  newPassword,
  setNewPassword,
  letterSending,
  handleSendLetter,
  isInviteRecipientSession,
  invite,
  user,
  signOut,
  setCurrentView,
  resumeFilm,
}) {
  return (
    /* ── Desktop (wide): resume bar + two-column diptych ── */
    <div className="hidden lg:flex w-full h-full flex-col">

      {/* Full-width Resume bar — only shown mid-film, not post-film */}
      {!showPostFilm && (
        <button
          type="button"
          onClick={resumeFilm}
          className="flex w-full shrink-0 items-center justify-center gap-3 border-b border-[#b1a180]/25 bg-[#080c18]/95 py-3.5 backdrop-blur-md transition-colors hover:bg-[#b1a180]/10"
        >
          <svg className="h-2.5 w-2.5 shrink-0 fill-[#b1a180]" viewBox="0 0 24 24" aria-hidden>
            <path d="M8 5v14l11-7z" />
          </svg>
          <span className="font-sans text-[10px] font-medium uppercase tracking-[0.35em] text-[#b1a180]">
            Resume Film
          </span>
        </button>
      )}

      <div className="flex min-h-0 flex-1">
        {/* Left column — context + map */}
        <div className="flex min-h-0 w-full shrink-0 flex-col justify-start gap-8 border-b border-[#b1a180]/20 px-8 py-28 lg:w-[40%] lg:min-h-0 lg:max-h-[100dvh] lg:justify-center lg:overflow-y-auto lg:border-b-0 lg:border-r lg:py-12">
          <div className="flex flex-col gap-2">
            <span className="font-sans text-[10px] uppercase tracking-[0.3em] text-[#b1a180]/90">
              {slotsRemaining > 0
                ? `${slotsRemaining} share${slotsRemaining !== 1 ? 's' : ''} remaining`
                : 'All shares sent'}
            </span>
            <h2 className="font-serif-v3 text-4xl md:text-5xl text-[#dddddd] tracking-tight">
              {showPostFilm ? 'Thank you for watching.' : 'Pass it on.'}
            </h2>
            {showPostFilm && user && (
              <Link
                to="/dashboard"
                className="font-sans text-[10px] uppercase tracking-[0.25em] text-[#b1a180] transition-opacity hover:opacity-80"
              >
                Go to dashboard
              </Link>
            )}
            <p className="font-body font-light text-[13px] text-[#dddddd]/70 leading-relaxed max-w-md">
              Who <span className="italic">needs</span> to see this? Not anyone and everyone — just the few
              people you know will resonate deeply.
            </p>
            <p className="font-body font-light text-[13px] text-[#dddddd]/55 leading-relaxed max-w-md">
              If you choose not to share, the film&apos;s journey ends with you. It was carried this far by
              people who believed in it.
            </p>
          </div>
          {graphLayout && (
            <div className="mt-2 flex w-full flex-1 flex-col min-h-[min(42vh,520px)] max-h-[min(68vh,900px)] lg:max-h-[min(62dvh,820px)]">
              <span className="mb-3 font-sans text-[9px] uppercase tracking-[0.3em] text-[#dddddd]/40">
                Invitation path
              </span>
              <div className="flex min-h-0 flex-1 overflow-hidden rounded border border-[#4a5580]/30">
                <NetworkGraph
                  fillHeight
                  pannable
                  transparentSurface
                  nodesData={graphLayout.nodesData}
                  linksData={graphLayout.linksData}
                  viewBoxH={graphLayout.viewBoxH}
                  viewBoxW={graphLayout.viewBoxW}
                  ringRadii={graphLayout.ringRadii}
                  sectionLabels={graphLayout.sectionLabels}
                  rootNode={graphLayout.rootNode}
                  defaultActiveNodes={graphLayout.defaultActiveNodes}
                  defaultActiveLinks={graphLayout.defaultActiveLinks}
                  showLegend={false}
                />
              </div>
            </div>
          )}
        </div>

        {/* Vertical amber divider */}
        <div className="w-[0.5px] self-stretch bg-[#b1a180] opacity-20 flex-shrink-0" />

        {/* Right column (60%) — letter card */}
        <div className="w-[60%] h-full overflow-y-auto panel-scroll flex flex-col justify-center items-center px-6 py-8">
          <div className="relative w-full max-w-3xl p-4 overflow-hidden" style={{
            background: 'linear-gradient(168deg, #e8e2d6 0%, #ddd8cc 30%, #d5cfc3 60%, #ddd7cb 100%)',
            borderRadius: '8px',
            boxShadow: '0 2px 30px rgba(0,0,0,0.25), 0 0 0 0.5px rgba(180,170,150,0.4)',
          }}>
            <div className="absolute inset-0 pointer-events-none" style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 300 300' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='paper'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='5' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23paper)'/%3E%3C/svg%3E")`,
              opacity: 0.08, mixBlendMode: 'multiply',
            }} />

            <div className="relative z-10 flex flex-col items-center text-center px-4">
              <div className="flex flex-col items-center gap-2 mb-4 mt-6">
                <h3 className="font-sans text-[10px] uppercase tracking-[0.45em] text-[#2a2a2a]/65">A Letter of Invitation</h3>
                <div className="h-[12px] w-[1px] bg-[#2a2a2a]/30" />
                <p className="font-sans text-[9px] uppercase tracking-[0.35em] text-[#2a2a2a]/55">
                  Invitation {String(sentLetters.length + 1).padStart(2, '0')}
                </p>
              </div>

              {letterError && (
                <p className="mb-4 w-full text-[12px] font-sans text-[#b84233] bg-[#b84233]/10 border border-[#b84233]/25 px-4 py-2">{letterError}</p>
              )}
              {letterSuccess && (
                <p className="mb-4 w-full text-[12px] font-sans text-[#5b8a5e] bg-[#5b8a5e]/10 border border-[#5b8a5e]/25 px-4 py-2">{letterSuccess}</p>
              )}

              {slotsRemaining > 0 ? (
                <>
                  <div className="flex flex-col items-center w-full relative border-[0.5px] border-[#2a2a2a]/15 p-6">
                    <div className="font-serif-v3 text-lg leading-snug w-full max-w-xl text-[#2a2a2a]">
                      <div className="flex flex-wrap justify-center items-end gap-x-4 gap-y-1 mb-3">
                        <span className="italic">Dear</span>
                        <input type="text" placeholder="First Name" value={letterRecipientFirst} onChange={(e) => setLetterRecipientFirst(e.target.value)} className="w-[120px] bg-transparent border-b-[0.5px] border-[#2a2a2a]/30 text-center focus:outline-none text-[#2a2a2a] placeholder-[#2a2a2a]/30" />
                        <input type="text" placeholder="Last Name" value={letterRecipientLast} onChange={(e) => setLetterRecipientLast(e.target.value)} className="w-[120px] bg-transparent border-b-[0.5px] border-[#2a2a2a]/30 text-center focus:outline-none text-[#2a2a2a] placeholder-[#2a2a2a]/30" />
                        <span>,</span>
                      </div>
                      <div className="mb-2">
                        <textarea rows={2} placeholder="Write your note here. Tell them why this film made you think of them specifically..." value={letterNote} onChange={(e) => setLetterNote(e.target.value)} className="w-full bg-transparent border-none italic text-center focus:outline-none resize-none placeholder-[#2a2a2a]/30 leading-relaxed text-base text-[#2a2a2a]" />
                      </div>
                    </div>
                    <div className="flex flex-wrap justify-center items-end gap-x-4 gap-y-1 mt-1 font-serif-v3 text-lg text-[#2a2a2a]">
                      <span>With intention,</span>
                      <input type="text" placeholder="Your Name" value={letterSenderName} onChange={(e) => setLetterSenderName(e.target.value)} className="w-[160px] bg-transparent border-b-[0.5px] border-[#2a2a2a]/30 text-center focus:outline-none text-[#2a2a2a] placeholder-[#2a2a2a]/30" />
                    </div>
                    {!isInviteRecipientSession && (
                      <div className="flex flex-col gap-1 w-full max-w-[320px] text-center mt-3">
                        <label className="font-sans text-[9px] uppercase tracking-[0.2em] text-[#2a2a2a]/60">Your Email</label>
                        <input type="email" placeholder="your@email.com" value={letterSenderEmail} onChange={(e) => setLetterSenderEmail(e.target.value)} className="w-full text-center bg-transparent border-b-[0.5px] border-[#2a2a2a]/30 pb-1 text-[13px] font-sans text-[#2a2a2a] placeholder-[#2a2a2a]/30 focus:outline-none transition-colors rounded-none" />
                      </div>
                    )}
                    {!isInviteRecipientSession && (
                      <div className="flex flex-col gap-1 w-full max-w-[320px] text-center mt-3">
                        <label className="font-sans text-[9px] uppercase tracking-[0.2em] text-[#2a2a2a]/60">Create Password</label>
                        <input type="password" placeholder="Min. 8 characters" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full text-center bg-transparent border-b-[0.5px] border-[#2a2a2a]/30 pb-1 text-[13px] font-sans text-[#2a2a2a] placeholder-[#2a2a2a]/30 focus:outline-none transition-colors rounded-none" />
                      </div>
                    )}
                    <div className="flex flex-col gap-1 w-full max-w-[320px] text-center mt-4">
                      <label className="font-sans text-[9px] uppercase tracking-[0.2em] text-[#2a2a2a]/60">Deliver To</label>
                      <input type="email" placeholder="Their Email Address" value={letterRecipientEmail} onChange={(e) => setLetterRecipientEmail(e.target.value)} className="w-full text-center bg-transparent border-b-[0.5px] border-[#2a2a2a]/30 pb-1 text-[13px] font-sans text-[#2a2a2a] placeholder-[#2a2a2a]/30 focus:outline-none transition-colors rounded-none" />
                    </div>
                  </div>

                  <div className="w-[80px] h-[1px] bg-gradient-to-r from-transparent via-[#2a2a2a]/30 to-transparent my-3" />

                  <div className="flex flex-col items-center gap-2 w-full max-w-[320px]">
                    <button type="button" onClick={handleSendLetter} disabled={letterSending} className="mt-6 w-full py-3 bg-[#b1a180] hover:bg-[#978768] text-[#dddddd] font-sans text-[11px] tracking-[0.3em] uppercase transition-colors duration-[300ms] rounded-none mb-6 disabled:opacity-40">
                      {letterSending ? 'Sending…' : 'Seal & Send'}
                    </button>
                    {passItOnLayerActive && (
                      <p className="text-center font-sans text-[9px] uppercase tracking-[0.15em] text-[#2a2a2a]/40 -mt-4 mb-4">
                        After sending, you&apos;ll go to your dashboard.
                      </p>
                    )}
                  </div>

                  {passItOnLayerActive && !isInviteRecipientSession && user && (
                    <div className="flex flex-col items-center gap-2 border-t border-[#2a2a2a]/10 pt-4 mt-2 text-center w-full max-w-[320px]">
                      <p className="font-sans text-[10px] leading-relaxed text-[#2a2a2a]/50">
                        Signed in as a different email. Sign out to use{' '}
                        <span className="text-[#2a2a2a]/70">{invite?.recipient_email}</span>.
                      </p>
                      <button type="button" onClick={() => void signOut()} className="font-sans text-[10px] uppercase tracking-[0.2em] text-[#2a2a2a]/50 hover:text-[#2a2a2a]">Sign out</button>
                    </div>
                  )}
                  {passItOnLayerActive && user && (
                    <button
                      type="button"
                      onClick={() => setCurrentView('dashboard')}
                      className="mt-2 w-full max-w-[320px] py-2 font-sans text-[9px] uppercase tracking-[0.25em] text-[#2a2a2a]/40 hover:text-[#2a2a2a]/70 transition-colors"
                    >
                      Skip — Go to dashboard
                    </button>
                  )}
                </>
              ) : (
                <p className="font-serif-v3 text-2xl text-[#2a2a2a]/80 my-10">All invitations have been sent.</p>
              )}
            </div>
          </div>
        </div>

      </div>{/* end two-column body */}
    </div>/* end desktop flex-col */
  )
}
