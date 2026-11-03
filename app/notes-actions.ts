'use server';
// Mis pendientes: notas personales del inicio (privadas, sin ligarse a tracks ni splits)
import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/lib/supabase/server';

type R = { error?: string };
const fail = (m: string): R => ({ error: /notes/.test(m) && /exist|schema cache/.test(m) ? 'Falta correr la migración de notas en Supabase.' : 'No se pudo guardar. Intenta de nuevo.' });
const okDate = (d: string | null) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);

export async function addNote(body: string, due: string | null): Promise<R> {
  const b = body.trim().slice(0, 500);
  if (!b) return { error: 'Escribe algo.' };
  const { error } = await (await supabaseServer()).from('notes').insert({ body: b, due_on: okDate(due) });
  if (error) return fail(error.message);
  revalidatePath('/');
  return {};
}
export async function toggleNote(id: string, done: boolean): Promise<R> {
  const { error } = await (await supabaseServer()).from('notes').update({ done_at: done ? new Date().toISOString() : null }).eq('id', id);
  if (error) return fail(error.message);
  revalidatePath('/');
  return {};
}
export async function deleteNote(id: string): Promise<R> {
  const { error } = await (await supabaseServer()).from('notes').delete().eq('id', id);
  if (error) return fail(error.message);
  revalidatePath('/');
  return {};
}
export async function clearDone(): Promise<R> {
  const { error } = await (await supabaseServer()).from('notes').delete().not('done_at', 'is', null);
  if (error) return fail(error.message);
  revalidatePath('/');
  return {};
}
