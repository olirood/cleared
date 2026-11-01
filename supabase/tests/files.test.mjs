// Tracks y archivos: quién lleva lo legal, enlaces vs. archivos, almacén privado por espacio
import { setupDb } from './setup.mjs';
const { db, ws: W, as, ok, bad, expectErr } = await setupDb();
const U = { mar: '00000000-0000-0000-0000-00000000000a', oli: '00000000-0000-0000-0000-00000000000b' };
await db.exec(`
  set session_replication_role = replica;
  insert into auth.users values ('${U.mar}','mar@test'),('${U.oli}','oli@test');
  set session_replication_role = origin;
  insert into memberships (workspace_id, user_id, role) values ('${W.apollo}','${U.mar}','operator'),('${W.octavio}','${U.oli}','owner'),('${W.kevin}','${U.oli}','owner');
`);

const legal = (await db.query(`select slug, label_handles_legal l from workspaces order by slug`)).rows.map((r) => `${r.slug}:${r.l}`).join(',');
legal === 'apollo:false,kevin:false,octavio:true' ? ok('En Octavio la disquera lleva lo legal; en Kevin y Apollo no') : bad('legal: ' + legal);

const rec = (await as(U.oli, `insert into recordings (workspace_id, title, main_artist) values ($1,'Prueba','Kevin Cuadras') returning id`, [W.kevin])).rows[0].id;
await as(U.oli, `insert into assets (recording_id, kind, file_name, external_url) values ($1,'master','Master','https://drive.google.com/x')`, [rec]);
ok('El master se guarda como enlace');
await expectErr('Un enlace tiene que ser https', () => as(U.oli, `insert into assets (recording_id, kind, file_name, external_url) values ($1,'demo','Demo','http://x.com')`, [rec]));
await expectErr('El audio no se sube al almacén, solo enlace', () => as(U.oli, `insert into assets (recording_id, kind, file_name, storage_key) values ($1,'master','m.wav','${W.kevin}/${rec}/m.wav')`, [rec]));
await expectErr('Un WFH no puede ser solo un enlace', () => as(U.oli, `insert into assets (recording_id, kind, file_name, external_url) values ($1,'wfh','WFH','https://drive.google.com/x')`, [rec]));
await expectErr('Atmos ya no existe como tipo', () => as(U.oli, `insert into assets (recording_id, kind, file_name, external_url) values ($1,'atmos','A','https://x.com')`, [rec]));
await as(U.oli, `insert into assets (recording_id, kind, file_name, storage_key, thumb_key) values ($1,'cover','cover.jpg','${W.kevin}/${rec}/c.jpg','${W.kevin}/${rec}/c-thumb.webp')`, [rec]);
await expectErr('Una sola portada por track', () => as(U.oli, `insert into assets (recording_id, kind, file_name, storage_key) values ($1,'cover','otra.jpg','${W.kevin}/${rec}/d.jpg')`, [rec]));

// almacén
await as(U.oli, `insert into storage.objects (bucket_id, name) values ('cleared', $1)`, [`${W.kevin}/${rec}/c.jpg`]);
ok('Oliver sube la portada a la carpeta de Kevin');
await expectErr('Oliver no puede subir a la carpeta de Apollo', () => as(U.oli, `insert into storage.objects (bucket_id, name) values ('cleared', $1)`, [`${W.apollo}/x/c.jpg`]));
await expectErr('Una ruta sin espacio se rechaza', () => as(U.oli, `insert into storage.objects (bucket_id, name) values ('cleared', 'suelto.pdf')`));
const mSees = (await as(U.mar, `select count(*)::int n from storage.objects`)).rows[0].n;
mSees === 0 ? ok('Margarita no ve los archivos de Kevin') : bad('Margarita ve archivos de Kevin');
const mAssets = (await as(U.mar, `select count(*)::int n from assets`)).rows[0].n;
mAssets === 0 ? ok('Margarita no ve los enlaces de Kevin') : bad('Margarita ve enlaces de Kevin');
const del = await as(U.mar, `delete from storage.objects returning 1`);
del.rows.length === 0 ? ok('Margarita no puede borrar archivos de Kevin') : bad('Margarita borró archivos');
const oSees = (await as(U.oli, `select count(*)::int n from storage.objects`)).rows[0].n;
oSees === 1 ? ok('Oliver ve sus archivos') : bad('Oliver no ve sus archivos');
const anon = await as(null, `select count(*)::int n from storage.objects`).then((r) => r.rows[0].n, () => 0);
anon === 0 ? ok('Sin sesión no se ve ningún archivo') : bad('Anónimo ve archivos');

// solo lectura de verdad
const VIEW = '00000000-0000-0000-0000-0000000000d1';
await db.exec(`set session_replication_role = replica; insert into auth.users values ('${VIEW}','v@test'); set session_replication_role = origin;
  insert into memberships (workspace_id, user_id, role) values ('${W.kevin}','${VIEW}','viewer');`);
const vSees = (await as(VIEW, `select count(*)::int n from recordings`)).rows[0].n;
vSees === 1 ? ok('Quien solo ve, ve el track') : bad('viewer no ve');
const vDelRec = await as(VIEW, `delete from recordings returning 1`);
const vDelAs = await as(VIEW, `delete from assets returning 1`);
const vUpd = await as(VIEW, `update recordings set title='x' returning 1`);
vDelRec.rows.length + vDelAs.rows.length + vUpd.rows.length === 0 ? ok('Quien solo ve no borra ni edita tracks ni archivos') : bad('viewer modificó');
const vObj = await as(VIEW, `delete from storage.objects returning 1`);
vObj.rows.length === 0 ? ok('Quien solo ve no borra archivos del almacén') : bad('viewer borró del almacén');
