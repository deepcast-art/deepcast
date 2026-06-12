/**
 * The quiet "Deepcast MVP v1.0" tag — ONE definition for every surface
 * (landing page, dashboards, impact page). Small, low-contrast, wide-tracked
 * to match the design system's label style. Position it via className.
 */
export default function MvpVersionLabel({ className = '' }) {
  return (
    <p
      className={`select-none font-sans text-[9px] uppercase tracking-[0.3em] text-warm/25 ${className}`}
    >
      Deepcast MVP v1.0
    </p>
  )
}
