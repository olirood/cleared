'use server';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { supabaseServer } from '@/lib/supabase/server';
import { ROLES, canonical, equalShares, type Snapshot } from '@/lib/splits';
import { mailConfigured } from '@/lib/mail';
import { sendFinalDocument } from '@/lib/finalMail';

export type Result = { error?: string; id?: string; links?: Record<string, string>; link?: string };
type PgErr = { code?: string; message?: string };
type SB = Awaited<ReturnType<typeof supabaseServer>>;

const t = (s: unknown) => String(s ?? '').trim();
const orNull = (s: unknown) => t(s) || null;

function explain(e: PgErr): string {
  const m = e.message || '';
  if (m.includes('debe sumar 10000')) return 'El split tiene que sumar 100 % para enviarlo.';
  if (m.includes('aprobaciones')) return 'Falta que apruebe el espacio que representa a alguien del split.';
  if (m.includes('ya se envió') || m.includes('no vuelve a borrador')) return 'El split ya se envió. Para cambiarlo, crea una versión nueva.';
  if (m.includes('split_one_current')) return 'Ya hay una versión vigente de este split.';
  if (e.code === '23505' && m.includes('agreement_id')) return 'Esa persona ya está en el split.';
  if (m.includes('ya firmó')) return 'Esa persona ya firmó.';
  if (e.code === '42501' || m.includes('row-level security') || m.includes('Sin permiso')) return 'No tienes permiso para hacer esto.';
  return 'No se pudo guardar. Intenta de nuevo.';
}

async function ctx() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  return { sb, user };
}
const refresh = (workId?: string) => { revalidatePath('/splits'); if (workId) revalidatePath(`/splits/${workId}`); revalidatePath('/tracks', 'layout'); };

async function log(sb: SB, workspace_id: string, agreement: string, action: string, detail?: Record<string, unknown>) {
  const { data: { user } } = await sb.auth.getUser();
  await sb.from('audit_events').insert({ workspace_id, entity: 'split', entity_id: agreement, action, detail: detail ?? null, actor: user?.id });
}

async function agreementCtx(sb: SB, agreementId: string) {
  const { data } = await sb.from('split_agreements').select('id, work_id, version, status, works(workspace_id, title, artist)').eq('id', agreementId).maybeSingle();
  if (!data) return null;
  const w = data.works as unknown as { workspace_id: string; title: string; artist: string | null };
  return { ...data, workspace_id: w.workspace_id, title: w.title, artist: w.artist };
}

// ---------- obras ----------

export type WorkInput = { id?: string; workspace_id: string; title: string; artist: string; session_with: string; session_date: string; studio: string; notes: string };

export async function saveWork(input: WorkInput): Promise<Result> {
  if (!t(input.title)) return { error: 'Escribe el título de la canción.' };
  if (input.session_date && !/^\d{4}-\d{2}-\d{2}$/.test(input.session_date)) return { error: 'Fecha inválida.' };
  const { sb, user } = await ctx();
  if (!user) return { error: 'Tu sesión terminó. Vuelve a entrar.' };
  const row = { title: t(input.title), artist: orNull(input.artist), session_with: orNull(input.session_with), session_date: orNull(input.session_date), studio: orNull(input.studio), notes: orNull(input.notes) };
  if (input.id) {
    const { data, error } = await sb.from('works').update(row).eq('id', input.id).select('id');
    if (error) return { error: explain(error) };
    if (!data?.length) return { error: 'No tienes permiso para cambiar este split.' };
    refresh(input.id);
    return { id: input.id };
  }
  const { data: w, error } = await sb.from('works').insert({ ...row, workspace_id: input.workspace_id }).select('id').single();
  if (error) return { error: explain(error) };
  const { data: ag, error: e2 } = await sb.from('split_agreements').insert({ work_id: w.id, version: 1 }).select('id').single();
  if (e2) return { error: explain(e2) };
  await log(sb, input.workspace_id, ag.id, 'created');
  refresh();
  return { id: w.id };
}

