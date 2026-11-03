// Invitaciones y candado de acceso
import { setupDb } from './setup.mjs';
const { db, ws: W, as, ok, bad, expectErr } = await setupDb();

Object.keys(W).sort().join(',') === 'apollo,kevin,octavio' ? ok('existen Apollo, Kevin y Octavio') : bad('faltan espacios: ' + Object.keys(W));
const tpl = (await db.query(`select letter_template t from workspaces where slug='apollo'`)).rows[0].t;
tpl === 'apollo' ? ok('Apollo usa su carta de split') : bad('Apollo sin plantilla');

// Oliver se invita desde el editor SQL (como dueño) antes de tener cuenta
await db.exec(`insert into invitations (workspace_id, email, role, display_name) values
  ('${W.kevin}','Oliver@Test.mx','owner','Oliver'), ('${W.octavio}','oliver@test.mx','owner','Oliver'),
  ('${W.apollo}','margarita@test.mx','operator','Margarita')`);
const OLI = '00000000-0000-0000-0000-0000000000b1', MAR = '00000000-0000-0000-0000-0000000000a1', EXT = '00000000-0000-0000-0000-0000000000c1';
await db.exec(`insert into auth.users values ('${OLI}','oliver@test.mx'), ('${MAR}','margarita@test.mx')`);
await expectErr('No se puede crear una cuenta sin invitación', () => db.exec(`insert into auth.users values ('${EXT}','intruso@test.mx')`));
// si alguien se colara de todos modos (p. ej. una cuenta creada a mano), sigue sin ver nada
await db.exec(`set session_replication_role = replica; insert into auth.users values ('${EXT}','intruso@test.mx'); set session_replication_role = origin;`);

const mine = async (uid) => (await as(uid, `select w.slug, m.role from memberships m join workspaces w on w.id = m.workspace_id where m.user_id = auth.uid() order by 1`)).rows.map((r) => `${r.slug}:${r.role}`).join(',');
(await mine(OLI)) === 'kevin:owner,octavio:owner' ? ok('Oliver entra a Kevin y Octavio (correo sin importar mayúsculas)') : bad('Oliver: ' + await mine(OLI));
(await mine(MAR)) === 'apollo:operator' ? ok('Margarita entra solo a Apollo') : bad('Margarita: ' + await mine(MAR));
(await mine(EXT)) === '' ? ok('Una cuenta no invitada no entra a ningún espacio') : bad('Intruso: ' + await mine(EXT));

// una cuenta sin invitación no ve nada, ni siquiera el directorio compartido
await as(MAR, `insert into people (owner_workspace_id, represented_by, legal_name, kinds) values ($1,$1,'Compositora Apollo','{songwriter}')`, [W.apollo]);
const peek = async (uid, t) => (await as(uid, `select count(*)::int n from ${t}`)).rows[0].n;
(await peek(OLI, 'people')) === 1 ? ok('Oliver ve el directorio compartido') : bad('Oliver no ve el directorio');
(await peek(EXT, 'people')) === 0 ? ok('El intruso no ve el directorio') : bad('El intruso ve el directorio');
(await peek(EXT, 'workspaces')) === 0 ? ok('El intruso no ve ni los nombres de los espacios') : bad('El intruso ve espacios');
await expectErr('Sin sesión no se lee nada', () => as(null, `select * from people`));

// invitaciones: solo administradores del espacio
await expectErr('Margarita (operadora) no puede invitar', () => as(MAR, `insert into invitations (workspace_id, email, invited_by) values ($1,'x@test.mx',auth.uid())`, [W.apollo]));
await expectErr('El intruso no puede invitarse a sí mismo', () => as(EXT, `insert into invitations (workspace_id, email, invited_by) values ($1,'intruso@test.mx',auth.uid())`, [W.apollo]));
(await peek(MAR, 'invitations')) === 0 ? ok('Margarita no ve la lista de invitaciones') : bad('Margarita ve invitaciones');
const ins = await as(EXT, `insert into memberships (workspace_id, user_id) values ($1, auth.uid()) returning 1`, [W.apollo]).then(() => 'entró', (e) => 'bloqueado');
ins === 'bloqueado' ? ok('El intruso no puede darse de alta en un espacio') : bad('El intruso se dio de alta');

