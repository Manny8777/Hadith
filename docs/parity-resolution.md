# Parity resolution: matn comparisons and source service types

## Matn comparison pairs

The legacy `HMatnComparison1..33` store contains **8,028,203 rows** and **7,820,551 distinct** `(MasterMatnID, SlaveMatnID)` keys. The apparent 238-pair gap is not a set of repairable hadith comparisons:

- **105** distinct keys have a zero, negative, or otherwise non-positive component.
- **133** distinct keys exceed the valid hadith-id ceiling `341616`; these include the legacy `1,910,425` sentinel and corrupt large integer values.
- **7,820,313** valid hadith-id pairs remain.
- The export and production `matn_comparison_hadith` both contain all **7,820,313** valid pairs: **0 missing, 0 extra**.
- `matn_comparison_hadith` has no non-positive or out-of-range rows.

The 238 values are therefore deliberately rejected rather than fabricated into the database. Re-run the independent source audit with:

```text
legacy-audit/harness/.cmpvenv/Scripts/python.exe db/audit_matn_pair_gap.py
```

The Node verifier checks the loaded table without mutation:

```text
node db/verify_matn_comparison_hadith.js
```

## `شبهات` service type

The source table `HadithsServicesTypes` has sparse IDs, not a contiguous 1–15 sequence:

```text
1..12, 15=شبهات, 16=تفسير بالمأثور, 17=سيرة
```

The previous web seed incorrectly renumbered the final three entries as 13, 14, and 15. That also left the real `TypeID=17` biography links without a correctly named lookup row. The repair:

- restores the sparse source IDs;
- keeps `شبهات` as a canonical service type with `column_key = NULL`;
- does **not** invent a `shubah` boolean, because `HadithServicesState` has no such field;
- reports the source-link count separately in the service index;
- makes the zero-link `شبهات` type visible and explicit rather than calling it fabricated or unmapped.

The repair is transactional and idempotent:

```text
node db/repair_service_types.js --check
node db/repair_service_types.js
```

```text
Database invariant after repair:

hadith_service_types = 15 rows with IDs 1..12,15,16,17
TypeID 15 (شبهات) = 0 source links in the legacy HadithsServices table
TypeID 17 (سيرة) = 8,528 current web links
```

The `شبهات` zero is faithful: the legacy `HadithsServices` table itself has no `TypeID=15` rows. The content search for the word `شبهات` must not be used to invent hadith-to-service links.
