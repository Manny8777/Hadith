// Unified hadith-grade regexes.
//
// Before this module the same three grade classes were written out six times with two
// different, drifting literal sets (e.g. sahih was `صحيح` in the narrator branches but
// `صحيح|صحح|حسن صحيح` in the text branch), so the same filter returned different counts
// depending on the mode. One definition, used everywhere.

export const SAHIH = 'صحيح|صحح|حسن صحيح'
export const HASAN = 'إسناده حسن|حديث حسن|سنده حسن'
export const DAIF = 'ضعيف|ضعفه|منكر|متروك|موضوع'

/** any of the three classes — used to filter which judgment rows are considered at all */
export const ANY_GRADE = `${SAHIH}|${HASAN}|${DAIF}`

export type Grade = 'sahih' | 'hasan' | 'daif' | ''

/** case/whitespace tolerant parsing, so `grade=SAHIH` and `grade= Sahih ` work */
export function normalizeGrade(raw: string | null | undefined): Grade {
  const g = (raw ?? '').trim().toLowerCase()
  return g === 'sahih' || g === 'hasan' || g === 'daif' ? g : ''
}

/** `CASE … END` producing the single best grade label for a judgment row */
export function gradeHintCase(alias = 'say_text'): string {
  return `CASE
        WHEN ${alias} ~* '${SAHIH}' THEN 'صحيح'
        WHEN ${alias} ~* '${HASAN}' AND ${alias} !~* 'صحيح' THEN 'حسن'
        WHEN ${alias} ~* '${DAIF}' THEN 'ضعيف'
        ELSE NULL END`
}

/**
 * EXISTS clause filtering hadiths by grade.
 * `hadithIdExpr` is the hadith id column in the enclosing query (e.g. `ht.main_id`).
 */
export function gradeExistsClause(grade: Grade, hadithIdExpr: string): string {
  if (grade === 'sahih')
    return `EXISTS (SELECT 1 FROM hadith_judgments j WHERE j.hadith_id = ${hadithIdExpr} AND j.say_text ~* '${SAHIH}')`
  if (grade === 'hasan')
    return `EXISTS (SELECT 1 FROM hadith_judgments j WHERE j.hadith_id = ${hadithIdExpr} AND j.say_text ~* '${HASAN}' AND j.say_text !~* 'صحيح')`
  if (grade === 'daif')
    return `EXISTS (SELECT 1 FROM hadith_judgments j WHERE j.hadith_id = ${hadithIdExpr} AND j.say_text ~* '${DAIF}')`
  return ''
}
