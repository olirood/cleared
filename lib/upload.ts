'use client';
// Subida directa del navegador al almacén privado; el servidor solo registra
import { supabaseBrowser } from './supabase/browser';

export const MAX_BYTES = 15 * 1024 * 1024;

async function sha256(blob: Blob) {
  const buf = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// miniatura JPEG de 640 px (Safari no genera WebP desde canvas)
export async function makeThumb(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 640 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise<Blob>((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error('thumb'))), 'image/jpeg', 0.82));
  const out = { blob, width: bmp.width, height: bmp.height };
  bmp.close();
  return out;
}

export async function uploadToFolder(workspaceId: string, recordingId: string, file: Blob, ext: string, contentType: string) {
  const key = `${workspaceId}/${recordingId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabaseBrowser().storage.from('cleared').upload(key, file, { contentType, upsert: false });
  if (error) throw error;
  return key;
}

export { sha256 };
