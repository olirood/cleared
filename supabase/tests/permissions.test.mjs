import { PGlite } from '@electric-sql/pglite';
import { citext } from '@electric-sql/pglite/contrib/citext';
import fs from 'fs';
const db = new PGlite({ extensions: { citext } });
const ok = (m) => console.log('OK  ', m), bad = (m) => { console.log('FAIL', m); process.exitCode = 1; };
// stand-ins for what Supabase provides
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth; create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
`);
await db.exec(fs.readFileSync(new URL('../migrations/20261101000000_init.sql', import.meta.url), 'utf8'));
await db.exec(`grant usage on schema public to authenticated;
  grant select, insert, update, delete on all tables in schema public to authenticated;
  revoke all on public.signatures from authenticated;
  grant select (id, participant_id, status, expires_at, signed_at, method, consent_version) on public.signatures to authenticated;
  grant usage, select on all sequences in schema public to authenticated;`);
ok('migración aplicada');
const U = { mar: '00000000-0000-0000-0000-00000000000a', oli: '00000000-0000-0000-0000-00000000000b', ext: '00000000-0000-0000-0000-00000000000c' };
const W = { apollo: '10000000-0000-0000-0000-000000000001', octavio: '10000000-0000-0000-0000-000000000002', kevin: '10000000-0000-0000-0000-000000000003' };
await db.exec(`
  insert into auth.users values ('${U.mar}'),('${U.oli}'),('${U.ext}');
  insert into workspaces (id,name,slug,letter_template) values ('${W.apollo}','Apollo Music','apollo','apollo'),('${W.octavio}','Octavio Cuadras','octavio','generic'),('${W.kevin}','Kevin Cuadras','kevin','generic');
  insert into memberships values ('${W.apollo}','${U.mar}','operator','Margarita',now()),('${W.octavio}','${U.oli}','owner','Oliver',now()),('${W.kevin}','${U.oli}','owner','Oliver',now());
`);
const as = async (uid, sql, params) => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid || ''}', false); set role authenticated;`);
  try { return await db.query(sql, params); } finally { await db.exec('reset role'); }
};
const expectErr = async (label, fn) => { try { await fn(); bad(label + ' (no falló)'); } catch (e) { ok(label + ' → ' + e.message.split('\n')[0]); } };

// Margarita da de alta a una compositora representada por Apollo
const mar = (await as(U.mar, `insert into people (owner_workspace_id, represented_by, legal_name, ipi, kinds) values ($1,$1,'Mariana Soto Valdez','00634567890','{songwriter}') returning id`, [W.apollo])).rows[0].id;
ok('Margarita crea un perfil en Apollo');
await expectErr('Margarita no puede crear perfiles a nombre de Octavio', () => as(U.mar, `insert into people (owner_workspace_id, legal_name) values ($1,'X')`, [W.octavio]));
// Oliver la ve en el directorio compartido, pero no la edita
const seen = (await as(U.oli, `select count(*)::int n from people where id=$1`, [mar])).rows[0].n;
seen === 1 ? ok('Oliver ve el perfil compartido') : bad('Oliver no ve el perfil compartido');
const upd = await as(U.oli, `update people set phone='555' where id=$1`, [mar]);
upd.affectedRows === 0 ? ok('Oliver no puede editar el perfil de Apollo') : bad('Oliver editó un perfil ajeno');
const oliP = (await as(U.oli, `insert into people (owner_workspace_id, legal_name, ipi) values ($1,'Compositor Octavio','00111111111') returning id`, [W.octavio])).rows[0].id;
await expectErr('IPI repetido rechazado', () => as(U.oli, `insert into people (owner_workspace_id, legal_name, ipi) values ($1,'Duplicado','00634567890')`, [W.octavio]));

