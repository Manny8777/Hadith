/**
 * Narrator display-name helper.
 *
 * Shows the full narrator name by default, but falls back to the
 * abbreviated name (الاسم المختصر / `abb_name`) when the full name is too
 * long to display comfortably in a tight space (e.g. search result rows,
 * the narrator line above the matn).
 *
 * Only swaps when an abbreviated name exists and is actually shorter, so a
 * missing or longer `abb_name` never makes things worse.
 */
export function displayNarratorName(
  name: string | null | undefined,
  abbName?: string | null,
  maxLen = 30,
): string {
  const full = (name ?? '').trim()
  const abb = (abbName ?? '').trim()
  if (abb && full.length > maxLen && abb.length < full.length) return abb
  return full || abb
}
