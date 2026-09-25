<div dir="rtl">

# دليل المساهمة

[English version below ↓](#contributing-guide)

جزاك الله خيراً على رغبتك في المشاركة. هذا المشروع يعتمد على مساهمة المبرمجين وأهل العلم معاً.

## كيف تُقبل التعديلات؟

لا يمكن لأحد تعديل المستودع مباشرة. **كل تعديل يُرسل عبر طلب سحب (Pull Request)**،
ثم يراجعه القائمون على المشروع ويدمجونه أو يطلبون تعديلات عليه.

## إن لم تكن مبرمجاً

إذا وجدت خطأً في نص حديث أو تشكيله، أو في ترجمة راوٍ، أو في حكم أو تخريج، أو أردت اقتراح شيء:

1. افتح [بلاغاً جديداً (Issue)](../../issues/new).
2. اذكر رابط الصفحة في الموقع، وموضع الخطأ، والصواب **مع ذكر المصدر** (الكتاب، الطبعة، الجزء والصفحة).

الإحالة إلى المصدر أساسية، فهي التي تمكّن المراجعين من التحقق من التصحيح.

## إن كنت مبرمجاً

1. انسخ المستودع إلى حسابك (**Fork**).
2. أنشئ فرعاً جديداً لتعديلك: `git checkout -b fix/وصف-مختصر`
3. نفّذ التعديل، وشغّل الفحوص المتاحة:
   ```bash
   npm run typecheck
   npm run build
   ```
4. أرسل التعديلات إلى نسختك ثم افتح **طلب سحب (Pull Request)** إلى الفرع `master`.
5. اشرح في الطلب ما الذي غيّرته ولماذا، وأرفق صوراً إن كان التعديل في الواجهة.

### إرشادات

- **اجعل كل طلب سحب محصوراً في موضوع واحد**، فذلك أسهل في المراجعة.
- **لا تضع أي كلمة مرور أو رابط قاعدة بيانات في الكود.** استخدم المتغير `DATABASE_URL` فقط
  (وفي سكربتات `db/` استخدم `db/dbenv.js`).
- استعلامات SQL تُكتب مباشرة عبر `lib/db.ts`، ويجب تمرير المدخلات كمعاملات (`$1`، `$2`...) لا بدمجها في النص.
- الواجهة عربية من اليمين إلى اليسار؛ تأكد من أن تعديلك يظهر سليماً على الجوال أيضاً.
- حافظ على أسلوب الكود المحيط بتعديلك.

### تعديل البيانات

تعديلات قاعدة البيانات (نصوص الأحاديث، التراجم، الأحكام...) لا تتم من خلال الكود مباشرة.
أرسلها كبلاغ (Issue) مع المصادر، أو كسكربت في `db/` يوضّح التعديل ويمكن مراجعته قبل تشغيله.

## أسئلة؟

افتح بلاغاً (Issue) وسنجيبك بإذن الله.

</div>

---

# Contributing Guide

Thank you for wanting to take part. This project depends on developers and scholars working together.

## How are changes accepted?

Nobody can change the repository directly. **Every change is submitted as a pull request**, which the
maintainers review and then merge or ask you to adjust.

## If you are not a programmer

If you find an error in a hadith's text or vocalization, in a narrator's biography, or in a grading or
takhrij, or you want to suggest something:

1. Open a [new issue](../../issues/new).
2. Give the link to the page on the site, where the error is, and the correction **with its source**
   (book, edition, volume and page).

Citing the source is essential: it is what lets reviewers verify the correction.

## If you are a programmer

1. **Fork** the repository to your account.
2. Create a branch for your change: `git checkout -b fix/short-description`
3. Make the change and run the available checks:
   ```bash
   npm run typecheck
   npm run build
   ```
4. Push to your fork and open a **pull request** against the `master` branch.
5. Explain in the pull request what you changed and why, and attach screenshots for interface changes.

### Guidelines

- **Keep each pull request to one topic**; it makes review easier.
- **Never put a password or database address in the code.** Use the `DATABASE_URL` environment
  variable only (and `db/dbenv.js` in the `db/` scripts).
- SQL queries go through `lib/db.ts`, and inputs must be passed as parameters (`$1`, `$2`, ...), never
  concatenated into the query text.
- The interface is Arabic and right-to-left; make sure your change also looks right on mobile.
- Follow the style of the code around your change.

### Data changes

Changes to the database (hadith texts, biographies, gradings, ...) are not made through the code
directly. Send them as an issue with sources, or as a script in `db/` that describes the change and can
be reviewed before it is run.

## Questions?

Open an issue and we will answer, in sha' Allah.
