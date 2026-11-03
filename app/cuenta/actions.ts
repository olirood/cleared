'use server';
import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/lib/supabase/server';

// Nombre visible y color de tu inicial (en todos tus espacios)
export async function saveAccount(name: string, color: string | null): Promise<{ error?: string }> {
  const n = name.trim();
  if (!n || n.length > 40) return { error: 'Tu nombre debe tener entre 1 y 40 caracteres.' };
  if (color !== null && !/^#[0-9A-Fa-f]{6}$/.test(color)) return { error: 'Elige un color de la lista.' };
  const sb = await supabaseServer();
  const { error } = await sb.rpc('set_my_account', { display_name: n, avatar_color: color });
  if (error) return { error: /set_my_account/.test(error.message) ? 'Falta correr la migración de cuenta en Supabase.' : 'No se pudo guardar. Intenta de nuevo.' };
  revalidatePath('/', 'layout');
  return {};
}

// Cierra tu sesión en todos los demás dispositivos; esta sigue abierta
export async function signOutOthers(): Promise<{ error?: string }> {
  const sb = await supabaseServer();
  const { error } = await sb.auth.signOut({ scope: 'others' });
  return error ? { error: 'No se pudo cerrar las otras sesiones. Intenta de nuevo.' } : {};
}
