/**
 * The About copy — founder-approved VERBATIM (2026-07-21). Never rewrite,
 * "improve," or reformat without Ien's explicit sign-off. This is the ONE
 * source for the copy: rendered by the /about page and the dashboard's
 * About popup, so the two can never drift.
 */
export default function AboutContent() {
  return (
    <div className="space-y-8">
      <section>
        <h2 className="font-serif-v3 text-[21px] italic text-accent">What is Deepcast?</h2>
        <p className="mt-2 font-body font-light text-base text-[#dddddd]/70 leading-relaxed">
          {"Deepcast is an experimental film distribution platform focused on depth over breadth. It's about going from broadcasting to 'deepcasting.'"}
        </p>
        <p className="mt-2 font-body font-light text-base text-[#dddddd]/70 leading-relaxed">
          {"Films here are spread by real humans & private invite only through trusted networks. No algorithms. Films can't be seen by more people unless existing viewers choose to share."}
        </p>
        <p className="mt-2 font-body font-light text-base text-[#dddddd]/70 leading-relaxed">
          {'In an age of attention extraction, our goal is to bring humanity, connection, and depth back to how meaningful stories are shared. We believe great stories should be shared in a way that empowers our humanity, not through faceless algorithms or extractive business models.'}
        </p>
      </section>

      <section>
        <h2 className="font-serif-v3 text-[21px] italic text-accent">Who is it for?</h2>
        <p className="mt-2 font-body font-light text-base text-[#dddddd]/70 leading-relaxed">
          {'Filmmakers, creators, and storytellers who want to build, share, and connect meaningfully with their true fans, are tired of the gatekeepers & algorithms, and wish to build a direct relationship with their audience.'}
        </p>
        <p className="mt-2 font-body font-light text-base text-[#dddddd]/70 leading-relaxed">
          {'Viewers who want to support and connect with great storytellers, wish to see more substantive films, and play a meaningful part in sharing them with the world.'}
        </p>
      </section>

      <section>
        <h2 className="font-serif-v3 text-[21px] italic text-accent">Who made this?</h2>
        <p className="mt-2 font-body font-light text-base text-[#dddddd]/70 leading-relaxed">
          {'I did — Ien Chi ('}
          <a
            href="https://www.ienchi.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent transition-colors hover:text-accent-hover"
          >
            https://www.ienchi.com
          </a>
          {"). This is an early MVP, and I'm looking for help bringing it to life. If you're interested in helping (filmmakers, investors, engineers, designers, community builders, etc.) — reach out: "}
          <a
            href="mailto:ien.chi96@gmail.com"
            className="text-accent transition-colors hover:text-accent-hover"
          >
            ien.chi96@gmail.com
          </a>
          {'. I read every message myself.'}
        </p>
      </section>
    </div>
  )
}
