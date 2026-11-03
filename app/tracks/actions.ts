'use server';
import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/lib/supabase/server';
import { LINK_KINDS, RELEASE_TYPES, TRACK_TYPES, cleanIsrc } from '@/lib/tracks';

export type Result = { error?: string; id?: string };
type PgErr = { code?: string; message?: string };

const t = (s: unknown) => String(s ?? '').trim();
const orNull = (s: unknown) => t(s) || null;

function explain(e: PgErr): string {
  const m = e.message || '';
  if (e.code === '23505' && m.includes('isrc')) return 'Ese ISRC ya está en otro track.';
  if (e.code === '23505' && m.includes('one_cover')) return 'Este track ya tiene portada. Reemplázala.';
  if (e.code === '23514' && m.includes('isrc')) return 'El ISRC lleva 12 caracteres: país, registrante, año y número (ej. MXA002600001).';
  if (e.code === '23514') return 'Algún dato no tiene el formato correcto.';
  if (e.code === '42501' || m.includes('row-level security')) return 'No tienes permiso para hacer esto en este espacio.';
  return 'No se pudo guardar. Intenta de nuevo.';
}

async function client() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  return { sb, user };
}
const refresh = (id?: string) => { revalidatePath('/tracks'); if (id) revalidatePath(`/tracks/${id}`); };

// ---------- ficha ----------

export type TrackInput = {
  id?: string;
  workspace_id: string;
  title: string;
  version_title: string;
  main_artist: string;
  featured_artists: string;
  track_type: string;
  release_title: string;
  release_type: string;
  release_date: string;
  isrc: string;
};

export async function saveTrack(input: TrackInput): Promise<Result> {
  if (!t(input.title)) return { error: 'Escribe el título.' };
  if (!(input.track_type in TRACK_TYPES)) return { error: 'Elige el tipo de track.' };
  if (input.release_type && !RELEASE_TYPES.includes(input.release_type as never)) return { error: 'Elige sencillo, EP o álbum.' };
  const isrc = cleanIsrc(t(input.isrc));
  if (isrc && !/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(isrc)) return { error: 'El ISRC lleva 12 caracteres: país, registrante, año y número (ej. MXA002600001).' };
  if (input.release_date && !/^\d{4}-\d{2}-\d{2}$/.test(input.release_date)) return { error: 'Fecha inválida.' };

  const { sb, user } = await client();
  if (!user) return { error: 'Tu sesión terminó. Vuelve a entrar.' };
  const row = {
    title: t(input.title),
    version_title: orNull(input.version_title),
    main_artist: orNull(input.main_artist),
    featured_artists: orNull(input.featured_artists),
    track_type: input.track_type,
    release_title: orNull(input.release_title),
    release_type: orNull(input.release_type),
    release_date: orNull(input.release_date),
    isrc: isrc || null,
  };
  if (input.id) {
    const { data, error } = await sb.from('recordings').update(row).eq('id', input.id).select('id');
    if (error) return { error: explain(error) };
    if (!data?.length) return { error: 'No tienes permiso para cambiar este track.' };
    refresh(input.id);
    return { id: input.id };
  }
  const { data, error } = await sb.from('recordings')
    .insert({ ...row, workspace_id: input.workspace_id, wfh_status: 'pending', waiver_status: 'pending', license_status: 'pending' })
    .select('id').single();
  if (error) return { error: explain(error) };
  refresh();
  return { id: data.id };
}

export async function deleteTrack(id: string): Promise<Result> {
  const { sb } = await client();
  const { data: files } = await sb.from('assets').select('storage_key, thumb_key').eq('recording_id', id);
  const { data, error } = await sb.from('recordings').delete().eq('id', id).select('id');
  if (error) return { error: explain(error) };
  if (!data?.length) return { error: 'Solo la administración del espacio puede borrar tracks.' };
  const keys = (files ?? []).flatMap((f) => [f.storage_key, f.thumb_key]).filter((k): k is string => !!k && !k.includes('/splits/'));
  if (keys.length) await sb.storage.from('cleared').remove(keys);
  refresh();
  return {};
}

// ---------- lo legal ----------

export async function setLegal(id: string, value: 'inherit' | 'label' | 'us'): Promise<Result> {
  const { sb } = await client();
  const v = value === 'inherit' ? null : value === 'label';
  const { data, error } = await sb.from('recordings').update({ label_handles_legal: v }).eq('id', id).select('id');
  if (error) return { error: explain(error) };
  if (!data?.length) return { error: 'No tienes permiso para cambiar este track.' };
  refresh(id);
  return {};
}

