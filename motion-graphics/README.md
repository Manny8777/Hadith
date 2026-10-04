<div dir="rtl">

# أفلام تعريفية بالموسوعة

أفلامٌ قصيرة بالعربية الفصحى، بتعليقٍ صوتي وترجمة، تعرّف بموسوعة الحديث النبوي على [hadith.dev](https://hadith.dev).
كل رقمٍ ونصٍّ يظهر فيها مأخوذٌ من قاعدة بيانات الموسوعة.

## أفلام الميزات (مربعة، للنشر على X)

الترجمة مرسومةٌ داخل الصورة، فتُقرأ مع التشغيل الصامت. نص منشورٍ لكل فيلم في [features/x-posts.md](features/x-posts.md).

| الفيلم | ما يعرضه |
|---|---|
| [السند والمتن](features/sanad-narrated.mp4) | السند مقسومًا إلى رواته، وبطاقة الراوي عند الضغط عليه، والمتن بالتشكيل وبدونه |
| [شجرة الإسناد](features/isnad-tree-narrated.mp4) | أسانيد «إنما الأعمال بالنيات» في صحيح مسلم، ومدار الحديث عند يحيى بن سعيد الأنصاري |
| [الجرح والتعديل](features/narrators-narrated.mp4) | أقوال النقاد في رواة السند، وكل قولٍ منسوبٌ إلى قائله |
| [التخريج](features/takhrij-narrated.mp4) | 54 روايةً في 19 كتابًا، والمتابعات والشواهد |
| [مطابقة المتون](features/matn-compare-narrated.mp4) | نسبة تطابق الألفاظ بين الروايات، والروايات الموازية |
| [الشروح وغريب الحديث](features/sharh-gharib-narrated.mp4) | فتح الباري وعمدة القاري، ومعاني الغريب من النهاية |
| [البحث](features/search-narrated.mp4) | البحث في المتون دون تأثر بالتشكيل، والبحث بواسطة السند |
| [أقوال العلماء](features/rulings-narrated.mp4) | أقوال العلماء في الحكم مع مصادرها، وأحكام الدرر السنية |

## أفلام الصفحة الرئيسة (عريضة)

| الفيلم | ما يعرضه |
|---|---|
| [الفيلم الترويجي](promo/promo-narrated.mp4) ([الترجمة](promo/promo.srt)) | لمحاتٌ سريعة من ميزات الموسوعة، بلقطاتٍ حقيقية من الموقع |
| [ما الجامع؟](about/about-narrated.mp4) ([الترجمة](about/about.srt)) | ما الموقع وما ليس هو: يعرض كتب السنة كما هي ويُيسّرها، ولا يحكم على حديثٍ ولا راوٍ؛ الحكم من الدرر السنية |
| [الجامع في مساعدك الذكي](mcp/mcp-narrated.mp4) ([الترجمة](mcp/mcp.srt)) | خادم MCP: الإعداد في Claude وClaude Code، وتسجيل الدخول، ومثالٌ لسؤالٍ وجوابه |
| [ماذا تسأل مساعدك؟](mcp-uses/uses-narrated.mp4) ([الترجمة](mcp-uses/uses.srt)) | أمثلةٌ لخادم MCP: القارئ يسأل «أهذا حديث؟» و«ما أصله؟»، والباحث يسأل عن الروايات وألفاظها وحال الرواة — بأجوبة الأدوات الحقيقية |
| [من سطح المكتب إلى الويب](migration-film-narrated.mp4) ([الترجمة](migration-film.srt)) | كيف نُقل البرنامج من تطبيق ويندوز إلى موقعٍ على الويب |
| [ترقيم حرف والترقيم المطبوع](numbering-film-narrated.mp4) ([الترجمة](numbering-film.srt)) | لماذا يختلف رقم الحديث من طبعةٍ لأخرى، وكيف تعزو بدقة |

</div>

## How the films are made

Each film is an HTML page whose every frame is a pure function of time, rendered frame by frame in
headless Chromium and encoded with ffmpeg. The Arabic narration comes from Gemini TTS (Google AI
Studio); each scene is stretched to fit its line rather than the voice being sped up.

- `features/engine.js`, `features/base.css` — shared engine and look of the square feature films;
  `migration-film.html` and `numbering-film.html` carry their own copy of the engine.
- `<film>.html` — the film; `<film>.lines.json` — its narration, one line per scene.
- `audio*/` — the generated voice clips, kept so a film can be re-rendered without calling the API.
- `promo/` — the promo film: `capture.mjs` screenshots the running site into `promo/shots/`, which
  `promo.html` pans and zooms inside a browser window (`node motion-graphics/narrate.mjs --film promo/promo`).
- `render-film.mjs` — renders `<film>.html` to `<film>.mp4` (or stills with `--stills`).
- `narrate.mjs` — generates missing voice clips, fits the scenes to them, writes the captions
  (`<film>.srt`, and in the picture for the feature films), re-renders and mixes
  `<film>-narrated.mp4`.

```bash
node motion-graphics/narrate.mjs --film features/search          # re-render with the saved voice
node motion-graphics/narrate.mjs --film features/search --only 3  # regenerate line 3 (needs GEMINI_API_KEY)
node motion-graphics/narrate.mjs --film features/search --captions-only
```

Requires Node ≥ 22.18, ffmpeg, and Playwright's Chromium; `GEMINI_API_KEY` only for new voice clips.
