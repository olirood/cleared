// Splits y firmas por enlace
import { createHash } from 'crypto';
import { setupDb } from './setup.mjs';
const { db, ws: W, as, ok, bad, expectErr } = await setupDb();
const h = (t) => createHash('sha256').update(t).digest('hex');
const U = { mar: '00000000-0000-0000-0000-00000000000a', oli: '00000000-0000-0000-0000-00000000000b', ext: '00000000-0000-0000-0000-00000000000c' };
await db.exec(`
  set session_replication_role = replica;
  insert into auth.users values ('${U.mar}','mar@test'),('${U.oli}','oli@test'),('${U.ext}','ext@test');
  set session_replication_role = origin;
  insert into memberships (workspace_id, user_id, role) values ('${W.apollo}','${U.mar}','operator'),('${W.octavio}','${U.oli}','owner'),('${W.kevin}','${U.oli}','owner');
`);
const one = async (uid, sql, p) => (await as(uid, sql, p)).rows[0];

const mariana = (await one(U.mar, `insert into people (owner_workspace_id, represented_by, legal_name, ipi, pro, kinds) values ($1,$1,'Mariana Soto Valdez','00634567890','SACM','{songwriter}') returning id`, [W.apollo])).id;
const kev = (await one(U.oli, `insert into people (owner_workspace_id, legal_name, pro, kinds) values ($1,'Kevin Cuadras','SACM','{songwriter,artist}') returning id`, [W.kevin])).id;
const work = (await one(U.oli, `insert into works (workspace_id, title, artist) values ($1,'Cielo Rojo','Kevin Cuadras') returning id`, [W.kevin])).id;
const ag = (await one(U.oli, `insert into split_agreements (work_id, version) values ($1,1) returning id`, [work])).id;
await as(U.oli, `insert into split_participants (agreement_id, person_id, role, share_bp, position) values ($1,$2,'songwriter',5000,0),($1,$3,'songwriter',5000,1)`, [ag, kev, mariana]);
await as(U.mar, `insert into split_approvals (agreement_id, workspace_id, status, participants_sig) values ($1,$2,'approved',participants_sig($1))`, [ag, W.apollo]);
await as(U.oli, `update split_participants set snapshot = jsonb_build_object('legal_name', p.legal_name, 'ipi', p.ipi, 'pro', p.pro) from people p where p.id = person_id and agreement_id = $1`, [ag]);
await as(U.oli, `update split_agreements set status='sent', content_sha256=$2 where id=$1`, [ag, h('contenido')]);
ok('Split enviado con aprobación de Apollo');
const parts = (await as(U.oli, `select id, person_id from split_participants where agreement_id=$1`, [ag])).rows;
const pKev = parts.find((p) => p.person_id === kev).id, pMar = parts.find((p) => p.person_id === mariana).id;

// enlaces
await as(U.oli, `select issue_signature_link($1,$2)`, [pKev, h('tok-kevin')]);
ok('Oliver genera el enlace de Kevin');
await as(U.mar, `select issue_signature_link($1,$2)`, [pMar, h('tok-mariana')]);
ok('Margarita genera el enlace de su compositora');
await expectErr('Margarita no puede generar el enlace de Kevin', () => as(U.mar, `select issue_signature_link($1,$2)`, [pKev, h('x')]));
await expectErr('Un externo no genera enlaces', () => as(U.ext, `select issue_signature_link($1,$2)`, [pMar, h('y')]));
await expectErr('Sin sesión no se generan enlaces', () => as(null, `select issue_signature_link($1,$2)`, [pMar, h('z')]));

