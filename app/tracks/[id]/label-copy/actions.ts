'use server';
import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/lib/supabase/server';
import { CODE_FORMATS, EXPLICIT, LANGS, PERF_TYPES, parseDuration } from '@/lib/labelcopy';
import { cleanIsrc } from '@/lib/tracks';

type Result = { error?: string };
const t = (s: unknown) => String(s ?? '').trim();
const orNull = (s: unknown) => t(s) || null;
const bad = (e: { code?: string; message?: string }) =>
  e.code === '23505' ? 'Ese código ya está en otro track.' : e.code === '23514' ? 'Algún código no tiene el formato correcto.' :
  e.code === '42501' || e.message?.includes('row-level') ? 'No tienes permiso para cambiar este track.' : 'No se pudo guardar.';
const refresh = (id: string) => { revalidatePath(`/tracks/${id}/label-copy`); revalidatePath(`/tracks/${id}`); revalidatePath('/tracks'); };

export type LCInput = {
  label_name: string; distributor: string; upc: string; genre: string; explicit: string; language: string; duration: string;
  p_year: string; p_owner: string; c_year: string; c_owner: string; delivery_contact: string; iswc: string;
};

export async function saveLabelCopy(id: string, f: LCInput): Promise<Result> {
  const year = (v: string) => { const n = Number(v); return v.trim() === '' ? null : Number.isInteger(n) && n >= 1900 && n <= 2100 ? n : NaN; };
  const dur = parseDuration(f.duration);
  if (dur === undefined) return { error: 'Escribe la duración como minutos:segundos, ej. 3:24' };
  const upc = f.upc.replace(/\D/g, '');
  if (upc && !/^\d{12,13}$/.test(upc)) return { error: 'El UPC lleva 12 o 13 dígitos.' };
  const py = year(f.p_year), cy = year(f.c_year);
  if (Number.isNaN(py) || Number.isNaN(cy)) return { error: 'El año va con 4 dígitos.' };
  if (!(f.explicit in EXPLICIT)) return { error: 'Elige el tipo de contenido.' };
  if (f.language && !LANGS.some(([k]) => k === f.language)) return { error: 'Elige un idioma de la lista.' };
  const iswc = f.iswc.replace(/[\s.-]/g, '').toUpperCase();
  if (iswc && !/^T\d{10}$/.test(iswc)) return { error: 'El ISWC va como T seguido de 10 dígitos, ej. T-123.456.789-0' };
  const sb = await supabaseServer();
  const { data, error } = await sb.from('recordings').update({
    label_name: orNull(f.label_name), distributor: orNull(f.distributor), upc: upc || null, genre: orNull(f.genre), explicit: f.explicit,
    language: orNull(f.language), duration_s: dur, p_year: py, p_owner: orNull(f.p_owner), c_year: cy, c_owner: orNull(f.c_owner), delivery_contact: orNull(f.delivery_contact),
  }).eq('id', id).select('work_id');
  if (error) return { error: bad(error) };
  if (!data?.length) return { error: 'No tienes permiso para cambiar este track.' };
  if (data[0].work_id) {
    const { error: e2 } = await sb.from('works').update({ iswc: iswc || null }).eq('id', data[0].work_id);
    if (e2) return { error: bad(e2) };
  }
  refresh(id);
  return {};
}

const DEFAULTS = { production: { role: 'Producer' }, performer: { role: 'Voz principal', performer_type: 'session' }, visual: { role: 'Cover Design' } } as const;

export async function addCredit(recordingId: string, category: 'production' | 'performer' | 'visual'): Promise<Result> {
  if (!(category in DEFAULTS)) return { error: 'Categoría inválida.' };
  const sb = await supabaseServer();
  const { data: cs } = await sb.from('credits').select('position').eq('recording_id', recordingId);
  const position = Math.max(-1, ...(cs ?? []).map((c) => c.position)) + 1;
  const { error } = await sb.from('credits').insert({ recording_id: recordingId, category, display_name: '', position, ...DEFAULTS[category] });
  if (error) return { error: bad(error) };
  refresh(recordingId);
  return {};
}

export async function updateCredit(id: string, recordingId: string, patch: { role?: string; person_id?: string | null; display_name?: string; detail?: string; performer_type?: string }): Promise<Result> {
  const row: Record<string, unknown> = {};
  if (patch.role !== undefined) { if (!t(patch.role)) return { error: 'Elige el rol.' }; row.role = t(patch.role).slice(0, 80); }
  if (patch.person_id !== undefined) { row.person_id = patch.person_id || null; if (patch.person_id) row.display_name = null; }
  if (patch.display_name !== undefined) { row.display_name = t(patch.display_name); row.person_id = null; }
  if (patch.detail !== undefined) row.detail = orNull(patch.detail);
  if (patch.performer_type !== undefined) { if (!(patch.performer_type in PERF_TYPES)) return { error: 'Tipo inválido.' }; row.performer_type = patch.performer_type; }
  const sb = await supabaseServer();
  const { data, error } = await sb.from('credits').update(row).eq('id', id).select('id');
  if (error) return { error: bad(error) };
  if (!data?.length) return { error: 'No tienes permiso.' };
  refresh(recordingId);
  return {};
}

export async function removeCredit(id: string, recordingId: string): Promise<Result> {
  const sb = await supabaseServer();
  const { error } = await sb.from('credits').delete().eq('id', id);
  if (error) return { error: bad(error) };
  refresh(recordingId);
  return {};
}

export async function saveCode(recordingId: string, format: string, isrc: string, upc: string): Promise<Result> {
  if (!(format in CODE_FORMATS)) return { error: 'Formato inválido.' };
  const i = cleanIsrc(isrc), u = upc.replace(/\D/g, '');
  if (i && !/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(i)) return { error: 'El ISRC lleva 12 caracteres, ej. MXA002600001.' };
  if (u && !/^\d{12,13}$/.test(u)) return { error: 'El UPC lleva 12 o 13 dígitos.' };
  const sb = await supabaseServer();
  const { error } = !i && !u
    ? await sb.from('recording_codes').delete().eq('recording_id', recordingId).eq('format', format)
    : await sb.from('recording_codes').upsert({ recording_id: recordingId, format, isrc: i || null, upc: u || null });
  if (error) return { error: bad(error) };
  refresh(recordingId);
  return {};
}
