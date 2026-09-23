const {Client}=require('pg');
const c=new Client({connectionString:require('./db/dbenv.js').url(),ssl:{rejectUnauthorized:false}});
c.connect().then(async ()=>{
  const tables=['takhrij','lexicon_categories','lexicon_hadith','lexicon_items','subject_categories','subject_items','hadith_subjects','matn_dates','gwamh','gwamh_items','hadith_index_categories','hadith_index_items','hadith_judgment_hits','hadith_judgment_links','hadith_judgments','amthal','authors','narrator_biography','narrator_books','narrator_criticism','narrator_grading','narrator_grading_terms','narrator_relation_types','narrator_relations','narrator_scientists','narrators','isnad_chains','isnad_hadiths','isnad_relation_types','isnad_relations','isnad_tahdeth','isnad_tree','hadith_service_content','hadith_service_links','hadith_service_types','hadith_services','hadith_toc','books','matn_comparison'];
  for(const t of tables){
    const sql = "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='" + t + "' ORDER BY ordinal_position";
    const r=await c.query(sql);
    console.log(JSON.stringify({table:t,cols:r.rows}));
  }
  c.end();
}).catch(e=>console.error(e));
