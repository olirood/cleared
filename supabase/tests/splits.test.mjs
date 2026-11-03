// Splits y firmas por enlace
import { createHash } from 'crypto';
import { setupDb } from './setup.mjs';
const { db, ws: W, as, ok, bad, expectErr } = await setupDb();
const h = (t) => createHash('sha256').update(t).digest('hex');
const KEY = () => db.query(`select value from cleared_private.settings where key='server_key'`).then((r) => r.rows[0].value);
// el servidor manda el código; en la prueba lo "recibimos" directo
const code = async (tok, c = '123456') => (await as(null, `select prepare_signing_code($1,$2,$3) r`, [h(tok), c, await KEY()])).rows[0].r;
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
await as(U.oli, `update split_participants set snapshot = jsonb_build_object('legal_name', p.legal_name, 'ipi', p.ipi, 'pro', p.pro, 'email', lower(replace(p.legal_name, ' ', '.')) || '@test.mx') from people p where p.id = person_id and agreement_id = $1`, [ag]);
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
!/kevin\.cuadras@|mariana\.soto\.valdez@/.test(JSON.stringify(view)) ? ok('La vista de firma no expone correos completos') : bad('expone correos');
(await one(null, `select signing_view($1) v`, [h('inventado')])).v === null ? ok('Un enlace inventado no muestra nada') : bad('enlace inventado');
await expectErr('Sin sesión no se leen tablas de splits', () => as(null, `select * from split_participants`));
view.email_hint === 'm••••••••••••••••@test.mx' || /^m•+@test\.mx$/.test(view.email_hint) ? ok('La firmante ve a qué correo llega su código (enmascarado)') : bad('hint: ' + view.email_hint);
const sig = (tok, c, n) => one(null, `select sign_split($1,$2,$3,'v1','1.2.3.4','test') r`, [h(tok), c, n]).then((x) => x.r);
(await sig('tok-mariana', '123456', 'Mariana Soto Valdez')) === 'no_code' ? ok('Sin pedir código no se puede firmar') : bad('firmó sin código');
await expectErr('Sin la llave del servidor no se crean códigos', () => as(null, `select prepare_signing_code($1,'111111','adivinada')`, [h('tok-mariana')]));
const sent = await code('tok-mariana', '482913');
sent.email === 'mariana.soto.valdez@test.mx' ? ok('El servidor obtiene el correo congelado para mandar el código') : bad('correo: ' + JSON.stringify(sent));
await expectErr('No se puede pedir otro código antes de 30 s', () => code('tok-mariana', '000000'));
(await sig('tok-mariana', '000000', 'Mariana Soto Valdez')) === 'bad_code' ? ok('Código equivocado: no firma') : bad('firmó con código malo');
await expectErr('Firmar sin nombre se rechaza', () => as(null, `select sign_split($1,'482913','','v1','1.2.3.4','test')`, [h('tok-mariana')]));
for (let i = 0; i < 4; i++) await sig('tok-mariana', '000001', 'Mariana Soto Valdez');
(await sig('tok-mariana', '482913', 'Mariana Soto Valdez')) === 'code_expired' ? ok('Después de 5 intentos el código deja de servir') : bad('sin límite de intentos');
await db.exec(`update cleared_private.signing_codes set last_sent_at = now() - interval '1 minute'`);
await code('tok-mariana', '777777');
(await sig('tok-mariana', '777777', 'Mariana Soto Valdez')) === 'signed' ? ok('Con el código correcto, Mariana firma') : bad('no firmó');
(await sig('tok-mariana', '777777', 'Mariana Soto Valdez')) === 'already' ? ok('Firmar dos veces no duplica') : bad('doble firma');
await expectErr('Nadie lee la tabla de códigos', () => as(U.oli, `select * from cleared_private.signing_codes`));
await expectErr('Nadie lee la llave del servidor', () => as(U.oli, `select * from cleared_private.settings`));
await expectErr('El documento final no sale antes de que firmen todos', () => as(null, `select completed_document($1,$2)`, [h('tok-mariana'), 'x']));
await expectErr('Ya firmó: no se renueva su enlace', () => as(U.mar, `select issue_signature_link($1,$2)`, [pMar, h('otro')]));