// Split para un track: crea la obra con los datos del track y la liga
export async function createTrackSplit(recordingId: string): Promise<Result> {
  const { sb } = await ctx();
  const { data: r } = await sb.from('recordings').select('id, workspace_id, title, main_artist, featured_artists, work_id').eq('id', recordingId).maybeSingle();
  if (!r) return { error: 'No se encontró el track.' };
  if (r.work_id) return { id: r.work_id };
  const artist = [r.main_artist, r.featured_artists && `feat. ${r.featured_artists.split(';').map((s: string) => s.trim()).join(', ')}`].filter(Boolean).join(' ');
  const res = await saveWork({ workspace_id: r.workspace_id, title: r.title, artist, session_with: '', session_date: '', studio: '', notes: '' });
  if (res.error || !res.id) return res;
  const { error } = await sb.from('recordings').update({ work_id: res.id }).eq('id', r.id);
  if (error) return { error: explain(error) };
  refresh(res.id);
  return res;
}

// Liga un track a un split de sesión que ya existe (mismo espacio)
export async function linkTrack(recordingId: string, workId: string | null): Promise<Result> {
  const { sb } = await ctx();
  const { data: r } = await sb.from('recordings').select('workspace_id').eq('id', recordingId).maybeSingle();
  if (!r) return { error: 'No se encontró el track.' };
  if (workId) {
    const { data: w } = await sb.from('works').select('workspace_id').eq('id', workId).maybeSingle();
    if (!w || w.workspace_id !== r.workspace_id) return { error: 'Ese split es de otro espacio.' };
  }
  const { data, error } = await sb.from('recordings').update({ work_id: workId }).eq('id', recordingId).select('id');
  if (error) return { error: explain(error) };
  if (!data?.length) return { error: 'No tienes permiso para cambiar este track.' };
  refresh(workId ?? undefined);
  revalidatePath(`/tracks/${recordingId}`);
  return {};
}

export async function deleteWork(workId: string): Promise<Result> {
  const { sb } = await ctx();
  const { data: ags } = await sb.from('split_agreements').select('status').eq('work_id', workId);
  if (ags?.some((a) => a.status !== 'draft')) return { error: 'Este split ya se envió a firma y no se puede borrar.' };
  const { data, error } = await sb.from('works').delete().eq('id', workId).select('id');
  if (error) return { error: explain(error) };
  if (!data?.length) return { error: 'Solo la administración del espacio puede borrar splits.' };
  refresh();
  return {};
}

// ---------- participantes (solo en borrador) ----------

export async function addParticipant(agreementId: string, personId: string): Promise<Result> {
  const { sb } = await ctx();
  const { data: ps } = await sb.from('split_participants').select('share_bp, position').eq('agreement_id', agreementId);
  const used = (ps ?? []).reduce((a, p) => a + p.share_bp, 0);
  const pos = Math.max(-1, ...(ps ?? []).map((p) => p.position)) + 1;
  const { error } = await sb.from('split_participants').insert({ agreement_id: agreementId, person_id: personId, role: 'songwriter', share_bp: Math.max(1, 10000 - used), position: pos });
  if (error) return { error: explain(error) };
  const a = await agreementCtx(sb, agreementId);
  refresh(a?.work_id);
  return {};
}

export async function updateParticipant(id: string, patch: { role?: string; share_bp?: number; credits?: string }): Promise<Result> {
  const row: Record<string, unknown> = {};
  if (patch.role !== undefined) { if (!(patch.role in ROLES)) return { error: 'Rol inválido.' }; row.role = patch.role; }
  if (patch.share_bp !== undefined) { if (!Number.isInteger(patch.share_bp) || patch.share_bp < 1 || patch.share_bp > 10000) return { error: 'El porcentaje va de 0.01 a 100.' }; row.share_bp = patch.share_bp; }
  if (patch.credits !== undefined) row.credits = orNull(patch.credits);
  const { sb } = await ctx();
  const { data, error } = await sb.from('split_participants').update(row).eq('id', id).select('agreement_id');
  if (error) return { error: explain(error) };
  if (!data?.length) return { error: 'No tienes permiso para cambiar este split.' };
  const a = await agreementCtx(sb, data[0].agreement_id);
  refresh(a?.work_id);
  return {};
}

