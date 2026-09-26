import CommentaryInline from './CommentaryInline'
import WitnessesInline from './WitnessesInline'
import NarratorsByRegionInline from './NarratorsByRegionInline'
import MatnComparisonInline from './MatnComparisonInline'
import QuranRefsInline from './QuranRefsInline'

export type HadithServiceKey =
  | 'takhreg' | 'compound_matn' | 'rwah' | 'asnad' | 'shawahed'
  | 'ghareeb' | 'degree' | 'sharh' | 'subjects' | 'tafsser'
  | 'biography' | 'medicine' | 'feqh' | 'asbab' | 'mokhtalaf'
  | 'amthal' | 'motawater'
  | 'countries' | 'modrag' | 'kerat' | 'proper_name' | 'matn_comparison'

export type ServiceSectionKind =
  | 'commentary'
  | 'witnesses'
  | 'countries'
  | 'matn_comparison'
  | 'kerat'

export interface ServiceSectionConfig {
  key: HadithServiceKey
  id: string
  label: string
  kind: ServiceSectionKind
  commentaryType?: number
}

// commentaryType is the hadith_service_types id whose linked texts the section shows. A commentary
// section is shown only when the hadith has texts of that type (see the hadith page), not on the
// hadith_services flag alone: some flags (tafsser, rwah) are set although no texts exist for them.
export const INLINE_SERVICE_CONFIGS: ServiceSectionConfig[] = [
  { key: 'shawahed', id: 'svc-shawahed', label: 'الشواهد والمتابعات', kind: 'witnesses' },
  { key: 'sharh', id: 'svc-sharh', label: 'شرح الحديث', kind: 'commentary', commentaryType: 6 },
  { key: 'takhreg', id: 'svc-takhreg', label: 'تخريج كتب التخريج والعلل', kind: 'commentary', commentaryType: 8 },
  { key: 'feqh', id: 'svc-feqh', label: 'الفقه', kind: 'commentary', commentaryType: 1 },
  { key: 'tafsser', id: 'svc-tafsser', label: 'التفسير', kind: 'commentary', commentaryType: 16 },
  { key: 'biography', id: 'svc-biography', label: 'السيرة', kind: 'commentary', commentaryType: 17 },
  { key: 'medicine', id: 'svc-medicine', label: 'الطب النبوي', kind: 'commentary', commentaryType: 3 },
  { key: 'asbab', id: 'svc-asbab', label: 'أسباب الورود', kind: 'commentary', commentaryType: 7 },
  { key: 'mokhtalaf', id: 'svc-mokhtalaf', label: 'مختلف الحديث', kind: 'commentary', commentaryType: 12 },
  { key: 'amthal', id: 'svc-amthal', label: 'الأمثال', kind: 'commentary', commentaryType: 4 },
  { key: 'motawater', id: 'svc-motawater', label: 'المتواتر', kind: 'commentary', commentaryType: 5 },
  { key: 'countries', id: 'svc-countries', label: 'الرواية بالبلدان', kind: 'countries' },
  { key: 'modrag', id: 'svc-modrag', label: 'المدرج', kind: 'commentary', commentaryType: 2 },
  { key: 'kerat', id: 'svc-kerat', label: 'القراءات', kind: 'kerat' },
  // Disabled: this section rendered under the same name as الروايات الموازية but read from
  // /api/hadith/[id]/matn-comparison, which groups on hadith_toc.takhrij_id — a column nothing
  // populates — so it returned zero rows for every hadith and only ever showed its empty state.
  // { key: 'matn_comparison', id: 'svc-matn-comparison', label: 'مقارنة المتون', kind: 'matn_comparison' },
  { key: 'rwah', id: 'svc-rwah', label: 'تخريج الرواة', kind: 'commentary', commentaryType: 9 },
]

export function activeServiceSections(
  hadithServices?: Partial<Record<HadithServiceKey, boolean>>
): ServiceSectionConfig[] {
  return INLINE_SERVICE_CONFIGS.filter(cfg => hadithServices?.[cfg.key] === true)
}

export default function HadithServiceSection({
  hadithId,
  config,
}: {
  hadithId: number
  config: ServiceSectionConfig
}) {
  switch (config.kind) {
    case 'commentary':
      return <CommentaryInline hadithId={hadithId} initialTypeId={config.commentaryType!} />
    case 'witnesses':
      return <WitnessesInline hadithId={hadithId} />
    case 'countries':
      return <NarratorsByRegionInline hadithId={hadithId} />
    case 'matn_comparison':
      return <MatnComparisonInline hadithId={hadithId} />
    case 'kerat':
      return <QuranRefsInline hadithId={hadithId} />
    default:
      return null
  }
}
