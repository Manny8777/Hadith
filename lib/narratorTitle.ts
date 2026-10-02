// How a narrator is named as a Companion: «أم المؤمنين» for the Prophet's wives ﷺ, «صحابية» for
// the other women, «صحابي» for the men. Stored in narrators.companion_title, with narrators.is_female
// (db/add_narrator_gender.js); select those columns wherever a single narrator is labelled.

export interface CompanionFields {
  is_companion?: boolean | null
  companion_title?: string | null
  is_female?: boolean | null
}

/** The label for a Companion, or null for anyone else */
export function companionTitle(n: CompanionFields): string | null {
  if (n.companion_title) return n.companion_title
  if (!n.is_companion) return null
  return n.is_female ? 'صحابية' : 'صحابي'
}

/** «راوٍ» / «راوية» */
export const narratorWord = (n: CompanionFields) => (n.is_female ? 'راوية' : 'راوٍ')
