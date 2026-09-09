/**
 * The reveal moment's first line — ONE sentence for BOTH share surfaces
 * (the watch page's pass-it-on modal and the dashboard share modal), so the
 * two can never drift. Founder-stamped 9 September 2026 with the
 * invitation/ticket vocabulary split: the invitation is the act and the link
 * you make; the ticket is the numbered seat the receiver holds.
 *
 * The recipient's name is the first name typed into the form.
 */
export function revealSentence(recipientName) {
  const name = String(recipientName ?? '').trim()
  return `Here’s ${name}’s invitation link — it admits one person only. Send it to them with why they came to mind.`
}
