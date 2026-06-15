-- Hadith service content (BookTOC_Services.json: 597K commentary records)
CREATE TABLE IF NOT EXISTS hadith_service_content (
    id BIGINT PRIMARY KEY,
    book_id INTEGER NOT NULL,
    book_name TEXT,
    local_node_id INTEGER,
    parent_id BIGINT,
    is_leaf BOOLEAN DEFAULT false,
    is_paragraph BOOLEAN DEFAULT false,
    next_id BIGINT,
    prev_id BIGINT,
    left_value BIGINT,
    right_value BIGINT,
    section_text TEXT,
    part_text TEXT,
    part_num SMALLINT,
    page_num INTEGER,
    tarf TEXT,
    content TEXT
);

CREATE INDEX IF NOT EXISTS idx_hsc_book_id ON hadith_service_content(book_id);
CREATE INDEX IF NOT EXISTS idx_hsc_parent_id ON hadith_service_content(parent_id);
CREATE INDEX IF NOT EXISTS idx_hsc_is_paragraph ON hadith_service_content(is_paragraph) WHERE is_paragraph = true;

-- Link table: hadiths → service commentary entries (HadithsServices.json: 919K rows)
CREATE TABLE IF NOT EXISTS hadith_service_links (
    hadith_id INTEGER NOT NULL,
    service_content_id BIGINT NOT NULL,
    type_id SMALLINT,
    reserve INTEGER,
    PRIMARY KEY (hadith_id, service_content_id)
);

CREATE INDEX IF NOT EXISTS idx_hsl_hadith_id ON hadith_service_links(hadith_id);
CREATE INDEX IF NOT EXISTS idx_hsl_type_id ON hadith_service_links(type_id);

-- Service type lookup (1-indexed from HadithsServicesTypes.json)
CREATE TABLE IF NOT EXISTS hadith_service_types (
    id SMALLINT PRIMARY KEY,
    name TEXT NOT NULL,
    column_key TEXT
);

INSERT INTO hadith_service_types (id, name, column_key) VALUES
(1,  'استدلال فقهي',                   'feqh'),
(2,  'الإدراج',                        'modrag'),
(3,  'الطب النبوي',                    'medicine'),
(4,  'أمثال الحديث',                   'amthal'),
(5,  'التواتر',                        'motawater'),
(6,  'الشروح',                         'sharh'),
(7,  'أسباب الورود',                   'asbab'),
(8,  'تخريج كتب التخريج والعلل',       'takhreg'),
(9,  'تخريج رواة',                     'rwah'),
(10, 'تخريج شروح',                     'compound_matn'),
(11, 'أصل',                            'asnad'),
(12, 'مخالف',                          'mokhtalaf'),
(13, 'شبهات',                          NULL),
(14, 'تفسير بالمأثور',                 'tafsser'),
(15, 'سيرة',                           'biography')
ON CONFLICT DO NOTHING;
