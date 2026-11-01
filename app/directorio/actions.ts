'use server';
import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/lib/supabase/server';
import { KINDS, PROS, cleanIpi } from '@/lib/people';

export type PersonInput = {
  id?: string;
  owner_workspace_id: string;
  represented_by: string;
  shared: boolean;
  legal_name: string;
  credit_name: string;
  nationality: string;
  email: string;
  phone: string;
  kinds: string[];
  instruments: string;
  isni: string;
  pro: string;
  pro_member_no: string;
  ipi: string;
  publisher_name: string;
  publisher_ipi: string;
  publisher_email: string;
};
export type SaveResult = { error?: string; id?: string };

const t = (s: string) => (s ?? '').trim();
const orNull = (s: string) => t(s) || null;

function explain(e: { code?: string; message?: string }): string {
  const m = e.message || '';
  if (e.code === '23505' && m.includes('people_ipi')) return 'Ese IPI ya está en otro perfil, tal vez uno privado de otro espacio. Pide que lo compartan en vez de duplicarlo.';
  if (e.code === '23505' && m.includes('publishers_ipi')) return 'Ese IPI de editora ya existe con otro nombre. Revisa el nombre de la editora.';
  if (e.code === '23514') return 'Algún dato no tiene el formato correcto. El IPI lleva de 9 a 11 dígitos.';
  if (e.code === '23503') return 'No se puede borrar: el perfil ya está en un split o en un label copy.';
  if (e.code === '42501' || m.includes('row-level security')) return 'No tienes permiso para cambiar este perfil.';
  return 'No se pudo guardar. Intenta de nuevo.';
}

export async function savePerson(input: PersonInput): Promise<SaveResult> {
  const kinds = (input.kinds || []).filter((k) => KINDS.some(([v]) => v === k));
  const ipi = cleanIpi(t(input.ipi));
  const pubIpi = cleanIpi(t(input.publisher_ipi));
  if (!t(input.legal_name)) return { error: 'Escribe el nombre legal: es el que va en el contrato.' };
  if (!kinds.length) return { error: 'Marca al menos una cosa que hace esta persona.' };
  if (ipi && !/^\d{9,11}$/.test(ipi)) return { error: 'El IPI lleva de 9 a 11 dígitos, sin letras.' };
  if (pubIpi && !/^\d{9,11}$/.test(pubIpi)) return { error: 'El IPI de la editora lleva de 9 a 11 dígitos.' };
  if (input.pro && !PROS.includes(input.pro)) return { error: 'Elige una sociedad de la lista.' };

  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { error: 'Tu sesión terminó. Vuelve a entrar.' };

  // editora: se reutiliza si ya existe (por IPI o nombre), si no se crea en el espacio del perfil
  let publisher_id: string | null = null;
  const pubName = t(input.publisher_name);
  if (pubName || pubIpi) {
    let found: { id: string } | null = null;
    if (pubIpi) found = (await sb.from('publishers').select('id').eq('ipi', pubIpi).maybeSingle()).data;
    if (!found && pubName) {
      const safe = pubName.replace(/[\\%_]/g, (c) => '\\' + c);
      found = (await sb.from('publishers').select('id').ilike('name', safe).limit(1)).data?.[0] ?? null;
    }
    if (found) {
      publisher_id = found.id;
      // completa lo que le falte; si la editora es de otro espacio, la regla de la base no deja y se ignora
      const patch: Record<string, string> = {};
      if (pubIpi) patch.ipi = pubIpi;
      if (t(input.publisher_email)) patch.email = t(input.publisher_email);
      if (Object.keys(patch).length) await sb.from('publishers').update(patch).eq('id', found.id);
    } else {
      const { data, error } = await sb.from('publishers')
        .insert({ owner_workspace_id: input.owner_workspace_id, name: pubName || pubIpi, ipi: pubIpi || null, email: orNull(input.publisher_email) })
        .select('id').single();
      if (error) return { error: explain(error) };
      publisher_id = data.id;
    }
  }

  const row = {
    represented_by: orNull(input.represented_by),
    shared: !!input.shared,
    legal_name: t(input.legal_name),
    credit_name: orNull(input.credit_name),
    nationality: orNull(input.nationality),
    email: orNull(input.email),
    phone: orNull(input.phone),
    kinds,
    instruments: orNull(input.instruments),
    isni: orNull(input.isni.replace(/\s/g, '')),
    pro: orNull(input.pro),
    pro_member_no: orNull(input.pro_member_no),
    ipi: ipi || null,
    publisher_id,
  };

  if (input.id) {
    const { data, error } = await sb.from('people').update(row).eq('id', input.id).select('id');
    if (error) return { error: explain(error) };
    if (!data?.length) return { error: 'No tienes permiso para cambiar este perfil.' };
    revalidatePath('/directorio');
    return { id: input.id };
  }
  const { data, error } = await sb.from('people')
    .insert({ ...row, owner_workspace_id: input.owner_workspace_id })
    .select('id').single();
  if (error) return { error: explain(error) };
  revalidatePath('/directorio');
  return { id: data.id };
}

export async function deletePerson(id: string): Promise<SaveResult> {
  const sb = await supabaseServer();
  const { data, error } = await sb.from('people').delete().eq('id', id).select('id');
  if (error) return { error: explain(error) };
  if (!data?.length) return { error: 'Solo la administración del espacio que lo creó puede borrarlo.' };
  revalidatePath('/directorio');
  return {};
}
