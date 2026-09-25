<div dir="rtl">

# موسوعة الحديث الشريف

[English version below ↓](#hadith-encyclopedia)

موسوعة حديثية مفتوحة المصدر على الويب، تنقل «برنامج خادم الحرمين الشريفين الجامع للحديث النبوي» من تطبيق ويندوز إلى موقع متاح للجميع،
مع الحفاظ على البيانات كاملة؛ إذ واجه كثير من المستخدمين صعوبة في تشغيل البرنامج على أجهزتهم. تضم الموسوعة:

- **245 كتاباً** من كتب السنة ومصادرها
- **قرابة 340,000 حديث** مرتبة في أبواب وكتب
- **أكثر من 30,000 راوٍ** مع تراجمهم ومراتبهم وأقوال أئمة الجرح والتعديل فيهم
- **الأسانيد** وعرضها على شكل شجرة وشبكة للرواة
- الموضوعات، والتخريج، والأحكام على الأحاديث، والعلل، ومقارنة المتون، والمعجم (غريب الحديث)، والآيات القرآنية المرتبطة
- بحث في النصوص لا يتأثر بالتشكيل

**الموقع المباشر:** https://hadith-web-production.up.railway.app

## دعوة للمشاركة

هذا مشروع وقفي مفتوح، ونحتاج إلى مشاركة **المبرمجين** و**أهل العلم والباحثين في علوم الحديث**.
كل إسهام مرحّب به، صغيراً كان أو كبيراً:

- **للمبرمجين:** إصلاح الأخطاء، تحسين الأداء وسرعة البحث، تحسين الواجهة وتجربة الجوال، إضافة ميزات جديدة، كتابة الاختبارات.
- **لأهل العلم والباحثين:** تصحيح نص حديث أو تشكيله، التنبيه على خطأ في ترجمة راوٍ أو حكم أو تخريج، مراجعة تقسيم الأبواب والموضوعات، اقتراح مصادر جديدة.

**جميع التعديلات تُرسل عبر طلب سحب (Pull Request)** ويراجعها القائمون على المشروع قبل دمجها.
لا يستطيع أحد تعديل المشروع مباشرة، فلا تتردد في المحاولة. ومن لا يعرف البرمجة يمكنه
[فتح بلاغ (Issue)](../../issues) يصف فيه الخطأ أو الاقتراح.

اقرأ [دليل المساهمة](CONTRIBUTING.md) للتفاصيل.

## التشغيل محلياً

يتطلب Node.js 20 أو أحدث، وقاعدة بيانات PostgreSQL محمّلة ببيانات الموسوعة.

```bash
npm install
echo 'DATABASE_URL=postgresql://postgres:localdev@localhost:5432/railway' > .env
docker compose up -d   # اختياري: قاعدة PostgreSQL محلية
npm run dev            # http://localhost:3000
```

المتغير الوحيد المطلوب هو `DATABASE_URL`. لا تضعه أبداً في الكود: ملفات `.env` مستثناة من git.

## التقنيات وهيكل المشروع

- Next.js 16 (App Router)، React 19، TypeScript، Tailwind CSS v4
- PostgreSQL باستعلامات SQL مباشرة عبر `pg` (بلا ORM)
- الواجهة عربية من اليمين إلى اليسار بالكامل

| المجلد | المحتوى |
|---|---|
| `app/` | الصفحات، وواجهات البرمجة في `app/api/` |
| `lib/` | الاتصال بقاعدة البيانات والأدوات المشتركة |
| `db/` | مخطط قاعدة البيانات وسكربتات الاستيراد والصيانة |
| `scripts/`، `tests/` | الفحوص والاختبارات (انظر `package.json`) |
| `docs/` | وثائق المشروع |

## الترخيص

الكود البرمجي مرخّص بـ[رخصة MIT](LICENSE). أما نصوص الأحاديث والبيانات فمأخوذة من مصادرها الأصلية ولا تشملها هذه الرخصة.

</div>

---

# Hadith Encyclopedia

An open-source web version of **برنامج خادم الحرمين الشريفين الجامع للحديث النبوي** (the Custodian of
the Two Holy Mosques' Comprehensive Hadith Program), moved from a Windows desktop application to a
website anyone can use, with all of its data preserved. It was built because many users had trouble
running the Windows program. The encyclopedia includes:

- **245 books** of hadith and their sources
- **~340,000 hadiths**, organized into books and chapters
- **30,000+ narrators**, with biographies, ranks, and the verdicts of the critics (al-jarh wa al-ta'dil)
- **Isnad chains**, shown as trees and as a narrator network
- Topics, takhrij, hadith gradings, 'ilal (hidden defects), matn comparison, a lexicon of rare
  words (gharib al-hadith), and related Quranic verses
- Full-text search that ignores diacritics (tashkeel)

**Live site:** https://hadith-web-production.up.railway.app

## Call for contributors

This is an open, charitable (waqf) project, and it needs both **developers** and **hadith scholars and
researchers**. Every contribution is welcome, big or small:

- **Developers:** fix bugs, improve performance and search speed, improve the interface and mobile
  experience, add features, write tests.
- **Scholars and researchers:** correct a hadith's text or vocalization, report an error in a
  narrator's biography, grading or takhrij, review how chapters and topics are organized, suggest new
  sources.

**All changes are submitted as pull requests** and reviewed by the maintainers before they are merged.
Nobody can change the project directly, so don't hesitate to try. If you don't code, you can
[open an issue](../../issues) describing the error or suggestion, **with the source** (book, edition,
volume and page).

See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## Running locally

Requires Node.js 20+ and a PostgreSQL database loaded with the encyclopedia data.

```bash
npm install
echo 'DATABASE_URL=postgresql://postgres:localdev@localhost:5432/railway' > .env
docker compose up -d   # optional: local PostgreSQL
npm run dev            # http://localhost:3000
```

`DATABASE_URL` is the only required setting. Never put it in the code: `.env` files are gitignored,
and scripts in `db/` read it through `db/dbenv.js`.

## Stack and layout

- Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4
- PostgreSQL with raw SQL through `pg` (no ORM)
- Fully Arabic, right-to-left interface

| Folder | Contents |
|---|---|
| `app/` | Pages, and API routes in `app/api/` |
| `lib/` | Database pool and shared helpers |
| `db/` | Schema, import and maintenance scripts |
| `scripts/`, `tests/` | Checks and tests (see `package.json`) |
| `docs/` | Project notes |

## License

The code is released under the [MIT License](LICENSE). The hadith texts and data come from their
original sources and are not covered by this license.
