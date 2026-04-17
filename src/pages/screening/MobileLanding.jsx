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
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <section className="relative min-h-[100dvh] w-full overflow-hidden bg-[#080c18]">
      {/* Hero media — graph shifted up and scaled for portrait vignette framing */}
      <div className="fixed inset-0 z-0 h-[100dvh] w-full bg-[#080c18]">
        <div className="absolute inset-0 portrait:scale-125 portrait:-translate-y-[8%] portrait:origin-top">
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

      {/* Vignette overlay — portrait only, between graph (z-0) and foreground (z-[5]) */}
      <div
        className="fixed inset-0 z-[2] pointer-events-none portrait:block hidden h-[100dvh]"
        style={{ background: 'radial-gradient(ellipse at 50% 22%, transparent 38%, #080c18 68%)' }}
        aria-hidden
      />

      <div className="fixed inset-0 z-[5] flex min-h-[100dvh] w-full flex-col pointer-events-none">
        {/* "Gifted by" badge — portrait: absolute top; landscape: hidden (shown inline instead) */}
        <div
          className="pointer-events-auto portrait:absolute portrait:left-6 portrait:top-8 portrait:z-20 landscape:hidden flex items-center gap-3 slow-fade-text reveal-up"
          style={{ transitionDelay: '1200ms' }}
        >
          <div className="h-1.5 w-1.5 rounded-full bg-[#b1a180]/60" />
          <span className="font-display text-[11px] font-light uppercase tracking-[0.25em] text-[#dddddd]/50">
            Gifted by {sharerWithTeam || 'your host'}
          </span>
        </div>

        {/* ── PORTRAIT layout ── */}
        <div className="landscape:hidden flex min-h-[100dvh] flex-1 flex-col px-6 pb-12 pt-28">
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
              className="group pointer-events-auto flex cursor-pointer flex-col items-center gap-3 border-0 bg-transparent p-0 reveal-up"
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

        {/* ── LANDSCAPE layout: fixed corners over the graph ── */}
        <div
          className="portrait:hidden fixed inset-0 z-20 pointer-events-none"
          style={{
            opacity: viewVisible ? 1 : 0,
            transition: 'opacity 1.2s ease-out 0.6s',
          }}
        >
          {/* Top-left: gifted by, then invitation text below with clear separation */}
          <div className="absolute left-5 top-4 flex flex-col items-start gap-3">
            <div className="flex items-center gap-2 slow-fade-text reveal-up" style={{ transitionDelay: '1200ms' }}>
              <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#b1a180]/60" />
              <span className="font-display text-[10px] font-light uppercase tracking-[0.25em] text-[#dddddd]/50">
                Gifted by {sharerWithTeam || 'your host'}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              {peopleCount != null ? (
                <>
                  <p className="font-display text-[9px] font-light uppercase leading-relaxed tracking-[0.32em] text-[#dddddd]/60">
                    You are the {ordinalSuffix(peopleCount)} person to be invited.
                  </p>
                  <p className="font-display text-[9px] font-light uppercase tracking-[0.32em] text-[#dddddd]/60">
                    By private invitation only.
                  </p>
                </>
              ) : (
                <p className="font-display text-[9px] font-light uppercase tracking-[0.32em] text-[#dddddd]/60">
                  By private invitation only.
                </p>
              )}
            </div>
          </div>

          {/* Bottom-right: logo + enter + CTA */}
          <div className="absolute bottom-5 right-5 flex flex-col items-end gap-3">
            <div className="reveal-up" style={{ transitionDelay: '200ms' }}>
              <DeepcastLogo
                variant="wordmark"
                className="!text-[2.4rem] w-auto leading-none"
              />
            </div>
            <button
              type="button"
              onClick={handleOpenInvitationClick}
              className="group pointer-events-auto flex cursor-pointer flex-col items-end gap-1.5 border-0 bg-transparent p-0 reveal-up"
              style={{ transitionDelay: '500ms' }}
            >
              <span className="font-sans text-[9px] uppercase tracking-[0.3em] text-[#b1a180] transition-colors duration-300 group-hover:text-[#dddddd]">
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
      </div>
    </section>
  )
}
