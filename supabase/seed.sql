-- IT Helpdesk — Full Seed Data
-- Jalankan SETELAH schema.sql di Supabase SQL Editor
-- File ini: data master lengkap (teams, PICs, apps, SLA, KB)
-- Aman dijalankan berulang (idempotent)

-- ============================================================
-- BERSIHKAN DATA LAMA (urutan FK)
-- ============================================================
delete from app_routing_pics;
delete from app_routing;
delete from kb_articles;
delete from pics;
delete from teams;
delete from sla_rules;

-- ============================================================
-- TEAMS (5 tim)
-- ============================================================
insert into teams (id, name, head_pic_id, head_name, head_email) values
  ('team-license',  'License Admin',            'p-license',  'License Admin',     'license.admin@lippo.id'),
  ('team-ivan',     'Ivan Tenusa Team',          'p-ivan',     'Ivan Tenusa',       'ivan.tenusa@lippo.id'),
  ('team-nicholas', 'Nicholas Suryatama Team',   'p-nicholas', 'Nicholas Suryatama','nicholas.suryatama@lippo.id'),
  ('team-joshua',   'Joshua Kartono Team',       'p-joshua',   'Joshua Kartono',    'joshua.kartono@lippo.id'),
  ('team-andika',   'Rachmad Andika Team',       'p-andika',   'Rachmad Andika',    'andika@lippoland.id');

-- ============================================================
-- PICs (13 orang)
-- ============================================================
insert into pics (id, name, email, team_id) values
  -- team-license
  ('p-license',  'License Admin',      'license.admin@lippo.id',      'team-license'),
  ('p-lady',     'Lady Yohana',        'lady.yohana@lippo.id',        'team-license'),
  ('p-eric',     'Eric Yonalis',       'eric.yonalis@lippo.id',       'team-license'),
  ('p-vio',      'Viona',              'viona@lippo.id',              'team-license'),
  -- team-ivan
  ('p-ivan',     'Ivan Tenusa',        'ivan.tenusa@lippo.id',        'team-ivan'),
  ('p-apri',     'Apri',               'apri@lippo.id',               'team-ivan'),
  ('p-kevin',    'Kevin',              'kevin@lippo.id',              'team-ivan'),
  ('p-lukas',    'Lukas Wijaya K',     'lukas.wijaya@lippo.id',       'team-ivan'),
  -- team-nicholas
  ('p-nicholas', 'Nicholas Suryatama', 'nicholas.suryatama@lippo.id', 'team-nicholas'),
  ('p-leo',      'Leonagata',          'leonagata@lippo.id',          'team-nicholas'),
  -- team-joshua
  ('p-joshua',   'Joshua Kartono',     'joshua.kartono@lippo.id',     'team-joshua'),
  ('p-christian','Christian',          'christian@lippo.id',          'team-joshua'),
  -- team-andika
  ('p-andika',   'Rachmad Andika',     'andika@lippoland.id',         'team-andika');

-- ============================================================
-- SLA RULES
-- ============================================================
insert into sla_rules (priority, target_hours, warning_percent) values
  ('Critical',  2, 75),
  ('High',      8, 75),
  ('Medium',   24, 75),
  ('Low',      72, 75);