// renovar enlace invalida el anterior
await as(U.oli, `select issue_signature_link($1,$2)`, [pKev, h('tok-kevin-2')]);
(await one(null, `select signing_view($1) v`, [h('tok-kevin')])).v === null ? ok('Al renovar el enlace, el anterior deja de servir') : bad('enlace viejo sigue');
await code('tok-kevin-2', '246810');
(await sig('tok-kevin-2', '246810', 'Kevin Cuadras')) === 'completed' ? ok('Con la última firma el split queda firmado') : bad('no completó');
const fin = (await one(null, `select completed_document($1,$2) d`, [h('tok-kevin-2'), await KEY()])).d;
fin.participants.length === 2 && fin.participants.every((p) => p.snapshot.email && p.status === 'signed') ? ok('El servidor arma el documento final con los correos de todos') : bad('documento final');
await expectErr('El documento final pide la llave del servidor', () => as(null, `select completed_document($1,'otra')`, [h('tok-kevin-2')]));
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
await expectErr('No se firma una versión anulada', () => as(null, `select sign_split($1,'123456','Kevin Cuadras','v1','','t')`, [h('tok-otra')]));
await expectErr('Una versión anulada no recibe códigos', () => code('tok-otra'));
await as(U.oli, `insert into split_agreements (work_id, version) values ($1,2)`, [w2]);
ok('Se crea la versión 2 después de anular');
await expectErr('Sin sesión no se leen huellas de participantes', () => as(null, `select participants_sig($1)`, [ag]));


// representantes: misma gente en dos espacios no se aprueba a sí misma
const reps = (await as(U.oli, `select name, members, members_key from workspace_reps()`)).rows;
const kr = reps.find((r) => r.name === 'Kevin Cuadras'), or_ = reps.find((r) => r.name === 'Octavio Cuadras');
kr && or_ && kr.members_key === or_.members_key && kr.members_key !== '' ? ok('Kevin y Octavio los opera la misma persona (se muestran como "Oliver")') : bad('reps: ' + JSON.stringify(reps));
await expectErr('Sin sesión no se ven representantes', () => as(null, `select * from workspace_reps()`));
const kevRep = (await one(U.oli, `insert into people (owner_workspace_id, represented_by, legal_name, kinds, pro) values ($1,$1,'Compositor de Kevin','{songwriter}','SACM') returning id`, [W.kevin])).id;
const w4 = (await one(U.oli, `insert into works (workspace_id, title) values ($1,'Octavio con Kevin') returning id`, [W.octavio])).id;
const ag4 = (await one(U.oli, `insert into split_agreements (work_id, version) values ($1,1) returning id`, [w4])).id;
await as(U.oli, `insert into split_participants (agreement_id, person_id, role, share_bp) values ($1,$2,'songwriter',10000)`, [ag4, kevRep]);
await as(U.oli, `update split_agreements set status='sent' where id=$1`, [ag4]);
ok('Oliver manda en Octavio un split con alguien que él mismo representa en Kevin, sin aprobarse a sí mismo');

// copia para quien envió y respaldo
await as(U.oli, `insert into audit_events (workspace_id, entity, entity_id, action, actor) values ($1,'split',$2,'sent',auth.uid())`, [W.kevin, ag]);
const fin2 = (await one(null, `select completed_document_for($1,$2) d`, [ag, await KEY()])).d;
fin2.sender && fin2.sender.email === 'oli@test' ? ok('El documento final sabe quién envió el split (le llega copia)') : bad('sender: ' + JSON.stringify(fin2.sender));
const bk = (await one(null, `select export_backup($1) b`, [await KEY()])).b;
bk.people.length > 0 && bk.split_agreements.length > 0 && !JSON.stringify(bk.signatures).includes('token_hash') ? ok('El respaldo trae todo, sin las huellas de enlaces') : bad('respaldo');
await expectErr('Sin llave no hay respaldo', () => as(U.oli, `select export_backup('x')`));

// borrar un split en firma (cancela la firma); uno firmado no se borra
const w5 = (await one(U.oli, `insert into works (workspace_id, title) values ($1,'Para borrar') returning id`, [W.kevin])).id;
const ag5 = (await one(U.oli, `insert into split_agreements (work_id, version) values ($1,1) returning id`, [w5])).id;
await as(U.oli, `insert into split_participants (agreement_id, person_id, role, share_bp) values ($1,$2,'songwriter',10000)`, [ag5, kev]);
await as(U.oli, `update split_agreements set status='sent' where id=$1`, [ag5]);
const p5 = (await one(U.oli, `select id from split_participants where agreement_id=$1`, [ag5])).id;
await as(U.oli, `select issue_signature_link($1,$2)`, [p5, h('tok-borrar')]);
const delw = await as(U.oli, `delete from works where id=$1 returning id`, [w5]);
delw.rows.length === 1 ? ok('El dueño borra un split en firma') : bad('no se borró');
(await one(null, `select signing_view($1) v`, [h('tok-borrar')])).v === null ? ok('Al borrarlo, su enlace de firma ya no abre nada') : bad('enlace sigue vivo');

// copia final a quien aprobó por el espacio que representa
const fin3 = (await one(null, `select completed_document_for($1,$2) d`, [ag, await KEY()])).d;
fin3.approvers.some((a) => a.email === 'mar@test' && a.workspace === 'Apollo Music') ? ok('El documento final incluye a Margarita, que aprobó por Apollo (le llega copia)') : bad('approvers: ' + JSON.stringify(fin3.approvers));
