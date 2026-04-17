import NetworkGraph from '../../components/NetworkGraph'

export default function MobilePassItOn({
  graphLayout,
  narrowPausePassItOn,
  passItOnLayerActive,
  slotsRemaining,
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
    <div className="lg:hidden flex h-full min-h-0 w-full flex-1 flex-col bg-[#080c18] landscape:flex-row landscape:max-h-[100dvh] landscape:overflow-hidden">

      {/* ── PORTRAIT: Resume bar ── */}
      {narrowPausePassItOn && (
        <button
          type="button"
          onClick={resumeFilm}
          className="landscape:hidden flex w-full shrink-0 items-center justify-center gap-3 py-4.5 bg-[#080c18]/90 border-b border-[#b1a180]/20 slow-fade-text touch-manipulation"
        >
          <svg className="h-4 w-4 shrink-0 fill-[#b1a180]" viewBox="0 0 24 24" aria-hidden>
            <path d="M8 5v14l11-7z" />
          </svg>
          <span className="font-['DM_Sans',sans-serif] text-[11px] uppercase tracking-[0.3em] text-[#dddddd]/70">
            Resume Film
          </span>
        </button>
      )}

      {/* ── LANDSCAPE: Full-width resume bar across the top ── */}
      {narrowPausePassItOn && (
        <div className="portrait:hidden landscape:block shrink-0 border-b border-[#b1a180]/20 bg-[#080c18]/90 w-full">
          <button
            type="button"
            onClick={resumeFilm}
            className="flex w-full items-center justify-center gap-3 py-4 touch-manipulation slow-fade-text"
          >
            <svg className="h-4 w-4 shrink-0 fill-[#b1a180]" viewBox="0 0 24 24" aria-hidden>
              <path d="M8 5v14l11-7z" />
            </svg>
            <span className="font-['DM_Sans',sans-serif] text-[10px] uppercase tracking-[0.3em] text-[#dddddd]/70">
              Resume Film
            </span>
          </button>
        </div>
      )}

      {/* ── LANDSCAPE: Two-column diptych ── */}
      <div className="portrait:hidden landscape:flex landscape:flex-row landscape:flex-1 landscape:min-h-0 landscape:overflow-hidden">
        {/* Left col — heading + cautionary + graph */}
        <div className="w-[38%] shrink-0 h-full min-h-0 overflow-y-auto panel-scroll px-5 py-3 border-r border-[#b1a180]/15 flex flex-col">
          <h2
            className="font-serif-v3 text-xl text-[#dddddd] font-light italic mb-2"
            style={{ textShadow: '0 0 24px rgba(177,161,128,0.35), 0 2px 16px rgba(0,0,0,0.4)' }}
          >
            Pass it on.
          </h2>
          <p className="font-serif-v3 text-[12px] italic leading-snug text-[#dddddd]/60 mb-3">
            If you choose not to share, the film&apos;s journey ends with you. That&apos;s ok — but know
            that it was carried this far by people who believed in it.
          </p>
          {graphLayout && (
            <div className="flex-1 min-h-0 w-full overflow-hidden rounded bg-[#121a33] border-[0.5px] border-[#4a5580]/40 shadow-2xl touch-manipulation">
              <NetworkGraph
                fillHeight
                pannable
                transparentSurface
                interactiveZoom
                softTouchInteraction
                edgeScrollFades
                edgeFadeColor="#080c18"
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
          )}
        </div>

        {/* Right col — compact letter card */}
        <div className="w-[62%] h-full min-h-0 overflow-y-auto panel-scroll px-4 py-2 flex items-center justify-center">
          <div
            className="relative w-full p-4 overflow-hidden"
            style={{
              background: 'linear-gradient(168deg, #e8e2d6 0%, #ddd8cc 30%, #d5cfc3 60%, #ddd7cb 100%)',
              borderRadius: '6px',
              boxShadow: '0 2px 20px rgba(0,0,0,0.25), 0 0 0 0.5px rgba(180,170,150,0.4)',
            }}
          >
            <div className="absolute inset-0 pointer-events-none" style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 300 300' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='paper'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='5' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23paper)'/%3E%3C/svg%3E")`,
              opacity: 0.08, mixBlendMode: 'multiply',
            }} />
            <div className="absolute inset-0 pointer-events-none"
                 style={{ boxShadow: 'inset 0 0 60px rgba(0,0,0,0.06), inset 0 0 120px rgba(0,0,0,0.03)' }} />

            <div className="relative z-10 flex flex-col items-center text-center text-[#2a2a2a]">
              <h3 className="font-['DM_Sans',sans-serif] text-[9px] uppercase tracking-[0.4em] text-[#2a2a2a] mb-1">
                A Letter of Invitation
              </h3>
              <div className="h-[12px] w-[1px] bg-[#2a2a2a]/30 mb-2" />

              {letterError && (
                <p className="mb-2 text-[10px] font-['DM_Sans',sans-serif] text-[#b84233] bg-[#b84233]/10 px-3 py-1 w-full">{letterError}</p>
              )}
              {letterSuccess && (
                <p className="mb-2 text-[10px] font-['DM_Sans',sans-serif] text-[#5b8a5e] bg-[#5b8a5e]/10 px-3 py-1 w-full">{letterSuccess}</p>
              )}

              {slotsRemaining > 0 ? (
                <>
                  {/* Letter slot */}
                  <div className="flex flex-col items-center w-full bg-[#2a2a2a]/8 border-[0.5px] border-[#2a2a2a]/15 p-3">
                    <div className="font-['Fraunces',serif] text-[13px] leading-snug w-full text-[#2a2a2a]">
                      <div className="flex flex-nowrap justify-center items-end gap-x-2 mb-2">
                        <span className="italic">Dear</span>
                        <input type="text" placeholder="First" value={letterRecipientFirst} onChange={(e) => setLetterRecipientFirst(e.target.value)}
                               className="w-[80px] bg-transparent border-b-[0.5px] border-[#2a2a2a]/30 text-center text-[12px] focus:outline-none focus:border-[#2a2a2a] text-[#2a2a2a] placeholder-[#2a2a2a]/30 transition-colors" autoComplete="given-name" />
                        <input type="text" placeholder="Last" value={letterRecipientLast} onChange={(e) => setLetterRecipientLast(e.target.value)}
                               className="w-[80px] bg-transparent border-b-[0.5px] border-[#2a2a2a]/30 text-center text-[12px] focus:outline-none focus:border-[#2a2a2a] text-[#2a2a2a] placeholder-[#2a2a2a]/30 transition-colors" autoComplete="family-name" />
                        <span>,</span>
                      </div>
                      <textarea rows={2} placeholder="Write a note — tell them why this film made you think of them..." value={letterNote} onChange={(e) => setLetterNote(e.target.value)}
                                className="w-full bg-transparent border-none text-center text-[12px] focus:outline-none resize-none placeholder-[#2a2a2a]/30 leading-relaxed text-[#2a2a2a]" />
                    </div>
                    <div className="flex flex-col gap-1 w-full text-center mt-1">
                      <label className="font-['DM_Sans',sans-serif] text-[8px] uppercase tracking-[0.2em] text-[#2a2a2a]/60">Deliver To</label>
                      <input type="email" placeholder="Their email" value={letterRecipientEmail} onChange={(e) => setLetterRecipientEmail(e.target.value)}
                             className="w-full text-center bg-transparent border-b-[0.5px] border-[#2a2a2a]/30 pb-0.5 text-[12px] font-['DM_Sans',sans-serif] text-[#2a2a2a] placeholder-[#2a2a2a]/30 focus:outline-none focus:border-[#2a2a2a] transition-colors rounded-none" inputMode="email" autoComplete="email" />
                    </div>
                  </div>

                  <div className="w-[80px] h-[1px] bg-gradient-to-r from-transparent via-[#2a2a2a]/30 to-transparent my-2" />

                  {/* Account block — compact row */}
                  {!isInviteRecipientSession && (
                    <div className="flex flex-col items-center gap-1.5 w-full">
                      <label className="font-['DM_Sans',sans-serif] text-[8px] uppercase tracking-[0.2em] text-[#2a2a2a]/70">
                        Create your account to seal &amp; send
                      </label>
                      <div className="flex gap-2.5 w-full">
                        <input type="email" placeholder="Your email" value={letterSenderEmail} onChange={(e) => setLetterSenderEmail(e.target.value)}
                               className="flex-1 text-center bg-transparent border-b-[0.5px] border-[#2a2a2a]/30 pb-0.5 text-[12px] font-['DM_Sans',sans-serif] text-[#2a2a2a] placeholder-[#2a2a2a]/30 focus:outline-none focus:border-[#2a2a2a] transition-colors rounded-none" autoComplete="email" />
                        <input type="password" placeholder="Password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                               className="flex-1 text-center bg-transparent border-b-[0.5px] border-[#2a2a2a]/30 pb-0.5 text-[12px] font-['DM_Sans',sans-serif] text-[#2a2a2a] placeholder-[#2a2a2a]/30 focus:outline-none focus:border-[#2a2a2a] transition-colors rounded-none" autoComplete="new-password" />
                      </div>
                    </div>
                  )}

                  <button type="button" onClick={handleSendLetter} disabled={letterSending}
                    className="mt-3 w-full py-2.5 min-h-[44px] bg-[#b1a180] hover:bg-[#978768] text-[#dddddd] font-['DM_Sans',sans-serif] text-[11px] tracking-[0.3em] uppercase transition-colors duration-[300ms] rounded-none disabled:opacity-40 touch-manipulation">
                    {letterSending ? 'Sending…' : 'Seal & Send'}
                  </button>

                  {passItOnLayerActive && user && (
                    <button type="button" onClick={() => setCurrentView('dashboard')}
                      className="mt-1 w-full py-1 font-['DM_Sans',sans-serif] text-[8px] uppercase tracking-[0.25em] text-[#2a2a2a]/40 hover:text-[#2a2a2a]/70 transition-colors">
                      Skip — Go to dashboard
                    </button>
                  )}
                </>
              ) : (
                <p className="font-['Fraunces',serif] text-center text-lg text-[#2a2a2a]/75 py-4">
                  All invitations have been sent.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── PORTRAIT: Full-width scrolling layout ── */}
      <div className="landscape:hidden flex flex-col flex-1 overflow-y-auto panel-scroll">
        {/* Heading block */}
        <div className="shrink-0 px-5 pt-6 pb-3">
          <h2
            className="font-serif-v3 text-3xl text-[#dddddd] font-light italic mb-1.5"
            style={{ textShadow: '0 0 24px rgba(177,161,128,0.35), 0 2px 16px rgba(0,0,0,0.4)' }}
          >
            Pass it on.
          </h2>
        </div>

        {/* Letter card */}
        <div className="shrink-0 px-4 pb-4">
          <div
            className="relative w-full p-4 pt-5 overflow-hidden"
            style={{
              background: 'linear-gradient(168deg, #e8e2d6 0%, #ddd8cc 30%, #d5cfc3 60%, #ddd7cb 100%)',
              borderRadius: '8px',
              boxShadow: '0 2px 20px rgba(0,0,0,0.25), 0 0 0 0.5px rgba(180,170,150,0.4)',
            }}
          >
            <div className="absolute inset-0 pointer-events-none" style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 300 300' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='paper'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='5' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23paper)'/%3E%3C/svg%3E")`,
              opacity: 0.08, mixBlendMode: 'multiply',
            }} />
            <div className="absolute inset-0 pointer-events-none"
                 style={{ boxShadow: 'inset 0 0 60px rgba(0,0,0,0.06), inset 0 0 120px rgba(0,0,0,0.03)' }} />

            <div className="relative z-10 flex flex-col items-center text-center text-[#2a2a2a]">
              <h3 className="font-['DM_Sans',sans-serif] text-[10px] uppercase tracking-[0.4em] text-[#2a2a2a] mb-2">
                A Letter of Invitation
              </h3>
              <div className="h-[12px] w-[1px] bg-[#2a2a2a]/30 mb-3" />

              {letterError && (
                <p className="mb-3 text-[11px] font-['DM_Sans',sans-serif] text-[#b84233] bg-[#b84233]/10 px-3 py-2 w-full">{letterError}</p>
              )}
              {letterSuccess && (
                <p className="mb-3 text-[11px] font-['DM_Sans',sans-serif] text-[#5b8a5e] bg-[#5b8a5e]/10 px-3 py-2 w-full">{letterSuccess}</p>
              )}

              {slotsRemaining > 0 ? (
                <>
                  {/* Letter slot */}
                  <div className="flex flex-col items-center w-full bg-[#2a2a2a]/8 border-[0.5px] border-[#2a2a2a]/15 p-4">
                    <div className="font-['Fraunces',serif] text-base leading-snug w-full text-[#2a2a2a]">
                      <div className="flex flex-wrap justify-center items-end gap-x-3 gap-y-1 mb-3">
                        <span className="italic">Dear</span>
                        <input type="text" placeholder="First Name" value={letterRecipientFirst} onChange={(e) => setLetterRecipientFirst(e.target.value)}
                               className="w-[100px] bg-transparent border-b-[0.5px] border-[#2a2a2a]/30 text-center focus:outline-none focus:border-[#2a2a2a] text-[#2a2a2a] placeholder-[#2a2a2a]/30 transition-colors" autoComplete="given-name" />
                        <input type="text" placeholder="Last Name" value={letterRecipientLast} onChange={(e) => setLetterRecipientLast(e.target.value)}
                               className="w-[100px] bg-transparent border-b-[0.5px] border-[#2a2a2a]/30 text-center focus:outline-none focus:border-[#2a2a2a] text-[#2a2a2a] placeholder-[#2a2a2a]/30 transition-colors" autoComplete="family-name" />
                        <span>,</span>
                      </div>
                      <textarea rows={2} placeholder="Write your note here. Tell them why this film made you think of them specifically..." value={letterNote} onChange={(e) => setLetterNote(e.target.value)}
                                className="w-full bg-transparent border-none text-center focus:outline-none resize-none placeholder-[#2a2a2a]/30 leading-relaxed text-base text-[#2a2a2a]" />
                    </div>
                    <div className="flex flex-col gap-1 w-full max-w-[320px] text-center mt-2">
                      <label className="font-['DM_Sans',sans-serif] text-[9px] uppercase tracking-[0.2em] text-[#2a2a2a]/60">Deliver To</label>
                      <input type="email" placeholder="Their Email Address" value={letterRecipientEmail} onChange={(e) => setLetterRecipientEmail(e.target.value)}
                             className="w-full text-center bg-transparent border-b-[0.5px] border-[#2a2a2a]/30 pb-1 text-[13px] font-['DM_Sans',sans-serif] text-[#2a2a2a] placeholder-[#2a2a2a]/30 focus:outline-none focus:border-[#2a2a2a] transition-colors rounded-none" inputMode="email" autoComplete="email" />
                    </div>
                  </div>

                  <div className="w-[80px] h-[1px] bg-gradient-to-r from-transparent via-[#2a2a2a]/30 to-transparent my-3" />

                  {/* Account block */}
                  {!isInviteRecipientSession && (
                    <div className="flex flex-col items-center gap-2 w-full max-w-[320px]">
                      <label className="font-['DM_Sans',sans-serif] text-[9px] uppercase tracking-[0.2em] text-[#2a2a2a]/70">
                        Create your account to seal &amp; send
                      </label>
                      <input type="email" placeholder="Your Email Address" value={letterSenderEmail} onChange={(e) => setLetterSenderEmail(e.target.value)}
                             className="w-full text-center bg-transparent border-b-[0.5px] border-[#2a2a2a]/30 pb-1 text-[13px] font-['DM_Sans',sans-serif] text-[#2a2a2a] placeholder-[#2a2a2a]/30 focus:outline-none focus:border-[#2a2a2a] transition-colors rounded-none" autoComplete="email" />
                      <input type="password" placeholder="Create Password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                             className="w-full text-center bg-transparent border-b-[0.5px] border-[#2a2a2a]/30 pb-1 text-[13px] font-['DM_Sans',sans-serif] text-[#2a2a2a] placeholder-[#2a2a2a]/30 focus:outline-none focus:border-[#2a2a2a] transition-colors rounded-none" autoComplete="new-password" />
                    </div>
                  )}

                  <button type="button" onClick={handleSendLetter} disabled={letterSending}
                    className="mt-6 w-full py-3 min-h-[44px] bg-[#b1a180] hover:bg-[#978768] text-[#dddddd] font-['DM_Sans',sans-serif] text-[11px] tracking-[0.3em] uppercase transition-colors duration-[300ms] rounded-none disabled:opacity-40 touch-manipulation">
                    {letterSending ? 'Sending…' : 'Seal & Send'}
                  </button>

                  {passItOnLayerActive && !isInviteRecipientSession && user && (
                    <div className="mt-4 flex flex-col items-center gap-2 border-t border-[#2a2a2a]/10 pt-4 text-center">
                      <p className="font-['DM_Sans',sans-serif] text-[10px] leading-relaxed text-[#2a2a2a]/50">
                        Signed in as a different email. Sign out to use{' '}
                        <span className="text-[#2a2a2a]/70">{invite?.recipient_email}</span>.
                      </p>
                      <button type="button" onClick={() => void signOut()}
                        className="font-['DM_Sans',sans-serif] text-[10px] uppercase tracking-[0.2em] text-[#2a2a2a]/50 hover:text-[#2a2a2a]">
                        Sign out
                      </button>
                    </div>
                  )}

                  {passItOnLayerActive && user && (
                    <button type="button" onClick={() => setCurrentView('dashboard')}
                      className="mt-4 w-full py-2 font-['DM_Sans',sans-serif] text-[9px] uppercase tracking-[0.25em] text-[#2a2a2a]/40 hover:text-[#2a2a2a]/70 transition-colors">
                      Skip — Go to dashboard
                    </button>
                  )}
                </>
              ) : (
                <p className="font-['Fraunces',serif] text-center text-lg text-[#2a2a2a]/75 py-6">
                  All invitations have been sent.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Cautionary paragraph */}
        <div className="shrink-0 px-5 py-4">
          <p className="font-serif-v3 text-[13px] italic leading-[1.6] text-[#dddddd]/50">
            If you choose not to share, the film&apos;s journey ends with you. That&apos;s ok — but know
            that it was carried this far by people who believed in it.
          </p>
        </div>

        {/* Network graph — below the fold */}
        {graphLayout && (
          <div className="shrink-0 px-4 pb-10">
            <span className="mb-3 block font-['DM_Sans',sans-serif] text-[9px] uppercase tracking-[0.3em] text-[#dddddd]/40">
              Your network impact
            </span>
            <div className="h-[250px] w-full opacity-70 overflow-hidden rounded bg-[#121a33] border-[0.5px] border-[#4a5580]/40 touch-manipulation">
              <NetworkGraph
                fillHeight
                pannable
                transparentSurface
                interactiveZoom
                softTouchInteraction
                edgeScrollFades
                edgeFadeColor="#080c18"
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
    </div>
  )
}
