/**
 * English ordinal formatting for the landing page's one permitted statistic
 * ("You are the Nth person to be invited to watch this film."). One shared,
 * unit-tested computation per the canonical-stats doctrine. (server/index.js
 * has an older private copy used only inside the legacy invite email.)
 */
export function formatOrdinal(n) {
  const num = Number(n)
  if (!Number.isFinite(num) || num < 1) return null
  const abs = Math.trunc(num)
  const mod100 = abs % 100
  if (mod100 >= 11 && mod100 <= 13) return `${abs}th`
  switch (abs % 10) {
    case 1:
      return `${abs}st`
    case 2:
      return `${abs}nd`
    case 3:
      return `${abs}rd`
    default:
      return `${abs}th`
  }
}
