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

export default function DesktopLanding({
  graphLayout,
  filmInvites,
  sharerWithTeam,
  peopleCount,
  viewVisible,
  handleOpenInvitationClick,
}) {
  return (
    <section className="relative flex w-full flex-col overflow-hidden md:flex-row md:items-start">
      <div
        className="absolute top-8 left-6 z-20 flex items-center gap-3 slow-fade-text reveal-up md:left-16"
        style={{ transitionDelay: '1200ms' }}
      >
        <div className="h-1.5 w-1.5 rounded-full bg-[#b1a180]/60" />
        <span className="font-display text-[11px] font-light uppercase tracking-[0.25em] text-[#dddddd]/50 md:text-[12px]">
          Gifted by {sharerWithTeam || 'your host'}
        </span>
      </div>

      {/* Left: logo + CTA — sticky on desktop */}
      <div className="flex min-h-[100dvh] w-full shrink-0 flex-col items-center justify-center gap-10 bg-[#080c18] px-8 py-12 md:sticky md:top-0 md:h-[100dvh] md:max-h-[100dvh] md:min-h-0 md:w-1/2 md:shrink-0 md:px-16 md:py-0">
        <div
          className="reveal-up flex w-full max-w-[min(92vw,42rem)] justify-center px-1"
          style={{ transitionDelay: '200ms' }}
        >
          <DeepcastLogo
            variant="wordmark"
            className="!text-8xl w-auto max-w-[min(90vw,440px)] leading-none"
          />
        </div>
        <button
          type="button"
          onClick={handleOpenInvitationClick}
          className="group flex cursor-pointer flex-col items-center gap-3 border-0 bg-transparent p-0 reveal-up"
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

      <div className="hidden h-[100dvh] w-[0.5px] flex-shrink-0 self-start bg-[#b1a180] opacity-30 md:block" />

      {/* Right: network graph */}
      <div className="flex min-h-[min(60vh,520px)] w-full shrink-0 flex-col bg-[#080c18] md:h-[100dvh] md:min-h-0 md:w-1/2 md:flex-1">
        <div
          className="flex shrink-0 justify-center bg-[#121a33] px-4 pb-4 pt-8 md:pt-10"
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
            <div className="flex h-full flex-1 items-center justify-center px-6 text-sm text-[#dddddd]/40">
              {filmInvites.length > 0
                ? 'Preparing your invitation map…'
                : 'Your private path to this film begins here.'}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
