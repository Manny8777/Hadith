const { Pool } = require('pg');
const fs = require('fs');
const pool = new Pool({
  connectionString: 'postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway',
  ssl: { rejectUnauthorized: false }
});

const clean = (s) => (s || '').replace(/<نه\/>/g, '\n').replace(/<[^>]+>/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n /g, '\n').trim();
const oneLine = (s) => clean(s).replace(/\s*\n\s*/g, ' · ').trim();

function printYear(card) {
  const c = clean(card);
  // grab years near الطبعة / عام النشر / سنة النشر / تاريخ
  const m = c.match(/(?:الطبعة|عام النشر|سنة النشر|سنة الطبع|تاريخ النشر)[^\n]*?((?:\d{3,4}\s*هـ?)(?:\s*[-–/]\s*\d{3,4}\s*م?)?)/);
  if (m) return m[1].replace(/\s+/g, ' ').trim();
  const any = c.match(/\b(1[0-4]\d{2})\s*هـ?/); // fallback: any plausible hijri year
  return any ? any[0].replace(/\s+/g, ' ').trim() : '';
}
function publisher(card) {
  const c = clean(card);
  const m = c.match(/الناشر\s*:?\s*([^\n]+)/);
  return m ? m[1].trim() : '';
}

async function main() {
  const { rows: books } = await pool.query('SELECT * FROM books ORDER BY id');
  const { rows: authors } = await pool.query('SELECT id, name, short_name, death_date, info FROM authors');
  const aMap = {}; authors.forEach(a => aMap[a.id] = a);
  const counts = {};
  const cRes = await pool.query(`SELECT book_id, COUNT(*) c FROM hadith_toc WHERE is_leaf=true AND is_paragraph=true GROUP BY book_id`);
  cRes.rows.forEach(r => counts[r.book_id] = Number(r.c));

  let md = `# تفاصيل جميع الكتب (Books) — ${books.length} كتابًا\n\n`;
  md += `مُصدَّر من جدولي \`books\` + \`authors\` (+ عدّ الأحاديث من \`hadith_toc\`). تاريخ التصدير: 2026-06-19.\n\n`;
  md += `> ملاحظة: "سنة الطبع" و"الناشر" مستخرجان نصّيًّا من حقل \`card_info\` وقد لا يكونان دقيقين لكل كتاب؛ والحقول الفارغة تعني عدم توفر البيانات.\n\n`;

  // ── Overview table ──
  md += `## جدول مختصر\n\n`;
  md += `| id | الكتاب | المؤلف | ت.الوفاة | عدد الأحاديث | الناشر | سنة الطبع |\n`;
  md += `|---:|---|---|---:|---:|---|---|\n`;
  for (const b of books) {
    const a = aMap[b.author_id];
    const pub = publisher(b.card_info) || (b.print1_edition && b.print1_edition !== '0' ? b.print1_edition : '');
    const yr = printYear(b.card_info);
    const death = (a && a.death_date) ? a.death_date : (b.takhrij_death || '');
    const hc = counts[b.id] != null ? counts[b.id].toLocaleString() : '0';
    md += `| ${b.id} | ${(b.title||'').replace(/\|/g,'/')} | ${a ? (a.short_name || a.name).replace(/\|/g,'/') : ''} | ${death} | ${hc} | ${(pub||'').replace(/\|/g,'/')} | ${yr} |\n`;
  }
  md += `\n---\n\n`;

  // ── Per-book detail ──
  md += `## تفاصيل كل كتاب\n\n`;
  for (const b of books) {
    const a = aMap[b.author_id];
    const hc = counts[b.id] != null ? counts[b.id].toLocaleString() : '0';
    md += `### [${b.id}] ${b.title || ''}\n\n`;
    md += `| الحقل | القيمة |\n|---|---|\n`;
    const row = (k,v) => { if (v !== null && v !== undefined && String(v).trim() !== '' && String(v).trim() !== '0') md += `| ${k} | ${String(v).replace(/\n/g,' ').replace(/\|/g,'/')} |\n`; };
    row('المؤلف', a ? a.name : `author_id=${b.author_id}`);
    row('اسم مختصر', a ? a.short_name : '');
    row('سنة وفاة المؤلف', a ? a.death_date : '');
    row('عدد الأحاديث', hc);
    row('takhrij_author', b.takhrij_author);
    row('takhrij_death', b.takhrij_death);
    row('takhrij_book', b.takhrij_book);
    row('الناشر (print1_edition)', b.print1_edition);
    row('طبعة أخرى (part_page_edition)', b.part_page_edition);
    row('print2_edition', b.print2_edition);
    row('mousanef_id', b.mousanef_id);
    row('strong / fame / tarteeb', `${b.strong} / ${b.fame} / ${b.tarteeb}`);
    md += `\n`;
    if (b.card_info && b.card_info.trim()) {
      md += `**بطاقة الكتاب (card_info):**\n\n`;
      md += clean(b.card_info).split('\n').map(l => '> ' + l).join('\n') + '\n\n';
    }
    if (b.summary && b.summary.trim()) {
      md += `**وصف الكتاب (summary):**\n\n`;
      md += clean(b.summary).split('\n').map(l => l.trim()).filter(Boolean).map(l => '> ' + l).join('\n') + '\n\n';
    }
    md += `---\n\n`;
  }

  fs.writeFileSync('docs/books-details.md', md, 'utf8');
  console.log('wrote docs/books-details.md  (' + books.length + ' books, ' + (md.length/1024).toFixed(1) + ' KB)');
  await pool.end();
}
main().catch(console.error);