// firmante sin cuenta
const view = (await one(null, `select signing_view($1) v`, [h('tok-mariana')])).v;
view && view.work.title === 'Cielo Rojo' && view.participants.length === 2 && view.my_status === 'pending' ? ok('La firmante ve la carta con su enlace, sin cuenta') : bad('signing_view: ' + JSON.stringify(view));
!JSON.stringify(view).includes('@') ? ok('La vista de firma no expone correos') : bad('expone correos');
(await one(null, `select signing_view($1) v`, [h('inventado')])).v === null ? ok('Un enlace inventado no muestra nada') : bad('enlace inventado');
await expectErr('Sin sesión no se leen tablas de splits', () => as(null, `select * from split_participants`));
await expectErr('Firmar sin nombre se rechaza', () => as(null, `select sign_split($1,'','v1','1.2.3.4','test')`, [h('tok-mariana')]));
(await one(null, `select sign_split($1,'Mariana Soto Valdez','v1','1.2.3.4','test') r`, [h('tok-mariana')])).r === 'signed' ? ok('Mariana firma con su enlace') : bad('no firmó');
(await one(null, `select sign_split($1,'Mariana Soto Valdez','v1','1.2.3.4','test') r`, [h('tok-mariana')])).r === 'already' ? ok('Firmar dos veces no duplica') : bad('doble firma');
await expectErr('Ya firmó: no se renueva su enlace', () => as(U.mar, `select issue_signature_link($1,$2)`, [pMar, h('otro')]));

// renovar enlace invalida el anterior
await as(U.oli, `select issue_signature_link($1,$2)`, [pKev, h('tok-kevin-2')]);
(await one(null, `select signing_view($1) v`, [h('tok-kevin')])).v === null ? ok('Al renovar el enlace, el anterior deja de servir') : bad('enlace viejo sigue');
(await one(null, `select sign_split($1,'Kevin Cuadras','v1','','test') r`, [h('tok-kevin-2')])).r === 'completed' ? ok('Con la última firma el split queda firmado') : bad('no completó');
(await one(U.oli, `select status from split_agreements where id=$1`, [ag])).status === 'signed' ? ok('Estado: firmado') : bad('estado');
const sees = (await as(U.mar, `select count(*)::int n from audit_events where entity='split' and entity_id=$1`, [ag])).rows[0].n;
sees >= 4 ? ok('Margarita ve la bitácora del split') : bad('bitácora: ' + sees);

// versión nueva y cambio pedido
const w2 = (await one(U.oli, `insert into works (workspace_id, title) values ($1,'Otra') returning id`, [W.kevin])).id;
const ag2 = (await one(U.oli, `insert into split_agreements (work_id, version) values ($1,1) returning id`, [w2])).id;
await as(U.oli, `insert into split_participants (agreement_id, person_id, role, share_bp) values ($1,$2,'songwriter',10000)`, [ag2, kev]);
await as(U.oli, `update split_agreements set status='sent' where id=$1`, [ag2]);
const p2 = (await one(U.oli, `select id from split_participants where agreement_id=$1`, [ag2])).id;
await as(U.oli, `select issue_signature_link($1,$2)`, [p2, h('tok-otra')]);
await as(null, `select request_split_change($1,'Mi nombre va con acento')`, [h('tok-otra')]);
(await one(U.oli, `select count(*)::int n from change_requests where agreement_id=$1`, [ag2])).n === 1 ? ok('El firmante pide un cambio y Oliver lo ve') : bad('cambio');
await as(U.oli, `update split_agreements set status='void' where id=$1`, [ag2]);
(await one(null, `select signing_view($1) v`, [h('tok-otra')])).v.my_status === 'void' ? ok('Al anular la versión, su enlace ya no firma') : bad('enlace sigue vivo');
await expectErr('No se firma una versión anulada', () => as(null, `select sign_split($1,'Kevin Cuadras','v1','','t')`, [h('tok-otra')]));
await as(U.oli, `insert into split_agreements (work_id, version) values ($1,2)`, [w2]);
ok('Se crea la versión 2 después de anular');
await expectErr('Sin sesión no se leen huellas de participantes', () => as(null, `select participants_sig($1)`, [ag]));