// Oliver (dueño de Kevin) invita a alguien que ya tiene cuenta: entra de inmediato
await as(OLI, `insert into invitations (workspace_id, email, role, invited_by) values ($1,'intruso@test.mx','viewer',auth.uid())`, [W.kevin]);
(await mine(EXT)) === 'kevin:viewer' ? ok('Invitar a una cuenta existente le da acceso al momento') : bad('Invitación a cuenta existente: ' + await mine(EXT));
const viewerWrite = await as(EXT, `insert into works (workspace_id, title) values ($1,'x')`, [W.kevin]).then(() => 'escribió', () => 'bloqueado');
viewerWrite === 'bloqueado' ? ok('Quien solo puede ver no escribe') : bad('Viewer escribió');

// tu cuenta: nombre visible y color, solo lo tuyo
{
  const { db: d2, ws: W2, as: as2, ok: ok2, bad: bad2, expectErr: ee2 } = await setupDb();
  const A = '00000000-0000-0000-0000-0000000000a1', B = '00000000-0000-0000-0000-0000000000b1';
  await d2.exec(`set session_replication_role = replica;
    insert into auth.users values ('${A}','a@test'),('${B}','b@test');
    set session_replication_role = origin;
    insert into memberships (workspace_id, user_id, role, display_name) values ('${W2.kevin}','${A}','owner','A'),('${W2.octavio}','${A}','owner','A'),('${W2.kevin}','${B}','operator','B');`);
  await as2(A, `select set_my_account('Oliver R.', '#30A46C')`);
  const mine = (await as2(A, `select distinct display_name, avatar_color from memberships where user_id=$1`, [A])).rows;
  mine.length === 1 && mine[0].display_name === 'Oliver R.' && mine[0].avatar_color === '#30A46C' ? ok2('Cambias tu nombre visible y color en todos tus espacios') : bad2('cuenta: ' + JSON.stringify(mine));
  (await as2(A, `select display_name from memberships where user_id=$1`, [B])).rows[0].display_name === 'B' ? ok2('No cambia el nombre de nadie más') : bad2('tocó a otro');
  await ee2('Nombre vacío no se guarda', () => as2(A, `select set_my_account('  ', null)`));
  await ee2('Color raro no se guarda', () => as2(A, `select set_my_account('Oliver', 'red; drop')`));
  await ee2('Sin sesión no se cambia nada', () => as2(null, `select set_my_account('X', null)`));
}

// mis pendientes: notas privadas de cada quien
{
  const { db: d3, ws: W3, as: as3, ok: ok3, bad: bad3, expectErr: ee3 } = await setupDb();
  const A = '00000000-0000-0000-0000-0000000000a2', B = '00000000-0000-0000-0000-0000000000b2';
  await d3.exec(`set session_replication_role = replica; insert into auth.users values ('${A}','a@test'),('${B}','b@test'); set session_replication_role = origin;
    insert into memberships (workspace_id, user_id, role) values ('${W3.apollo}','${A}','admin'),('${W3.apollo}','${B}','operator');`);
  await as3(A, `insert into notes (body, due_on) values ('Llamar a la editora', current_date + 2)`);
  (await as3(A, `select count(*)::int n from notes`)).rows[0].n === 1 ? ok3('Anotas un pendiente y lo ves') : bad3('nota propia');
  (await as3(B, `select count(*)::int n from notes`)).rows[0].n === 0 ? ok3('Nadie más ve tus pendientes, ni del mismo espacio') : bad3('se ven notas ajenas');
  await ee3('No se puede crear una nota a nombre de otro', () => as3(B, `insert into notes (user_id, body) values ($1, 'x')`, [A]));
  (await as3(B, `update notes set done_at = now() returning id`)).rows.length === 0 ? ok3('Nadie más puede marcar tus pendientes') : bad3('editó nota ajena');
  await ee3('Una nota vacía no se guarda', () => as3(A, `insert into notes (body) values ('   ')`));
  await ee3('Sin sesión no hay notas', () => as3(null, `select * from notes`));
}