export async function removeParticipant(id: string): Promise<Result> {
  const { sb } = await ctx();
  const { data, error } = await sb.from('split_participants').delete().eq('id', id).select('agreement_id');
  if (error) return { error: explain(error) };
  if (!data?.length) return { error: 'No tienes permiso para cambiar este split.' };
  const a = await agreementCtx(sb, data[0].agreement_id);
  refresh(a?.work_id);
  return {};
}

export async function equalize(agreementId: string): Promise<Result> {
  const { sb } = await ctx();
  const { data: ps } = await sb.from('split_participants').select('id').eq('agreement_id', agreementId).order('position');
  if (!ps?.length) return {};
  const shares = equalShares(ps.length);
  for (let i = 0; i < ps.length; i++) {
    const { error } = await sb.from('split_participants').update({ share_bp: shares[i] }).eq('id', ps[i].id);
    if (error) return { error: explain(error) };
  }
  const a = await agreementCtx(sb, agreementId);
  refresh(a?.work_id);
  return {};
}

// ---------- aprobación del espacio que representa ----------

export async function decide(agreementId: string, workspaceId: string, status: 'approved' | 'changes_requested', note: string): Promise<Result> {
  if (status === 'changes_requested' && !t(note)) return { error: 'Escribe qué hay que cambiar.' };
  const { sb, user } = await ctx();
  if (!user) return { error: 'Tu sesión terminó.' };
  const { data: sig } = await sb.rpc('participants_sig', { agreement: agreementId });
  const row = { status, note: orNull(note), participants_sig: sig as string, decided_by: user.id, decided_at: new Date().toISOString() };
  const { data: existing } = await sb.from('split_approvals').select('agreement_id').eq('agreement_id', agreementId).eq('workspace_id', workspaceId);
  const { error } = existing?.length
    ? await sb.from('split_approvals').update(row).eq('agreement_id', agreementId).eq('workspace_id', workspaceId)
    : await sb.from('split_approvals').insert({ ...row, agreement_id: agreementId, workspace_id: workspaceId });
  if (error) return { error: explain(error) };
  await log(sb, workspaceId, agreementId, status === 'approved' ? 'approved' : 'changes_requested', status === 'approved' ? undefined : { note: t(note) });
  const a = await agreementCtx(sb, agreementId);
  refresh(a?.work_id);
  return {};
}

// ---------- enviar a firma y enlaces ----------

