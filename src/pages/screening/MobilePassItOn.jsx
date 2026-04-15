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
    /* ── Stacked (phone + tablet + phone landscape): use lg: so viewports >768px (e.g. landscape phones) still stack — otherwise desktop diptych hides the letter card. ── */
    <div className="lg:hidden flex h-full min-h-0 w-full flex-1 flex-col bg-[#080c18] portrait:h-auto portrait:flex-none landscape:flex-row landscape:max-h-[100dvh] landscape:overflow-hidden">

      {narrowPausePassItOn && (
        <div className="sticky top-0 z-10 shrink-0 border-b border-[#b1a180]/25 bg-[#080c18]/95 backdrop-blur-md pb-1 pt-[max(0.5rem,env(safe-area-inset-top))] landscape:hidden">
          <button
            type="button"
            onClick={resumeFilm}
            className="flex w-full items-center justify-center gap-2.5 py-3.5 touch-manipulation"
          >
            <svg className="h-2.5 w-2.5 shrink-0 fill-[#dddddd]/85" viewBox="0 0 24 24" aria-hidden>
              <path d="M8 5v14l11-7z" />
            </svg>
            <span className="font-sans text-[10px] font-medium uppercase tracking-[0.35em] text-[#dddddd]/90">
              Resume Film
            </span>
          </button>
          <div className="flex justify-center px-10 pb-2">
            <div className="relative h-px w-full max-w-[min(100%,20rem)] bg-[#b1a180]/35">
              <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#b1a180]/55 bg-[#080c18]" />
            </div>
          </div>
        </div>
      )}

      {/* LANDSCAPE ONLY: Left col — header + graph */}
      <div className="portrait:hidden landscape:flex landscape:flex-col landscape:w-[44%] landscape:shrink-0 landscape:h-full landscape:min-h-0 landscape:max-h-[100dvh] landscape:overflow-hidden landscape:px-3 landscape:py-3 landscape:border-r landscape:border-[#b1a180]/10">
        <div className="w-full shrink-0 mb-2">
          <h2 className="font-serif-v3 text-[1.35rem] leading-tight italic text-[#dddddd] font-light mb-1 text-left">
            Pass it on.
          </h2>
          <p className="font-serif-v3 text-[11px] italic leading-snug text-[#dddddd]/65 max-w-none text-left line-clamp-2">
            If you choose not to share, the film&apos;s journey ends with you. That&apos;s ok — but know
            that it was carried this far by people who believed in it.
          </p>
        </div>
        {graphLayout && (
          <div className="flex-1 min-h-0 w-full overflow-hidden rounded-md border border-[#b1a180]/15 bg-[#080c18] shadow-inner touch-manipulation">
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

      {/* PORTRAIT ONLY: Header — above letter card */}
      <div className="landscape:hidden shrink-0 px-3 pt-2 pb-1">
        <h2 className="font-serif-v3 text-[1.35rem] leading-tight italic text-[#dddddd] font-light mb-1 text-left">
          Pass it on.
        </h2>
        <p className="font-serif-v3 text-[11px] italic leading-snug text-[#dddddd]/65 max-w-none text-left">
          If you choose not to share, the film&apos;s journey ends with you — but know
          it was carried this far by people who believed in it.
        </p>
      </div>

      {/* Letter card — both orientations */}
      <div className="flex flex-col portrait:px-3 portrait:pb-3 portrait:pt-0 landscape:flex-1 landscape:min-h-0 landscape:h-full landscape:overflow-hidden landscape:px-2 landscape:py-2">
        <div
          className="relative flex w-full flex-col rounded-lg px-3 py-5 sm:px-5 sm:py-6 portrait:px-3 portrait:py-3 landscape:min-h-0 landscape:flex-1 landscape:overflow-hidden landscape:px-2.5 landscape:py-2 landscape:sm:px-3 landscape:sm:py-2.5"
          style={{
            background:
              'linear-gradient(168deg, #e8e2d6 0%, #ddd8cc 30%, #d5cfc3 60%, #ddd7cb 100%)',
            boxShadow:
              '0 2px 24px rgba(0,0,0,0.28), 0 0 0 0.5px rgba(180,170,150,0.45)',
          }}
        >
          <div
            className="absolute inset-0 pointer-events-none rounded-lg"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 300 300' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='paper'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='5' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23paper)'/%3E%3C/svg%3E")`,
              opacity: 0.08,
              mixBlendMode: 'multiply',
            }}
          />
          <div className="relative z-10 flex flex-col text-[#2a2a2a] landscape:min-h-0 landscape:flex-1 landscape:overflow-y-auto landscape:overflow-x-hidden landscape:[zoom:0.9] landscape:overscroll-contain [-webkit-overflow-scrolling:touch]">
            <h3 className="font-sans text-[9px] uppercase tracking-[0.45em] text-[#6b5d4a] mb-2 text-center portrait:mb-1.5 sm:mb-6 landscape:mb-1 landscape:text-[7px] landscape:tracking-[0.38em]">
              A Letter of Invitation
            </h3>

            {letterError && (
              <p className="mb-3 text-[11px] font-sans text-[#b84233] bg-[#b84233]/10 px-3 py-2 w-full rounded-sm landscape:mb-1 landscape:py-1 landscape:text-[10px]">
                {letterError}
              </p>
            )}
            {letterSuccess && (
              <p className="mb-3 text-[11px] font-sans text-[#5b8a5e] bg-[#5b8a5e]/10 px-3 py-2 w-full rounded-sm landscape:mb-1 landscape:py-1 landscape:text-[10px]">
                {letterSuccess}
              </p>
            )}

            {slotsRemaining > 0 ? (
              <>
                <div className="font-serif-v3 w-full space-y-2 text-center landscape:space-y-1.5">
                  <div className="flex flex-row flex-wrap items-end justify-center gap-x-3 gap-y-1 portrait:gap-x-2 landscape:flex-row landscape:flex-nowrap landscape:gap-x-2 landscape:gap-y-0 landscape:justify-center">
                    <span className="italic text-[14px] landscape:text-[12px]">Dear</span>
                    <input
                      type="text"
                      placeholder="First"
                      value={letterRecipientFirst}
                      onChange={(e) => setLetterRecipientFirst(e.target.value)}
                      className="min-w-[5rem] max-w-[8rem] flex-1 bg-transparent border-b border-[#6b5d4a]/45 py-0.5 text-center text-[14px] text-[#2a2a2a] placeholder-[#2a2a2a]/35 focus:outline-none focus:border-[#6b5d4a] landscape:min-w-[4.5rem] landscape:max-w-[min(28%,7rem)] landscape:py-0 landscape:text-[12px]"
                      autoComplete="given-name"
                    />
                    <input
                      type="text"
                      placeholder="Last"
                      value={letterRecipientLast}
                      onChange={(e) => setLetterRecipientLast(e.target.value)}
                      className="min-w-[5rem] max-w-[8rem] flex-1 bg-transparent border-b border-[#6b5d4a]/45 py-0.5 text-center text-[14px] text-[#2a2a2a] placeholder-[#2a2a2a]/35 focus:outline-none focus:border-[#6b5d4a] landscape:min-w-[4.5rem] landscape:max-w-[min(28%,7rem)] landscape:py-0 landscape:text-[12px]"
                      autoComplete="family-name"
                    />
                  </div>
                  <textarea
                    rows={2}
                    placeholder="Write a note — tell them why this film made you think of them..."
                    value={letterNote}
                    onChange={(e) => setLetterNote(e.target.value)}
                    className="w-full bg-transparent text-center text-[13px] italic leading-snug text-[#2a2a2a] placeholder-[#2a2a2a]/35 focus:outline-none resize-none min-h-[3rem] border-b border-[#6b5d4a]/25 pb-1 landscape:min-h-0 landscape:h-[4.25rem] landscape:py-1 landscape:text-[12px] landscape:leading-snug"
                  />
                  <input
                    type="email"
                    placeholder="Their email"
                    value={letterRecipientEmail}
                    onChange={(e) => setLetterRecipientEmail(e.target.value)}
                    className="w-full bg-transparent border-b border-[#6b5d4a]/45 py-1 text-center font-sans text-[13px] text-[#2a2a2a] placeholder-[#2a2a2a]/35 focus:outline-none landscape:py-0.5 landscape:text-[12px]"
                    inputMode="email"
                    autoComplete="email"
                  />
                </div>

                {slotsRemaining > 1 && (
                  <p className="mt-2 text-center font-sans text-[9px] font-medium uppercase tracking-[0.28em] text-[#6b5d4a]/90 landscape:mt-1 landscape:text-[7px] landscape:tracking-[0.22em]">
                    + Add another ({slotsRemaining - 1} left)
                  </p>
                )}

                <div className="mt-3 flex flex-wrap items-end justify-center gap-x-3 gap-y-1 border-t border-[#6b5d4a]/15 pt-2 font-serif-v3 text-[14px] text-[#2a2a2a] landscape:mt-2 landscape:gap-x-2 landscape:gap-y-0 landscape:pt-2 landscape:text-[12px]">
                  <span className="italic">With intention,</span>
                  <input
                    type="text"
                    placeholder="Your name"
                    value={letterSenderName}
                    onChange={(e) => setLetterSenderName(e.target.value)}
                    className="min-w-[8rem] max-w-[16rem] flex-1 bg-transparent border-b border-[#6b5d4a]/45 py-0.5 text-center italic focus:outline-none focus:border-[#6b5d4a] placeholder-[#2a2a2a]/35 landscape:min-w-0 landscape:max-w-[min(55%,12rem)] landscape:py-0 landscape:text-[12px]"
                    autoComplete="name"
                  />
                </div>

                {!isInviteRecipientSession && (
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-4 landscape:mt-2 landscape:flex-row landscape:items-end landscape:gap-2 landscape:gap-y-0">
                    <label className="flex flex-1 flex-col gap-1 text-center landscape:min-w-0 landscape:gap-0.5">
                      <span className="font-sans text-[8px] uppercase tracking-[0.25em] text-[#6b5d4a]/80 landscape:text-[7px]">
                        Your email
                      </span>
                      <input
                        type="email"
                        placeholder="your@email.com"
                        value={letterSenderEmail}
                        onChange={(e) => setLetterSenderEmail(e.target.value)}
                        className="w-full bg-transparent border-b border-[#6b5d4a]/45 py-1 text-center font-sans text-[13px] text-[#2a2a2a] placeholder-[#2a2a2a]/35 focus:outline-none landscape:py-0.5 landscape:text-[11px]"
                        autoComplete="email"
                      />
                    </label>
                    <label className="flex flex-1 flex-col gap-1 text-center landscape:min-w-0 landscape:gap-0.5">
                      <span className="font-sans text-[8px] uppercase tracking-[0.25em] text-[#6b5d4a]/80 landscape:text-[7px]">
                        Password
                      </span>
                      <input
                        type="password"
                        placeholder="Min. 8 characters"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full bg-transparent border-b border-[#6b5d4a]/45 py-1 text-center font-sans text-[13px] text-[#2a2a2a] placeholder-[#2a2a2a]/35 focus:outline-none landscape:py-0.5 landscape:text-[11px]"
                        autoComplete="new-password"
                      />
                    </label>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleSendLetter}
                  disabled={letterSending}
                  className="mt-4 w-full shrink-0 py-3 min-h-[44px] bg-[#a89472] hover:bg-[#978768] active:bg-[#8a7d62] text-[#f5f2ec] font-sans text-[11px] tracking-[0.32em] uppercase transition-colors rounded-sm disabled:opacity-40 touch-manipulation landscape:mt-3 landscape:min-h-[48px] landscape:py-3.5 landscape:text-[11px] landscape:tracking-[0.3em]"
                >
                  {letterSending ? 'Sending…' : 'Seal & Send'}
                </button>

                {passItOnLayerActive && (
                  <p className="mt-3 text-center font-sans text-[9px] uppercase tracking-[0.15em] text-[#6b5d4a]/55 landscape:mt-1 landscape:text-[7px] landscape:hidden">
                    After sending, you&apos;ll go to your dashboard.
                  </p>
                )}

                {passItOnLayerActive && !isInviteRecipientSession && user && (
                  <div className="mt-4 flex flex-col items-center gap-2 border-t border-[#6b5d4a]/15 pt-4 text-center landscape:hidden">
                    <p className="font-sans text-[10px] leading-relaxed text-[#6b5d4a]/70">
                      Signed in as a different email. Sign out to use{' '}
                      <span className="text-[#2a2a2a]/80">{invite?.recipient_email}</span>.
                    </p>
                    <button
                      type="button"
                      onClick={() => void signOut()}
                      className="font-sans text-[10px] uppercase tracking-[0.2em] text-[#6b5d4a]/70 hover:text-[#2a2a2a]"
                    >
                      Sign out
                    </button>
                  </div>
                )}

                {passItOnLayerActive && (
                  <button
                    type="button"
                    onClick={() => setCurrentView('dashboard')}
                    className="mt-4 w-full py-2 font-sans text-[9px] uppercase tracking-[0.25em] text-[#6b5d4a]/70 hover:text-[#2a2a2a]/90 transition-colors landscape:mt-1 landscape:py-1 landscape:text-[8px]"
                  >
                    Skip — Go to dashboard
                  </button>
                )}
              </>
            ) : (
              <p className="font-serif-v3 text-center text-lg text-[#2a2a2a]/75 py-6">
                All invitations have been sent.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* PORTRAIT ONLY: Network graph at bottom — partially visible, scroll to see */}
      {graphLayout && (
        <div className="landscape:hidden shrink-0 px-3 pt-2 pb-10">
          <div className="h-[min(28dvh,220px)] min-h-[140px] max-h-[240px] w-full overflow-hidden rounded-md border border-[#b1a180]/15 bg-[#080c18] shadow-inner touch-manipulation">
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
  )
}
