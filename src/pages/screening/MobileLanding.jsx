import NetworkGraph from '../../components/NetworkGraph'
import DeepcastLogo from '../../components/DeepcastLogo'

function ordinalSuffix(n) {
  if (n == null || Number.isNaN(Number(n))) return ''
  const num = Math.floor(Number(n))
  const j = num % 10
  const k = num % 100
  if (j === 1 && k !== 11) return `${num}st`
  if (j === 2 && k !== 12) return `${num}nd`
  if (j === 3 && k !== 13) return `${num}rd`
  return `${num}th`
}

export default function MobileLanding({
  graphLayout,
  filmInvites,
  sharerWithTeam,
  peopleCount,
  viewVisible,
  handleOpenInvitationClick,
}) {
  return (
    <section className="relative min-h-[100dvh] w-full overflow-hidden bg-[#080c18]">

      {/* ── PORTRAIT ── */}
      {/* Full-bleed network graph behind the portrait content. Uses absolute (not fixed)
         because iOS Safari drops fixed-positioned children of overflow-auto ancestors. */}
      <div className="landscape:hidden absolute inset-0 z-0 w-full bg-[#080c18]">
        <div className="absolute inset-0 scale-125 -translate-y-[8%] origin-top">
          {graphLayout ? (
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
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-sm text-[#dddddd]/40">
              {filmInvites.length > 0
                ? 'Preparing your invitation map…'
                : 'Your private path to this film begins here.'}
            </div>
          )}
        </div>
      </div>

      {/* Portrait vignette — focuses attention on center text / bottom CTA.
         Absolute to match the graph layer (iOS fixed-in-scroll-container bug). */}
      <div
        className="landscape:hidden absolute inset-0 z-[1] pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 50% 22%, transparent 38%, #080c18 68%)' }}
        aria-hidden
      />

      <div className="landscape:hidden relative z-10 flex min-h-[100dvh] w-full flex-col pointer-events-none">
        {/* "Gifted by" badge — top-left */}
        <div
          className="pointer-events-auto absolute left-6 top-8 z-20 flex items-center gap-3 slow-fade-text reveal-up"
          style={{ transitionDelay: '1200ms' }}
        >
          <div className="h-1.5 w-1.5 rounded-full bg-[#b1a180]/60" />
          <span className="font-display text-[11px] font-light uppercase tracking-[0.25em] text-[#dddddd]/50">
            Gifted by {sharerWithTeam || 'your host'}
          </span>
        </div>

        <div className="flex min-h-[100dvh] flex-1 flex-col px-6 pb-12 pt-28">
          <div
            className="mx-auto flex w-full max-w-md flex-1 flex-col items-center text-center"
            style={{
              opacity: viewVisible ? 1 : 0,
              transition: 'opacity 1.2s ease-out 0.6s',
            }}
          >
            <div className="flex flex-col gap-2 pt-4">
              {peopleCount != null ? (
                <>
                  <p className="font-display text-[9px] font-light uppercase leading-relaxed tracking-[0.35em] text-[#dddddd]/70">
                    YOU ARE THE {ordinalSuffix(peopleCount)} PERSON TO BE INVITED.
                  </p>
                  <p className="font-display text-[9px] font-light uppercase tracking-[0.35em] text-[#dddddd]/70">
                    BY PRIVATE INVITATION ONLY.
                  </p>
                </>
              ) : (
                <p className="font-display text-[9px] font-light uppercase tracking-[0.35em] text-[#dddddd]/70">
                  BY PRIVATE INVITATION ONLY.
                </p>
              )}
            </div>
          </div>

          <div className="mt-auto flex flex-col items-center gap-10">
            <div
              className="reveal-up flex w-full max-w-[min(92vw,42rem)] justify-center px-1"
              style={{ transitionDelay: '200ms' }}
            >
              <DeepcastLogo
                variant="wordmark"
                className="!text-7xl w-auto max-w-[min(90vw,440px)] leading-none sm:!text-8xl"
              />
            </div>
            <button
              type="button"
              onClick={handleOpenInvitationClick}
              className="group pointer-events-auto flex cursor-pointer flex-col items-center gap-3 border-0 bg-transparent p-0 reveal-up touch-manipulation"
              style={{ transitionDelay: '500ms' }}
            >
              <span className="font-sans text-[9px] uppercase tracking-[0.3em] text-[#b1a180] transition-colors duration-300 group-hover:text-[#dddddd]">
                Enter
              </span>
              <div className="relative w-fit overflow-hidden py-1">
                <span className="font-serif-v3 text-2xl italic text-[#dddddd]">
                  Open your invitation
                </span>
                <div className="absolute bottom-0 left-0 h-[0.5px] w-full -translate-x-full bg-[#b1a180] transition-transform duration-[600ms] ease-out group-hover:translate-x-0" />
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* ── LANDSCAPE: Two-column diptych (mirrors DesktopLanding) ── */}
      <div className="portrait:hidden landscape:flex landscape:flex-row landscape:items-start landscape:h-[100dvh] landscape:w-full landscape:overflow-hidden">

        {/* "Gifted by" badge — top-left overlay */}
        <div className="absolute top-6 left-6 z-20 flex items-center gap-2 slow-fade-text" style={{ transitionDelay: '1200ms' }}>
          <div className="h-1.5 w-1.5 rounded-full bg-[#b1a180]/60" />
          <span className="font-display text-[10px] font-light uppercase tracking-[0.25em] text-[#dddddd]/50">
            Gifted by {sharerWithTeam || 'your host'}
          </span>
        </div>

        {/* Left col 50% — logo + CTA, centered, fluid sizing */}
        <div className="flex h-[100dvh] w-1/2 shrink-0 flex-col items-center justify-center gap-8 bg-[#080c18] px-6">
          <div
            style={{
              opacity: viewVisible ? 1 : 0,
              transition: 'opacity 1.2s ease-out 0.6s',
            }}
            className="flex w-full flex-col items-center gap-8"
          >
            <div className="flex w-full justify-center">
              <DeepcastLogo
                variant="wordmark"
                className="!text-[clamp(3rem,10vw,6rem)] w-auto max-w-[min(80%,440px)] leading-none"
              />
            </div>

            <button
              type="button"
              onClick={handleOpenInvitationClick}
              className="group flex cursor-pointer flex-col items-center gap-2 border-0 bg-transparent p-0 touch-manipulation"
            >
              <span className="font-sans text-[10px] uppercase tracking-[0.3em] text-[#b1a180] transition-colors duration-300 group-hover:text-[#dddddd]">
                Enter
              </span>
              <div className="relative w-fit overflow-hidden py-0.5">
                <span className="font-serif-v3 text-xl italic text-[#dddddd]">
                  Open your invitation
                </span>
                <div className="absolute bottom-0 left-0 h-[0.5px] w-full -translate-x-full bg-[#b1a180] transition-transform duration-[600ms] ease-out group-hover:translate-x-0" />
              </div>
            </button>
          </div>
        </div>

        {/* Divider between columns */}
        <div className="h-[100dvh] w-[0.5px] flex-shrink-0 self-start bg-[#b1a180] opacity-30" />

        {/* Right col 50% — invitation text box over network graph */}
        <div className="flex h-[100dvh] w-1/2 shrink-0 flex-col bg-[#080c18]">
          <div
            className="flex shrink-0 justify-center bg-[#121a33] px-4 pb-3 pt-6"
            style={{
              opacity: viewVisible ? 1 : 0,
              transition: 'opacity 1.2s ease-out 0.6s',
            }}
          >
            <div className="flex max-w-md flex-col items-center gap-1 px-2 text-center">
              {peopleCount != null ? (
                <p className="font-display text-[9px] font-light uppercase tracking-[0.35em] text-[#dddddd]/70">
                  You are the {ordinalSuffix(peopleCount)} person to be invited to watch this film.
                  By private invitation only.
                </p>
              ) : (
                <p className="font-display text-[9px] font-light uppercase tracking-[0.35em] text-[#dddddd]/70">
                  By private invitation only.
                </p>
              )}
            </div>
          </div>

          <div className="relative min-h-0 flex-1 overflow-hidden bg-[#121a33]">
            {graphLayout ? (
              <NetworkGraph
                fillHeight
                pannable
                transparentSurface
                interactiveZoom
                softTouchInteraction
                showZoomControls
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
            ) : (
              <div className="flex h-full flex-1 items-center justify-center px-4 text-xs text-[#dddddd]/40">
                {filmInvites.length > 0
                  ? 'Preparing your invitation map…'
                  : 'Your private path to this film begins here.'}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
