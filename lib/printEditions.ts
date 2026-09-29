// The edition behind hadith_toc.tarqeem_matboa2, per book. The source data tags the number
// only as «طبعة_ثانية» and books.print2_edition holds no name, so each entry here was
// identified by matching our numbers against that edition's printed text. Books not listed
// (مصنف ابن أبي شيبة، مسند الحميدي، المراسيل) are still unidentified and show «طبعة أخرى»,
// so the number is never read as belonging to the «الطبعة» named first on the line.
export const SECOND_EDITION: Record<number, string> = {
  // Our 15311, 15312, 15315 for Hakim ibn Hizam are the numbers al-Risala's own footnotes use
  8: 'مؤسسة الرسالة، ت الأرناؤوط',
  // Only al-A'zami's 3rd edition prints the sub-numbers our data carries («٦٩٢/ ١»)
  11: 'المكتب الإسلامي، ت الأعظمي، ط ٣',
}
