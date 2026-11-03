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

export const NATIONALITIES = [
  'Mexicana', 'Estadounidense', 'Colombiana', 'Argentina', 'Española', 'Venezolana', 'Chilena', 'Peruana',
  'Guatemalteca', 'Salvadoreña', 'Hondureña', 'Costarricense', 'Panameña', 'Puertorriqueña', 'Dominicana', 'Cubana',
  'Brasileña', 'Canadiense',
];

// Lada por país para WhatsApp (bandera con emoji)
export const PHONE_COUNTRIES = [
  ['MX', '🇲🇽', '+52'], ['US', '🇺🇸', '+1'], ['CO', '🇨🇴', '+57'], ['AR', '🇦🇷', '+54'], ['ES', '🇪🇸', '+34'],
  ['VE', '🇻🇪', '+58'], ['CL', '🇨🇱', '+56'], ['PE', '🇵🇪', '+51'], ['GT', '🇬🇹', '+502'], ['SV', '🇸🇻', '+503'],
  ['HN', '🇭🇳', '+504'], ['CR', '🇨🇷', '+506'], ['PA', '🇵🇦', '+507'], ['DO', '🇩🇴', '+1'], ['PR', '🇵🇷', '+1'],
  ['CU', '🇨🇺', '+53'], ['BR', '🇧🇷', '+55'], ['CA', '🇨🇦', '+1'],
] as const;
// "+52 55 1234 5678" → { country: 'MX', number: '55 1234 5678' }
export function splitPhone(v: string | null | undefined): { country: string; number: string } {
  const s = (v ?? '').trim();
  if (!s.startsWith('+')) return { country: 'MX', number: s };
  const hit = [...PHONE_COUNTRIES].sort((a, b) => b[2].length - a[2].length).find(([, , code]) => s.replace(/\s/g, '').startsWith(code));
  return hit ? { country: hit[0] === 'DO' || hit[0] === 'PR' || hit[0] === 'CA' ? 'US' : hit[0], number: s.slice(hit[2].length).trim() } : { country: 'MX', number: s };
}
export const joinPhone = (country: string, number: string) => {
  const n = number.replace(/[^\d ]/g, '').trim();
  const code = PHONE_COUNTRIES.find(([c]) => c === country)?.[2] ?? '+52';
  return n ? `${code} ${n}` : '';
};
