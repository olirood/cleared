// Quién representa a una persona: se muestra por la gente que opera el espacio.
// Si varios espacios los opera la misma gente (Oliver en Kevin y en Octavio), salen como uno solo.

export type RepRow = { id: string; name: string; members: string[]; members_key: string };
export type Rep = { key: string; label: string; ids: string[]; users: string[] };

export function buildReps(rows: RepRow[]): Rep[] {
  const groups = new Map<string, RepRow[]>();
  for (const r of rows) {
    const k = r.members_key || `ws:${r.id}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  return [...groups.entries()].map(([key, rs]) => ({
    key,
    ids: rs.map((r) => r.id),
    users: rs[0].members_key ? rs[0].members_key.split(',') : [],
    label: rs.length > 1 ? [...new Set(rs[0].members)].join(' y ') : rs[0].name,
  })).sort((a, b) => a.label.localeCompare(b.label));
}
export const repFor = (reps: Rep[], wsId: string | null | undefined) => (wsId ? reps.find((r) => r.ids.includes(wsId)) : undefined);
export const repLabel = (reps: Rep[], wsId: string | null | undefined, fallback = '') => repFor(reps, wsId)?.label ?? fallback;
// ¿Lo representa la misma gente que opera este espacio?
export const sameRep = (reps: Rep[], a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && (a === b || (repFor(reps, a)?.key ?? a) === (repFor(reps, b)?.key ?? b));

// Igual que la base: se pide aprobación si en el espacio que representa hay alguien
// que no opera el espacio dueño del split
export function needsApproval(reps: Rep[], repWs: string | null | undefined, ownerWs: string) {
  if (!repWs || repWs === ownerWs) return false;
  const r = repFor(reps, repWs), o = repFor(reps, ownerWs);
  if (!r) return true;
  return r.users.some((u) => !(o?.users ?? []).includes(u));
}
