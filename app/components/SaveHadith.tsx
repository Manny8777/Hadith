'use client'
// The hadith page's and search results' «☆ حفظ»: the reader's collections (SaveToLibrary)
import SaveToLibrary from './SaveToLibrary'

export default function SaveHadith({ hadithId }: { hadithId: number }) {
  return <SaveToLibrary kind="hadith" itemRef={String(hadithId)} />
}