export async function setDocStatus(id: string, kind: 'wfh' | 'waiver' | 'license', status: 'na' | 'pending' | 'signed'): Promise<Result> {
  if (!['wfh', 'waiver', 'license'].includes(kind) || !['na', 'pending', 'signed'].includes(status)) return { error: 'Dato inválido.' };
  const { sb } = await client();
  const { data, error } = await sb.from('recordings').update({ [`${kind}_status`]: status }).eq('id', id).select('id');
  if (error) return { error: explain(error) };
  if (!data?.length) return { error: 'No tienes permiso para cambiar este track.' };
  refresh(id);
  return {};
}

// ---------- enlaces ----------

export async function addLink(recording_id: string, kind: string, url: string, label: string): Promise<Result> {
  if (!(kind in LINK_KINDS)) return { error: 'Elige qué es el enlace.' };
  let u: URL;
  try { u = new URL(t(url)); } catch { return { error: 'Pega un enlace completo, empezando con https://' }; }
  if (u.protocol !== 'https:') return { error: 'El enlace tiene que empezar con https://' };
  const { sb } = await client();
  const name = t(label) || LINK_KINDS[kind as keyof typeof LINK_KINDS];
  const { error } = await sb.from('assets').insert({ recording_id, kind, file_name: name, label: orNull(label), external_url: u.toString() });
  if (error) return { error: explain(error) };
  refresh(recording_id);
  return {};
}

// ---------- archivos guardados ----------

export type FileRecord = {
  recording_id: string;
  kind: 'cover' | 'wfh' | 'waiver' | 'license' | 'other_doc';
  storage_key: string;
  thumb_key?: string | null;
  file_name: string;
  size_bytes: number;
  mime: string;
  sha256: string;
  label?: string;
};

// El navegador ya subió el archivo al almacén; aquí se registra
export async function recordFile(f: FileRecord): Promise<Result> {
  const { sb } = await client();
  const keys = [f.storage_key, f.thumb_key].filter(Boolean) as string[];
  // el archivo tiene que estar en la carpeta de este track
  const { data: rec } = await sb.from('recordings').select('workspace_id').eq('id', f.recording_id).maybeSingle();
  if (!rec || !keys.every((k) => k.startsWith(`${rec.workspace_id}/${f.recording_id}/`))) return { error: 'No tienes permiso para guardar archivos en este track.' };
  const fail = async (e: PgErr) => { await sb.storage.from('cleared').remove(keys); return { error: explain(e) }; };
  if (!['cover', 'wfh', 'waiver', 'license', 'other_doc'].includes(f.kind)) return fail({ message: 'tipo' });
  if (f.kind === 'cover' ? !/^image\/(jpeg|png|webp)$/.test(f.mime) : f.mime !== 'application/pdf') return fail({ message: 'mime' });

  if (f.kind === 'cover') {
    const { data: old } = await sb.from('assets').select('id, storage_key, thumb_key').eq('recording_id', f.recording_id).eq('kind', 'cover');
    if (old?.length) {
      const { error } = await sb.from('assets').delete().in('id', old.map((o) => o.id));
      if (error) return fail(error);
      await sb.storage.from('cleared').remove(old.flatMap((o) => [o.storage_key, o.thumb_key]).filter(Boolean) as string[]);
    }
  }
  const { error } = await sb.from('assets').insert({
    recording_id: f.recording_id, kind: f.kind, storage_key: f.storage_key, thumb_key: f.thumb_key ?? null,
    file_name: t(f.file_name).slice(0, 200) || 'archivo', label: orNull(f.label), size_bytes: f.size_bytes, mime: f.mime, sha256: f.sha256,
  });
  if (error) return fail(error);
  if (f.kind === 'wfh' || f.kind === 'waiver' || f.kind === 'license') {
    await sb.from('recordings').update({ [`${f.kind}_status`]: 'signed' }).eq('id', f.recording_id);
  }
  refresh(f.recording_id);
  return {};
}

export async function removeAsset(id: string): Promise<Result> {
  const { sb } = await client();
  const { data, error } = await sb.from('assets').delete().eq('id', id).select('recording_id, kind, storage_key, thumb_key');
  if (error) return { error: explain(error) };
  const a = data?.[0];
  if (!a) return { error: 'No tienes permiso para quitar este archivo.' };
  // el PDF de un split firmado vive en /splits/ y no se borra al quitarlo de un track
  const keys = [a.storage_key, a.thumb_key].filter((k): k is string => !!k && !k.includes('/splits/'));
  if (keys.length) await sb.storage.from('cleared').remove(keys);
  if (a.kind === 'wfh' || a.kind === 'waiver' || a.kind === 'license') {
    const { count } = await sb.from('assets').select('id', { count: 'exact', head: true }).eq('recording_id', a.recording_id).eq('kind', a.kind);
    if (!count) await sb.from('recordings').update({ [`${a.kind}_status`]: 'pending' }).eq('id', a.recording_id);
  }
  refresh(a.recording_id);
  return {};
}