// Oliver crea obra + grabación + split en Octavio con Mariana
const work = (await as(U.oli, `insert into works (workspace_id,title) values ($1,'Cielo Rojo') returning id`, [W.octavio])).rows[0].id;
await as(U.oli, `insert into recordings (workspace_id, work_id, title, isrc) values ($1,$2,'Cielo Rojo','MXA002600001')`, [W.octavio, work]);
const ag = (await as(U.oli, `insert into split_agreements (work_id, version) values ($1,1) returning id`, [work])).rows[0].id;
await as(U.oli, `insert into split_participants (agreement_id, person_id, role, share_bp) values ($1,$2,'lyricist',5000),($1,$3,'composer',4000)`, [ag, mar, oliP]);
await expectErr('No se envía si suma 90 %', () => as(U.oli, `update split_agreements set status='sent' where id=$1`, [ag]));
await as(U.oli, `update split_participants set share_bp=5000 where agreement_id=$1 and person_id=$2`, [ag, oliP]);
await expectErr('No se envía sin aprobación de Apollo', () => as(U.oli, `update split_agreements set status='sent' where id=$1`, [ag]));

// Margarita ve el split externo pero no la grabación ni el label copy
const mw = (await as(U.mar, `select count(*)::int n from works where id=$1`, [work])).rows[0].n;
mw === 1 ? ok('Margarita ve la obra externa porque representa a Mariana') : bad('Margarita no ve la obra externa');
const mr = (await as(U.mar, `select count(*)::int n from recordings where work_id=$1`, [work])).rows[0].n;
mr === 0 ? ok('Margarita no ve la grabación ni el label copy de Octavio') : bad('Margarita ve la grabación de Octavio');
const mp = await as(U.mar, `update split_participants set share_bp=9000 where agreement_id=$1`, [ag]);
mp.affectedRows === 0 ? ok('Margarita no puede cambiar porcentajes del split ajeno') : bad('Margarita cambió porcentajes');
// Kevin no tiene nada que ver: un usuario externo no ve nada
const ew = (await as(U.ext, `select count(*)::int n from works`)).rows[0].n;
ew === 0 ? ok('Un usuario sin espacio no ve obras') : bad('Usuario externo ve obras');
await expectErr('Un usuario sin espacio no puede aprobar', () => as(U.ext, `insert into split_approvals (agreement_id, workspace_id, status, participants_sig) values ($1,$2,'approved',participants_sig($1))`, [ag, W.apollo]));

// Margarita aprueba
await as(U.mar, `insert into split_approvals (agreement_id, workspace_id, status, participants_sig) values ($1,$2,'approved',participants_sig($1))`, [ag, W.apollo]);
ok('Margarita aprueba');
// cambio después de aprobar → aprobación vence
await as(U.oli, `update split_participants set share_bp=5500 where agreement_id=$1 and person_id=$2`, [ag, mar]);
await as(U.oli, `update split_participants set share_bp=4500 where agreement_id=$1 and person_id=$2`, [ag, oliP]);
await expectErr('Cambio después de aprobar invalida la aprobación', () => as(U.oli, `update split_agreements set status='sent' where id=$1`, [ag]));
await as(U.mar, `update split_approvals set participants_sig=participants_sig($1), decided_by=auth.uid() where agreement_id=$1 and workspace_id=$2`, [ag, W.apollo]);
await as(U.oli, `update split_agreements set status='sent' where id=$1`, [ag]);
ok('Con aprobación vigente, Oliver envía a firma');
await expectErr('Split enviado: no se cambian porcentajes', () => as(U.oli, `update split_participants set share_bp=5000 where agreement_id=$1 and person_id=$2`, [ag, mar]));
await expectErr('Split enviado: no se agregan participantes', () => as(U.oli, `insert into split_participants (agreement_id, person_id, role, share_bp) values ($1,$2,'composer',1)`, [ag, oliP]));
await expectErr('Segunda versión vigente rechazada', () => as(U.oli, `insert into split_agreements (work_id, version) values ($1,2)`, [work]));
// firmas: el link nunca se lee
await db.exec(`insert into signatures (participant_id, token_hash) select id, 'h-' || id from split_participants where agreement_id='${ag}'`);
await expectErr('Nadie puede leer el link de firma', () => as(U.oli, `select token_hash from signatures`));
const sv = (await as(U.oli, `select count(*)::int n from signatures`)).rows[0].n;
sv === 2 ? ok('Oliver ve el estado de las firmas') : bad('Oliver no ve firmas');
await expectErr('ISRC repetido rechazado', () => as(U.oli, `insert into recordings (workspace_id, title, isrc) values ($1,'Otro','MXA002600001')`, [W.octavio]));
