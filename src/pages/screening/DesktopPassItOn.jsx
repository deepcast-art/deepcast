import { Link } from 'react-router-dom'
import NetworkGraph from '../../components/NetworkGraph'

export default function DesktopPassItOn({
  graphLayout,
  showPostFilm,
  passItOnLayerActive,
  slotsRemaining,
  invitationsLabel,
  letterError,
  letterSuccess,
  letterRecipients,
  updateLetterRecipient,
  addLetterRecipient,
  removeLetterRecipient,
  canAddRecipient,
  letterSending,
  handleSendLetter,
  user,
  goToDashboard,
  resumeFilm,
  hasSentInvite,
  /** Gate-bounce arrival: a returning viewer who must share once to reach the dashboard. */
  gateNotice = false,
}) {
  return (
    /* ── Desktop (wide): resume bar + two-column diptych ── */
    <div className="hidden lg:flex w-full h-full flex-col">

      {/* Full-width Resume bar — only shown mid-film, not post-film */}
      {!showPostFilm && (
        <button
          type="button"
          onClick={resumeFilm}
          className="flex w-full shrink-0 items-center justify-center gap-3 border-b border-[#b1a180]/25 bg-[#080c18]/95 py-3.5 backdrop-blur-md transition-colors hover:bg-[#b1a180]/10 slow-fade-text"
        >
          <svg className="h-4 w-4 shrink-0 fill-[#b1a180]" viewBox="0 0 24 24" aria-hidden>
            <path d="M8 5v14l11-7z" />
          </svg>
          <span className="font-sans text-[10px] font-medium uppercase tracking-[0.35em] text-[#dddddd]/70">
            Resume Film
          </span>
        </button>
      )}

      <div className="flex min-h-0 flex-1">
        {/* Left column — context + map */}
        <div className="flex w-[40%] h-full overflow-y-auto panel-scroll flex-col justify-center px-10 py-24 gap-8">
          <div className="flex flex-col gap-4">
            <h2
              className="font-serif-v3 text-5xl lg:text-6xl text-[#dddddd] font-light tracking-tight italic"
              style={{ textShadow: '0 0 24px rgba(177,161,128,0.35), 0 2px 16px rgba(0,0,0,0.4)' }}
            >
              Pass it on. Make an impact.
            </h2>
            {gateNotice && (
              <p className="font-serif-v3 text-[15px] italic leading-snug text-[#b1a180]">
                Share this film with one person to open your dashboard.
              </p>
            )}
            {showPostFilm && user && hasSentInvite && (
              <Link
                to="/dashboard"
                className="font-sans text-[10px] uppercase tracking-[0.25em] text-[#b1a180] transition-opacity hover:opacity-80"
              >
                Go to dashboard
              </Link>
            )}
            <p className="font-body font-light text-[13px] text-[#dddddd]/70 leading-relaxed max-w-md">
              Who <span className="italic">needs</span> to see this? Not anyone and everyone. Just the few
              special people you know will resonate deeply.
            </p>
            <p className="font-body font-light text-[13px] text-[#dddddd]/70 leading-relaxed max-w-md">
              If you choose not to share, the film&apos;s journey ends with you. That&apos;s ok — but know
              that it was carried this far by people who believed in it.
            </p>
          </div>
          {graphLayout && (
            <div className="mt-2 flex w-full flex-1 flex-col min-h-[min(42vh,520px)] max-h-[min(68vh,900px)] lg:max-h-[min(62dvh,820px)]">
              <span className="mb-3 font-sans text-[9px] uppercase tracking-[0.3em] text-[#dddddd]/40">
                Your network impact
              </span>
              <div className="flex min-h-0 flex-1 overflow-hidden rounded bg-[#121a33] border border-[#4a5580]/40">
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
        <div className="flex w-[60%] min-h-0 h-full flex-col items-center px-6 py-6 overflow-hidden">
          <div className="relative flex w-full max-w-3xl min-h-0 flex-1 flex-col" style={{
            background: 'linear-gradient(168deg, #e8e2d6 0%, #ddd8cc 30%, #d5cfc3 60%, #ddd7cb 100%)',
            borderRadius: '8px',
            boxShadow: '0 2px 30px rgba(0,0,0,0.25), 0 0 0 0.5px rgba(180,170,150,0.4)',
          }}>
            {/* Paper-noise texture */}
            <div className="absolute inset-0 pointer-events-none rounded-[8px] overflow-hidden" style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 300 300' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='paper'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='5' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23paper)'/%3E%3C/svg%3E")`,
              opacity: 0.08, mixBlendMode: 'multiply',
            }} />
            {/* Inner vignette */}
            <div className="absolute inset-0 pointer-events-none rounded-[8px]"
                 style={{ boxShadow: 'inset 0 0 60px rgba(0,0,0,0.06), inset 0 0 120px rgba(0,0,0,0.03)' }} />

            <div className="relative z-10 flex min-h-0 flex-1 flex-col items-center gap-4 overflow-y-auto panel-scroll px-6 py-6 text-center">
              <div className="flex flex-col items-center gap-2">
                <h3 className="font-sans text-[10px] uppercase tracking-[0.4em] text-[#2a2a2a]">
                  A Letter of Invitation
                </h3>
                <div className="h-[12px] w-[1px] bg-[#2a2a2a]/30" />
              </div>

              {letterError && (
                <p className="w-full max-w-xl text-[12px] font-sans text-[#b84233] bg-[#b84233]/10 border border-[#b84233]/25 px-4 py-2">{letterError}</p>
              )}
              {letterSuccess && (
                <p className="w-full max-w-xl text-[12px] font-sans text-[#5b8a5e] bg-[#5b8a5e]/10 border border-[#5b8a5e]/25 px-4 py-2">{letterSuccess}</p>
              )}

              {slotsRemaining > 0 ? (
                <div className="flex w-full flex-1 flex-col items-center gap-4">
                  <div className="flex flex-col items-center w-full max-w-xl gap-3 relative bg-[#2a2a2a]/8 border-[0.5px] border-[#2a2a2a]/15 px-5 py-5">
                    {/* Every recipient is the same full letter: Dear [name], note, Deliver To. */}
                    {letterRecipients.map((r, i) => (
                      <div key={i} className="relative flex w-full flex-col items-center gap-3">
                        {i > 0 && (
                          <div className="my-2 h-[1px] w-[120px] bg-gradient-to-r from-transparent via-[#2a2a2a]/30 to-transparent" />
                        )}
                        {i > 0 && (
                          <button type="button" onClick={() => removeLetterRecipient(i)} aria-label={`Remove recipient ${i + 1}`} className="absolute right-0 top-4 px-1 text-base leading-none text-[#2a2a2a]/40 hover:text-[#2a2a2a]/70 transition-colors">&times;</button>
                        )}
                        <div className="font-serif-v3 text-base lg:text-lg leading-snug w-full text-[#2a2a2a]">
                          <div className="flex flex-wrap justify-center items-end gap-x-3 gap-y-1 mb-2">
                            <span className="italic">Dear</span>
                            <input type="text" placeholder="First Name" aria-label={`Recipient ${i + 1} first name`} value={r.first} onChange={(e) => updateLetterRecipient(i, 'first', e.target.value)} className="min-w-[110px] max-w-[180px] flex-1 bg-transparent border-b-[0.5px] border-[#2a2a2a]/30 text-center focus:outline-none focus:border-[#2a2a2a] text-[#2a2a2a] placeholder-[#2a2a2a]/30 transition-colors" autoComplete="given-name" />
                            <input type="text" placeholder="Last Name" aria-label={`Recipient ${i + 1} last name`} value={r.last || ''} onChange={(e) => updateLetterRecipient(i, 'last', e.target.value)} className="min-w-[110px] max-w-[180px] flex-1 bg-transparent border-b-[0.5px] border-[#2a2a2a]/30 text-center focus:outline-none focus:border-[#2a2a2a] text-[#2a2a2a] placeholder-[#2a2a2a]/30 transition-colors" autoComplete="family-name" />
                            <span>,</span>
                          </div>
                          <textarea rows={2} placeholder="Write your note here. Tell them why this film made you think of them specifically..." aria-label={`Personal note for recipient ${i + 1}`} value={r.note || ''} onChange={(e) => updateLetterRecipient(i, 'note', e.target.value)} className="w-full bg-transparent border-none text-center focus:outline-none resize-none placeholder-[#2a2a2a]/30 leading-relaxed text-sm lg:text-base text-[#2a2a2a]" />
                        </div>
                        <div className="flex flex-col gap-1 w-full max-w-[340px] text-center">
                          <label className="font-sans text-[9px] uppercase tracking-[0.2em] text-[#2a2a2a]/60">Deliver To</label>
                          <input type="email" placeholder="Their Email Address" aria-label={`Recipient ${i + 1} email`} value={r.email} onChange={(e) => updateLetterRecipient(i, 'email', e.target.value)} className="w-full text-center bg-transparent border-b-[0.5px] border-[#2a2a2a]/30 pb-1 text-[13px] font-sans text-[#2a2a2a] placeholder-[#2a2a2a]/30 focus:outline-none focus:border-[#2a2a2a] transition-colors rounded-none" />
                        </div>
                      </div>
                    ))}

                    {canAddRecipient && (
                      <button type="button" onClick={addLetterRecipient} className="font-sans text-[9px] uppercase tracking-[0.2em] text-[#2a2a2a]/45 hover:text-[#2a2a2a]/75 transition-colors">
                        + add another
                      </button>
                    )}
                  </div>

                  <p className="font-sans text-[9px] uppercase tracking-[0.22em] text-[#2a2a2a]/55">
                    {invitationsLabel}
                  </p>

                  <div className="w-[80px] h-[1px] bg-gradient-to-r from-transparent via-[#2a2a2a]/30 to-transparent" />

                  <button type="button" onClick={handleSendLetter} disabled={letterSending} className="w-full max-w-[340px] py-3 bg-[#b1a180] hover:bg-[#978768] text-[#dddddd] font-sans text-[11px] tracking-[0.3em] uppercase transition-colors duration-[300ms] rounded-none disabled:opacity-40">
                    {letterSending ? 'Sending…' : letterRecipients.length > 1 ? 'Share invitations' : 'Share invitation'}
                  </button>
                </div>
              ) : (
                <p className="font-serif-v3 text-2xl text-[#2a2a2a]/80 my-10">All invitations have been sent.</p>
              )}

              {/* Outside the slots ternary: a viewer who has already shared (incl. all slots used)
                  must always keep a path to the dashboard. */}
              {passItOnLayerActive && user && hasSentInvite && (
                <button
                  type="button"
                  onClick={goToDashboard}
                  className="w-full max-w-[340px] py-2 font-sans text-[9px] uppercase tracking-[0.25em] text-[#2a2a2a]/40 hover:text-[#2a2a2a]/70 transition-colors"
                >
                  Skip — Go to dashboard
                </button>
              )}
            </div>
          </div>
        </div>

      </div>{/* end two-column body */}
    </div>/* end desktop flex-col */
  )
}
