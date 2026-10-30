-- Indexes only the offline database has (scripts/offline/build-pglite-db.mjs). The device runs
-- PostgreSQL on one slow core, so queries the server answers by scanning need an index there.

-- Chains → hadiths: the narrator pages and the chain analyses look up a chain's hadiths
CREATE INDEX IF NOT EXISTS offline_isnad_hadiths_isnad ON public.isnad_hadiths USING btree (isnad_id, hadith_id);
