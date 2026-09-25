<div dir="rtl">

# موسوعة الحديث الشريف

موسوعة حديثية مفتوحة المصدر على الويب، تنقل برنامج «موسوعة الحديث» من تطبيق سطح مكتب إلى موقع متاح للجميع،
مع الحفاظ على البيانات كاملة. تضم الموسوعة:

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

## English

An open-source web encyclopedia of hadith: 245 books, ~340,000 hadiths, 30,000+ narrators, isnad
chains, grading, takhrij and more, with a fully Arabic (RTL) interface. Built with Next.js 16,
React 19, TypeScript, Tailwind CSS v4 and PostgreSQL.

**Contributions are very welcome, from developers and from hadith scholars and researchers.**
All changes go through pull requests and are reviewed before merging. See
[CONTRIBUTING.md](CONTRIBUTING.md). Code is MIT-licensed; hadith texts and data are not covered by
the license.