async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function newToken() {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function origin() {
  const h = await headers();
  const host = h.get('x-forwarded-host') || h.get('host') || '';
  const proto = h.get('x-forwarded-proto') || (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}
async function issue(sb: SB, participantId: string, base: string) {
  const token = newToken();
  const { error } = await sb.rpc('issue_signature_link', { participant: participantId, token_hash: await sha256Hex(token) });
  if (error) throw error;
  return `${base}/firmar/${token}`;
}

export async function sendSplit(agreementId: string): Promise<Result> {
  const { sb } = await ctx();
  const a = await agreementCtx(sb, agreementId);
  if (!a) return { error: 'No se encontró el split.' };
  if (a.status !== 'draft') return { error: 'Este split ya se envió.' };
  const { data: ps } = await sb.from('split_participants')
    .select('id, role, share_bp, credits, position, people(legal_name, credit_name, pro, pro_member_no, ipi, email, phone, nationality, publishers(name, ipi))')
    .eq('agreement_id', agreementId).order('position');
  if (!ps?.length) return { error: 'Agrega a los participantes.' };
  if (!mailConfigured()) return { error: 'Falta configurar el correo de Cleared: sin él nadie podría recibir su código para firmar.' };
  const noMail = ps.filter((p) => !(p.people as unknown as { email: string | null } | null)?.email).map((p) => (p.people as unknown as { legal_name: string } | null)?.legal_name ?? 'alguien');
  if (noMail.length) return { error: `Falta el correo de ${noMail.join(', ')}. Ahí le llega su código para firmar y la copia final.` };
  const { data: ws } = await sb.from('workspaces').select('letter_template').eq('id', a.workspace_id).single();
  const template = ws?.letter_template || 'generic';

  // congela los datos de cada persona tal como están hoy
  const frozen = ps.map((p) => {
    const pe = p.people as unknown as { legal_name: string; credit_name: string | null; pro: string | null; pro_member_no: string | null; ipi: string | null; email: string | null; phone: string | null; nationality: string | null; publishers: { name: string; ipi: string | null } | null };
    const snapshot: Snapshot = {
      legal_name: pe.legal_name, credit_name: pe.credit_name, pro: pe.pro, pro_member_no: pe.pro_member_no, ipi: pe.ipi,
      publisher: pe.publishers?.name ?? null, publisher_ipi: pe.publishers?.ipi ?? null, email: pe.email, phone: pe.phone, nationality: pe.nationality,
    };
    return { id: p.id, role: p.role, share_bp: p.share_bp, credits: p.credits, snapshot };
  });
  for (const f of frozen) {
    const { error } = await sb.from('split_participants').update({ snapshot: f.snapshot }).eq('id', f.id);
    if (error) return { error: explain(error) };
  }
  const hash = await sha256Hex(canonical({ title: a.title, artist: a.artist }, a.version, template, frozen));
  const { error } = await sb.from('split_agreements').update({ status: 'sent', content_sha256: hash, template }).eq('id', agreementId);
  if (error) return { error: explain(error) };
  await log(sb, a.workspace_id, agreementId, 'sent', { sha256: hash });

  const base = await origin();
  const links: Record<string, string> = {};
  try { for (const f of frozen) links[f.id] = await issue(sb, f.id, base); }
  catch (e) { refresh(a.work_id); return { error: 'Se envió, pero no se pudieron crear todos los enlaces. Genera los que falten. ' + explain(e as PgErr) }; }
  refresh(a.work_id);
  return { links };
}

export async function issueLink(participantId: string): Promise<Result> {
  const { sb } = await ctx();
  try {
    const link = await issue(sb, participantId, await origin());
    const { data } = await sb.from('split_participants').select('agreement_id').eq('id', participantId).single();
    const a = data && await agreementCtx(sb, data.agreement_id);
    refresh(a?.work_id);
    return { link };
  } catch (e) { return { error: explain(e as PgErr) }; }
}

// ---------- versión nueva ----------

export async function newVersion(agreementId: string): Promise<Result> {
  const { sb } = await ctx();
  const a = await agreementCtx(sb, agreementId);
  if (!a) return { error: 'No se encontró el split.' };
  if (a.status === 'draft') return { error: 'Este split sigue en borrador; edítalo directamente.' };
  const { data: ps } = await sb.from('split_participants').select('person_id, role, share_bp, credits, position').eq('agreement_id', agreementId);
  const { error } = await sb.from('split_agreements').update({ status: 'void' }).eq('id', agreementId);
  if (error) return { error: explain(error) };
  const { data: next, error: e2 } = await sb.from('split_agreements').insert({ work_id: a.work_id, version: a.version + 1 }).select('id').single();
  if (e2) return { error: explain(e2) };
  if (ps?.length) {
    const { error: e3 } = await sb.from('split_participants').insert(ps.map((p) => ({ ...p, agreement_id: next.id })));
    if (e3) return { error: explain(e3) };
  }
  await log(sb, a.workspace_id, next.id, 'new_version', { from: a.version });
  refresh(a.work_id);
  return { id: next.id };
}

// Reenvía a todos los firmantes el PDF final (si el correo falló al completarse)
export async function resendFinal(agreementId: string): Promise<Result> {
  const { sb } = await ctx();
  const a = await agreementCtx(sb, agreementId);   // la regla de la base confirma que puedes ver este split
  if (!a) return { error: 'No se encontró el split.' };
  if (a.status !== 'signed') return { error: 'El split aún no está firmado por todos.' };
  if (!mailConfigured()) return { error: 'El correo de Cleared no está configurado.' };
  const { data, error } = await sb.rpc('completed_document_for', { agreement: agreementId, server_key: process.env.CLEARED_SERVER_KEY });
  if (error || !data) return { error: 'No se pudo armar el documento.' };
  try { await sendFinalDocument(data); } catch (e) { const d = String((e as Error)?.message || e).slice(0, 160); console.error('[cleared] reenvío falló:', d); return { error: `No se pudo mandar el correo${d.match(/smtp (\d{3})/) ? ` (servidor de correo: ${d.match(/smtp (\d{3})/)![1]})` : ''}.` }; }
  await log(sb, a.workspace_id, agreementId, 'final_sent');
  return {};
}
