<div dir="rtl">

# موسوعة الحديث الشريف

[![الموقع المباشر](https://img.shields.io/badge/الموقع-مباشر-0f3d2e)](https://hadith-web-production.up.railway.app)
[![المساهمات مرحّب بها](https://img.shields.io/badge/المساهمات-مرحّب_بها-c9a45c)](CONTRIBUTING.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

![الصفحة الرئيسية](docs/screenshots/home.png)

موسوعة حديثية مفتوحة المصدر على الويب، مبنية على **برنامج خادم الحرمين الشريفين الجامع للحديث النبوي**،
مع الحفاظ على بياناته كاملة.

**الموقع المباشر:** https://hadith-web-production.up.railway.app

## لماذا نسخة ويب؟

البرنامج الأصلي تطبيق سطح مكتب لنظام Windows، وقد أبلغ **كثير من المستخدمين عن مشكلات في تشغيله على Windows**.
فنُقل البرنامج إلى موقع يعمل على أي جهاز فيه متصفح: الحاسوب والجوال والجهاز اللوحي، بلا تثبيت ولا إعداد.

## ما الذي تضمه الموسوعة؟

- **245 كتاباً** من كتب السنة ومصادرها
- **قرابة 340,000 حديث** مرتبة في أبواب وكتب
- **أكثر من 30,000 راوٍ** مع تراجمهم ومراتبهم وأقوال أئمة الجرح والتعديل فيهم
- **الأسانيد** وعرضها على شكل شجرة وشبكة للرواة
- الموضوعات، والتخريج، والأحكام على الأحاديث، والعلل، ومقارنة المتون، والمعجم (غريب الحديث)، والآيات القرآنية المرتبطة
- بحث في النصوص لا يتأثر بالتشكيل، مع خيارات للمطابقة وربط الشروط والتصفية حسب الكتاب والدرجة والموضوع

## صور من الموقع

| الحديث بسنده ومتنه | البحث في الأحاديث |
|---|---|
| ![صفحة الحديث](docs/screenshots/hadith.png) | ![البحث](docs/screenshots/search.png) |
| **ترجمة الراوي** | **محورية الرواة في الأسانيد** |
| ![ترجمة الراوي](docs/screenshots/narrator.png) | ![شبكة الرواة](docs/screenshots/network.png) |
| **كتب المتون الحديثية** | |
| ![الكتب](docs/screenshots/books.png) | |

## المساهمات مرحّب بها جداً 🤝

هذا مشروع وقفي مفتوح، و**نرحب بكل مساهمة، صغيرة كانت أو كبيرة**.
نحتاج إلى **المبرمجين** وإلى **أهل العلم والباحثين في علوم الحديث** على حدّ سواء،
ولا يلزمك أن تكون خبيراً لتبدأ: تصحيح خطأ إملائي واحد مساهمة نفرح بها.

**لأهل العلم والباحثين (بلا برمجة):**
- تصحيح نص حديث أو تشكيله
- التنبيه على خطأ في ترجمة راوٍ أو حكم أو تخريج
- مراجعة تقسيم الأبواب والموضوعات، واقتراح مصادر جديدة

يكفي أن [تفتح بلاغاً (Issue)](../../issues/new/choose) وتذكر رابط الصفحة والصواب مع المصدر.

**للمبرمجين:**
- إصلاح الأخطاء وتحسين الأداء وسرعة البحث
- تحسين الواجهة وتجربة الجوال
- إضافة ميزات جديدة وكتابة الاختبارات
- ابحث عن البلاغات الموسومة [`good first issue`](../../issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) لتبدأ منها

**جميع التعديلات تُرسل عبر طلب سحب (Pull Request)** ويراجعها القائمون على المشروع قبل دمجها،
فلا تتردد في المحاولة؛ لن يُكسر شيء. اقرأ [دليل المساهمة](CONTRIBUTING.md) للتفاصيل.

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

An open-source web edition of **برنامج خادم الحرمين الشريفين الجامع للحديث النبوي** (the Custodian of the
Two Holy Mosques' Comprehensive Hadith Program), with all of its data preserved.

**Live site:** https://hadith-web-production.up.railway.app

### Why a web version?

The original program is a Windows desktop application, and **many users reported problems running it on
Windows**. This project brings it to the web so it works on any device with a browser (desktop, phone or
tablet) with nothing to install.

### What's inside

- **245 books** of hadith and their sources
- **~340,000 hadiths**, organised by book and chapter
- **30,000+ narrators** with biographies, grades and the verdicts of the critics (al-jarh wa al-ta'dil)
- **Isnad chains**, shown as trees and as a narrator network
- Topics, takhrij, gradings, 'ilal, matn comparison, a lexicon of rare words and related Quranic verses
- Diacritic-insensitive full-text search with match modes, boolean operators and filters

The interface is fully Arabic (right-to-left). See the [screenshots above](#صور-من-الموقع).

### Contributions are very welcome 🤝

This is an open, non-profit project and **every contribution is welcome, however small**. We need both
**developers** and **hadith scholars and researchers**.

- **No coding needed:** found a wrong hadith text, diacritic, narrator biography, grading or takhrij?
  [Open an issue](../../issues/new/choose) with the page link and the correction, citing your source.
- **Developers:** bug fixes, search performance, UI and mobile improvements, new features and tests are all
  appreciated. Issues labelled [`good first issue`](../../issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)
  are a good place to start.

All changes go through pull requests and are reviewed before merging, so don't hesitate to try. See
[CONTRIBUTING.md](CONTRIBUTING.md).

### Tech stack

Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4 and PostgreSQL (raw SQL via `pg`).
To run locally you need Node.js 20+ and a PostgreSQL database loaded with the encyclopedia data; the only
required environment variable is `DATABASE_URL` (see the commands above).

### License

The code is [MIT-licensed](LICENSE). Hadith texts and data come from their original sources and are not
covered by this license.
