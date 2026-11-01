// Directorio: catálogos y reglas compartidas entre servidor y navegador

export const KINDS = [
  ['songwriter', 'Autor o compositor'],
  ['artist', 'Artista'],
  ['producer', 'Productor'],
  ['engineer', 'Ingeniero'],
  ['musician', 'Músico'],
  ['visual', 'Arte y video'],
] as const;
export type Kind = (typeof KINDS)[number][0];
export const kindLabel = (k: string) => KINDS.find(([v]) => v === k)?.[1] ?? k;

export const PROS = ['SACM', 'ASCAP', 'BMI', 'SESAC', 'SOCAN', 'SGAE', 'Otra', 'Ninguna'];

export type Publisher = { id: string; name: string; ipi: string | null; email: string | null; owner_workspace_id: string };
export type Person = {
  id: string;
  owner_workspace_id: string;
  represented_by: string | null;
  shared: boolean;
  legal_name: string;
  credit_name: string | null;
  nationality: string | null;
  email: string | null;
  phone: string | null;
  kinds: string[];
  instruments: string | null;
  isni: string | null;
  pro: string | null;
  pro_member_no: string | null;
  ipi: string | null;
  publisher_id: string | null;
  publishers: Publisher | null;
};
export type Workspace = { id: string; name: string; slug: string };
export type Membership = { workspace_id: string; role: 'owner' | 'admin' | 'operator' | 'viewer' };

export const canWriteRole = (r?: string) => r === 'owner' || r === 'admin' || r === 'operator';

// Lo que falta para que el perfil sirva en un split
export function missing(p: Pick<Person, 'legal_name' | 'kinds' | 'pro' | 'ipi'>): string[] {
  const m: string[] = [];
  if (!p.legal_name) m.push('nombre legal');
  if (p.kinds.includes('songwriter')) {
    if (!p.pro) m.push('sociedad');
    else if (p.pro !== 'Ninguna' && !p.ipi) m.push('IPI');
  }
  return m;
}

export const normName = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
export const cleanIpi = (s: string) => s.replace(/[\s-]/g, '');
