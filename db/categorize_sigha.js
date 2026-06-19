const fs = require('fs');
// read ranked tsv (id, text, links, weighted)
const lines = fs.readFileSync('db/sigha_used.tsv','utf8').trim().split('\n').slice(1);
const rows = lines.map(l => { const [id,text,links,weighted] = l.split('\t'); return {id:+id,text,links:+links,weighted:+weighted}; })
  .filter(r => r.text !== '??');

function cat(t){
  t = t.trim();
  const s = (...arr)=>arr.some(p=>t.startsWith(p));
  if (t.includes('حكم العنعنة')||t.includes('حكم السماع')||t.includes('صريح في السماع')) return '0. تصنيفات (tags)';
  if (t==='عن'||t==='أن'||t==='إن'||s('عن ','أن ','إن ','عمن','أنه','أنها','أنهم','إنه')) return '1. العنعنة (عن/أن)';
  if (s('حدث','ثنا','قثنا','تحدث','يحدث','محدث','نا ')||t==='نا'||t==='حدثنى'||t==='حدثننا') return '2. السماع (حدثنا/ثنا/نا)';
  if (s('سمع','أسمع','يسمع')) return '3. السماع (سمعت/سمع)';
  if (s('أخبر','خبر','يخبر','تخبر')||t==='أنا'||s('أنا ')) return '4. الإخبار (أخبرنا/أنا)';
  if (s('أنبأ','أبنا','نبأ','نبئ','أنبا','نبا','ابنا','أبتنا','أنبئ','نبؤ')) return '5. الإنباء (أنبأنا/أبنا)';
  if (s('قرأ','قرئ','قراءة','أقرأ','عرض','يعرض')) return '6. القراءة/العرض على الشيخ';
  if (t==='إجازة'||s('أجاز')||t.includes('إجازة')) return '7. الإجازة';
  if (s('ناول','أناول')||t.includes('مناولة')) return '8. المناولة';
  if (s('كتب','كاتب','كتاب','كتبت','كتبنا')||t.includes('مكاتبة')) return '9. المكاتبة (كتب إليّ)';
  if (s('وجد','نسخ')||t.includes('في كتاب')&&s('رأيت','قرأت','شهدت','وجدت')) return '10. الوجادة (وجدت في كتاب)';
  if (s('أوص','وصية')||t.includes('وصية')) return '11. الوصية';
  if (s('أعلم','علم','أذن')||t.includes('أذن')) return '12. الإعلام / الإذن';
  if (s('قال','قلت','قل','قالت','قالوا','قالا','يقول','تقول','قول','قيل','يقال','فقال')) return '13. القول (قال/قلت)';
  if (s('سأل','سئل','أسأل','نسأل','يسأل','تسأل','استأذن','استفت')) return '14. السؤال (سألت/سُئل)';
  if (s('ذكر','ذاكر','تذاكر','يذكر','أذكر','حكى','حكاية','حكاه')) return '15. الذكر/المذاكرة';
  if (s('رأى','رأيت','رأت','رئي','رأين','شهد','أشهد','نشهد','حضر')) return '16. الرؤية/الشهادة/الحضور';
  if (s('دخل','كنت','كنا','لقي','لقيت','لقين','جلس','صحب','خرج','قدم','جاء','أتى','أتي','أتين','أتيت','أتان','أقبل','انطلق','رجع','مرر','ضفت','اصطحب')) return '17. اللقاء/الحضور (لقيت/كنت عند)';
  if (s('رفع','يرفع','رد','يرد')) return '18. الرفع (يرفعه إلى)';
  if (s('بلغ')) return '19. البلاغ (بلغني)';
  if (s('أمر','بعث','أرسل','أوصى','دفع','أخرج','أخذ','أعطى','أعطان','ثبت','وثبت','لقّن','لقن','زاد','أنشد','صحب')) return '20. أفعال أخرى (أمرني/بعثني/دفع إليّ…)';
  if (s('زعم','يزعم','أحسب','أظن','لعل','أرى','يرى')) return '21. صيغ الظن/الشك (زعم/أحسب)';
  return '22. متفرقات أخرى';
}

const groups = {};
rows.forEach(r => { const c = cat(r.text); (groups[c] = groups[c]||[]).push(r); });

let md = '# صيغ التحمّل والأداء بين الرواة في سلاسل الإسناد\n\n';
md += `إجمالي الصيغ المُستعمَلة فعلاً بين الرواة: **${rows.length}** صيغة (= كامل جدول \`isnad_tahdeth_types\`).\n`;
md += `العمود "links" = عدد الوصلات بين راوٍ وراوٍ التي استُعملت فيها الصيغة. مرتّبة تنازليًا.\n\n`;

const order = Object.keys(groups).sort((a,b)=> parseInt(a)-parseInt(b));
let totalCheck = 0;
for (const g of order){
  const arr = groups[g].sort((a,b)=>b.links-a.links);
  totalCheck += arr.length;
  const sum = arr.reduce((x,r)=>x+r.links,0);
  md += `## ${g}  —  ${arr.length} صيغة، ${sum.toLocaleString()} وصلة\n\n`;
  md += arr.map(r=>`- ${r.text.trim()}  \`(${r.links})\``).join('\n');
  md += '\n\n';
}
fs.writeFileSync('db/sigha_catalog.md', md, 'utf8');
console.log('wrote db/sigha_catalog.md   (categorized total:', totalCheck, ')');

// also print a compact family summary to console
console.log('\n=== family summary (count | links) ===');
for (const g of order){
  const arr = groups[g];
  const sum = arr.reduce((x,r)=>x+r.links,0);
  console.log(g.padEnd(40), String(arr.length).padStart(4), '|', sum.toLocaleString());
}