-- ============================================================
-- APP ROUTING (semua apps + keyword auto-detection)
-- primary_pic_id = PIC default jika load-balancing tidak aktif
-- ============================================================
insert into app_routing (app_name, app_prefix, app_keywords, team_id, primary_pic_id) values

  -- ── PRJ ──────────────────────────────────────────────────
  ('[PRJ] - Cost Contract',           'PRJ', ARRAY['cost contract','cnc','costcontract'],               'team-nicholas', 'p-leo'),
  ('[PRJ] - Vendor Portal',           'PRJ', ARRAY['vendor portal','vendorportal',' vp '],              'team-nicholas', 'p-leo'),
  ('[PRJ] - Project System',          'PRJ', ARRAY['project system','prosys','psys'],                   'team-ivan',     'p-ivan'),
  ('[PRJ] - Cashflow',                'PRJ', ARRAY['cashflow','cash flow'],                             null,            null),
  ('[PRJ] - Cash Advance',            'PRJ', ARRAY['cash advance','open limit ca','cnc ca'],            null,            null),
  ('[PRJ] - Construction Activity',   'PRJ', ARRAY['construction activity','constact'],                  'team-nicholas', 'p-leo'),
  ('[PRJ] - QVL',                     'PRJ', ARRAY['qvl'],                                              null,            null),
  ('[PRJ] - DMHS',                    'PRJ', ARRAY['dmhs'],                                             null,            null),
  ('[PRJ] - DMT Framework',           'PRJ', ARRAY['dmt framework','dmt'],                              null,            null),
  ('[PRJ] - HandOver Monitoring',     'PRJ', ARRAY['handover monitoring','hom'],                        null,            null),
  ('[PRJ] - eTender',                 'PRJ', ARRAY['etender','e-tender'],                               null,            null),
  ('[PRJ] - Project Set Up',          'PRJ', ARRAY['project set up','project setup'],                   null,            null),
  ('[PRJ] - AP Management',           'PRJ', ARRAY['ap management'],                                    null,            null),
  ('[PRJ] - Legal Management System', 'PRJ', ARRAY['legal management','lms'],                           null,            null),

  -- ── TMD ──────────────────────────────────────────────────
  ('[TMD] - Billing System',          'TMD', ARRAY['billing system','billing','tagihan'],               'team-joshua',   'p-joshua'),
  ('[TMD] - Residential Services',    'TMD', ARRAY['residential services','residensial','residential'], 'team-joshua',   'p-joshua'),
  ('[TMD] - BCD System',              'TMD', ARRAY['bcd system','bcd'],                                 'team-joshua',   'p-joshua'),
  ('[TMD] - eTMD',                    'TMD', ARRAY['etmd','e-tmd'],                                     'team-joshua',   'p-christian'),
  ('[TMD] - Online Payment',          'TMD', ARRAY['online payment'],                                   'team-joshua',   'p-christian'),
  ('[TMD] - Cashier System',          'TMD', ARRAY['cashier system','cashier'],                         'team-joshua',   'p-christian'),
  ('[TMD] - Hand Over',               'TMD', ARRAY['tmd hand over','tmd handover'],                     'team-joshua',   'p-joshua'),
  ('[TMD] - LEAP',                    'TMD', ARRAY['leap'],                                             'team-joshua',   'p-christian'),

  -- ── CMN ──────────────────────────────────────────────────
  ('[CMN] - Personals',               'CMN', ARRAY['personals'],                                        null,            null),
  ('[CMN] - Tax System',              'CMN', ARRAY['tax system','tax','ppn','pajak'],                   'team-ivan',     'p-kevin'),
  ('[CMN] - Image Uploader',          'CMN', ARRAY['image uploader'],                                   null,            null),
  ('[CMN] - Email Blast System',      'CMN', ARRAY['email blast','blast email','blast system','blast'], 'team-joshua',   'p-christian'),
  ('[CMN] - SMS Campaign',            'CMN', ARRAY['sms campaign','sms'],                               null,            null),
  ('[CMN] - Document Management',     'CMN', ARRAY['document management','dms'],                        null,            null),
  ('[CMN] - Procurement',             'CMN', ARRAY['procurement'],                                      null,            null),
  ('[CMN] - Cynergi',                 'CMN', ARRAY['cynergi'],                                          'team-nicholas', 'p-leo'),
  ('[CMN] - Business Portal',         'CMN', ARRAY['business portal'],                                  null,            null),

  -- ── COR ──────────────────────────────────────────────────
  ('[COR] - SIMA',                    'COR', ARRAY['sima'],                                             null,            null),
  ('[COR] - HRG',                     'COR', ARRAY['hrg'],                                              null,            null),

  -- ── SDH ──────────────────────────────────────────────────
  ('[SDH] - Burial System',           'SDH', ARRAY['burial system','burial'],                           null,            null),

  -- ── SLS ──────────────────────────────────────────────────
  ('[SLS] - Budget Marketing',        'SLS', ARRAY['budget marketing','bm'],                            'team-ivan',     'p-apri'),
  ('[SLS] - PP Online',               'SLS', ARRAY['pp online'],                                        null,            null),
  ('[SLS] - Online Selling',          'SLS', ARRAY['online selling'],                                   null,            null),
  ('[SLS] - Property System',         'SLS', ARRAY['property system'],                                  null,            null),
  ('[SLS] - Commission System',       'SLS', ARRAY['commission system','newcom','komisi'],               'team-ivan',     'p-kevin'),
  ('[SLS] - Customer Portal',         'SLS', ARRAY['customer portal'],                                  null,            null),
  ('[SLS] - Launching System',        'SLS', ARRAY['launching system','launching'],                     null,            null),
  ('[SLS] - Leads Management',        'SLS', ARRAY['leads management','leads'],                         null,            null),
  ('[SLS] - PR Portal',               'SLS', ARRAY['pr portal','prportal'],                             'team-joshua',   'p-christian'),
  ('[SLS] - Siteplan Report',         'SLS', ARRAY['siteplan report','siteplan','site plan'],           'team-ivan',     'p-kevin'),
  ('[SLS] - Event Registration',      'SLS', ARRAY['event registration'],                               null,            null),
  ('[SLS] - Bank Portal',             'SLS', ARRAY['bank portal'],                                      null,            null),
  ('[SLS] - Cynergy',                 'SLS', ARRAY['cynergy'],                                          'team-nicholas', 'p-leo'),
  ('[SLS] - FSS Application',         'SLS', ARRAY['fss application','fss'],                            null,            null),
  ('[SLS] - COGS',                    'SLS', ARRAY['cogs'],                                             null,            null),
  ('[SLS] - Sales Portal',            'SLS', ARRAY['sales portal','salesportal'],                       'team-ivan',     'p-ivan'),
  ('[SLS] - Member Activation',       'SLS', ARRAY['member activation'],                                null,            null),
  ('[SLS] - Qontak',                  'SLS', ARRAY['qontak'],                                           null,            null),
  ('[SLS] - Midtrans',                'SLS', ARRAY['midtrans'],                                         null,            null),
  ('[SLS] - Dynamics',                'SLS', ARRAY['dynamics'],                                         null,            null),
  ('[SLS] - Sharepoint',              'SLS', ARRAY['sharepoint'],                                       null,            null),

  -- ── RPT ──────────────────────────────────────────────────
  ('[RPT] - Report Geneva',           'RPT', ARRAY['report geneva','geneva'],                           null,            null),

  -- ── OTH ──────────────────────────────────────────────────
  ('[OTH] - Others',                  'OTH', ARRAY[]::text[],                                           null,            null),

  -- ── BAS ──────────────────────────────────────────────────
  ('[BAS] - CCTV',                    'BAS', ARRAY['cctv'],                                             null,            null),
  ('[BAS] - Access Control',          'BAS', ARRAY['access control'],                                   null,            null),
  ('[BAS] - Boom gate',               'BAS', ARRAY['boom gate','boomgate'],                             null,            null),
  ('[BAS] - Lift',                    'BAS', ARRAY['lift'],                                             null,            null),
  ('[BAS] - Intercom',                'BAS', ARRAY['intercom'],                                         null,            null),
  ('[BAS] - Network',                 'BAS', ARRAY['bas network'],                                      null,            null),
  ('[BAS] - Presensi',                'BAS', ARRAY['presensi','absensi'],                               null,            null),
  ('[BAS] - Others',                  'BAS', ARRAY[]::text[],                                           null,            null);

-- ============================================================
-- KB ARTICLES (6 artikel awal)
-- ============================================================
insert into kb_articles (title, category, views, is_published, updated_at) values
  ('Cara request akses Sales Portal',         'SLS', 342, true, '2026-05-20'),
  ('Setup VPN untuk WFH',                     'OTH', 287, true, '2026-05-15'),
  ('Troubleshoot Cost Contract generate PO',  'PRJ', 198, true, '2026-05-10'),
  ('Format request Data On Demand',           'OTH', 156, true, '2026-05-08'),
  ('Cara submit promote production request',  'OTH', 134, true, '2026-05-05'),
  ('Email Blast - panduan template baru',     'CMN', 98,  true, '2026-04-28');

-- ============================================================
-- SELESAI
-- ============================================================
