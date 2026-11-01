'use server';
import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';

export type FormState = { error?: string; done?: string } | undefined;

export async function signIn(_prev: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get('email') || '').trim();
  const password = String(form.get('password') || '');
  if (!email || !password) return { error: 'Escribe tu correo y tu contraseña.' };
  const sb = await supabaseServer();
  const { error } = await sb.auth.signInWithPassword({ email, password });
  // mismo mensaje para todo: no revelamos qué correos tienen cuenta
  if (error) return { error: error.status === 429 ? 'Demasiados intentos. Espera unos minutos.' : 'Correo o contraseña incorrectos.' };
  redirect('/');
}

export async function signOut() {
  const sb = await supabaseServer();
  await sb.auth.signOut();
  redirect('/login');
}

export async function changePassword(_prev: FormState, form: FormData): Promise<FormState> {
  const password = String(form.get('password') || '');
  const again = String(form.get('again') || '');
  if (password.length < 12) return { error: 'Usa al menos 12 caracteres.' };
  if (password !== again) return { error: 'Las dos contraseñas no coinciden.' };
  const sb = await supabaseServer();
  const { error } = await sb.auth.updateUser({ password });
  if (error) return { error: error.message.includes('different') ? 'La nueva contraseña debe ser distinta a la actual.' : 'No se pudo cambiar. Intenta de nuevo.' };
  return { done: 'Listo, tu contraseña cambió.' };
}
