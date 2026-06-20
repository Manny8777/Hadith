-- ════════════════════════════════════════════════════════════════════
-- المسند المصنف المعلل — dedicated tables for the /musnad-musannaf feature
-- Isolated (ilal_ prefix), additive, reversible. Links INTO railway data
-- via narrators(id) and hadith_toc.main_id (the "lens" bridge).
-- Teardown: DROP TABLE ilal_refs, ilal_ilal, ilal_takhrij, ilal_entries, ilal_companions CASCADE;
-- ════════════════════════════════════════════════════════════════════

-- المسند منظَّم بالصحابة
CREATE TABLE IF NOT EXISTS ilal_companions (
  id           SERIAL PRIMARY KEY,
  seq          INTEGER,                        -- ترتيب الصحابي في الكتاب (٤)
  name         TEXT NOT NULL,                  -- أبيض بن حمال المأربي
  slug         TEXT UNIQUE,                    -- abyad-ibn-hammal (URL)
  title_page   INTEGER,                        -- musnad.db page_num لصفحة العنوان
  tarjama      TEXT,                            -- ترجمة الصحابي (من الحاشية)
  narrator_id  INTEGER REFERENCES narrators(id) -- ربط بالراوي في railway
);
CREATE INDEX IF NOT EXISTS idx_ilal_comp_slug ON ilal_companions(slug);

-- كل حديث في الكتاب
CREATE TABLE IF NOT EXISTS ilal_entries (
  id            SERIAL PRIMARY KEY,
  companion_id  INTEGER REFERENCES ilal_companions(id) ON DELETE CASCADE,
  seq           INTEGER,                       -- ترتيب داخل الكتاب
  hadith_no     INTEGER,                       -- رقم الحديث في الكتاب (٩٨)
  isnad_context TEXT,                           -- عن سعيد بن أبيض، عن أبيه أبيض بن حمال
  matn          TEXT,                           -- «المتن»
  lafz_attr     TEXT,                           -- "اللفظ لابن ماجة"
  judgment      TEXT,                           -- حكم المؤلفين: "إسناده ضعيف؛ ..."
  juz           INTEGER,
  print_page    INTEGER,                        -- رقم الصفحة المطبوعة (٢١٠)
  page_num      INTEGER,                        -- musnad.db page_num للنص (٣٢٥)
  matched_main_id  INTEGER,                     -- hadith_toc.main_id الممثّل ← عدسة IsnadTree
  takhrij_group_id INTEGER,                     -- takhrij.group_id لجلب كل الأسانيد المتوازية
  body_raw      TEXT,                           -- النص الخام (مرجع)
  foot_raw      TEXT                            -- الحاشية الخام
);
CREATE INDEX IF NOT EXISTS idx_ilal_entry_comp ON ilal_entries(companion_id);

-- مصادر التخريج لكل حديث — الجسر إلى بيانات railway
CREATE TABLE IF NOT EXISTS ilal_takhrij (
  id              SERIAL PRIMARY KEY,
  entry_id        INTEGER REFERENCES ilal_entries(id) ON DELETE CASCADE,
  sort            INTEGER,
  source_book     TEXT,                         -- "الدارمي" / "ابن ماجة"
  source_no       TEXT,                         -- "٢٧٧١" (كما كُتب)
  source_no_int   INTEGER,                      -- 2771
  railway_book_id INTEGER REFERENCES books(id), -- books.id المقابل (9, 6, 3...)
  matched_main_id INTEGER,                      -- hadith_toc.main_id ← الجسر إلى IsnadTree
  edition_kb_id   INTEGER,                      -- معرّف النسخة المعتمدة في KetabOnline
  edition_note    TEXT,                          -- "ت الغمري، فتح المنان"
  isnad_text      TEXT,                          -- إسناد المصدر (قال: أخبرنا...)
  match_status    TEXT DEFAULT 'pending'        -- matched / unmatched / edition-mismatch
);
CREATE INDEX IF NOT EXISTS idx_ilal_takhrij_entry ON ilal_takhrij(entry_id);
CREATE INDEX IF NOT EXISTS idx_ilal_takhrij_main ON ilal_takhrij(matched_main_id);

-- العلل — أقوال العلماء في الرواة (من الفوائد)
CREATE TABLE IF NOT EXISTS ilal_ilal (
  id            SERIAL PRIMARY KEY,
  entry_id      INTEGER REFERENCES ilal_entries(id) ON DELETE CASCADE,
  sort          INTEGER,
  narrator_id   INTEGER REFERENCES narrators(id),  -- الراوي المُعَلّ (مربوط)
  narrator_name TEXT,                           -- كما كُتب
  scientist     TEXT,                            -- "الذهبي" / "ابن القطان"
  say_text      TEXT,                            -- "ثابت بن سعيد... لا يعرف"
  garh_label    TEXT,                            -- "لا يعرف" / "مجهول"
  source_ref    TEXT                             -- «ميزان الاعتدال» ١/٣٦٤
);
CREATE INDEX IF NOT EXISTS idx_ilal_ilal_entry ON ilal_ilal(entry_id);

-- إحالات: المسند الجامع / تحفة الأشراف / مصادر ثانوية
CREATE TABLE IF NOT EXISTS ilal_refs (
  id        SERIAL PRIMARY KEY,
  entry_id  INTEGER REFERENCES ilal_entries(id) ON DELETE CASCADE,
  sort      INTEGER,
  ref_book  TEXT,                               -- "المسند الجامع" / "الطبراني"
  ref_no    TEXT,                               -- "٩٨"
  kind      TEXT                                -- primary-index / secondary
);
CREATE INDEX IF NOT EXISTS idx_ilal_refs_entry ON ilal_refs(entry_id);
