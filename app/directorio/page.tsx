import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import TopBar from '../components/TopBar';
import Directory from './Directory';
import type { Membership, Person, Workspace } from '@/lib/people';
import { buildReps, type RepRow } from '@/lib/reps';

export const metadata = { title: 'Directorio · Cleared' };

export default async function DirectorioPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');

  const [mem, ws, people, reps] = await Promise.all([
    sb.from('memberships').select('workspace_id, role, display_name').eq('user_id', user.id).order('created_at'),
    sb.from('workspaces').select('id, name, slug').order('name'),
    sb.from('people')
      .select('id, owner_workspace_id, represented_by, shared, legal_name, credit_name, nationality, email, phone, kinds, instruments, isni, pro, pro_member_no, ipi, publisher_id, publishers(id, name, ipi, email, owner_workspace_id)')
      .order('legal_name'),
    sb.rpc('workspace_reps'),
  ]);
  const name = mem.data?.find((m) => m.display_name)?.display_name || user.email || '';

  return (
    <>
      <TopBar name={name} />
      <main className="wrap">
        <Directory
          startOpen={sp.nuevo === '1' ? 'new' : typeof sp.p === 'string' ? sp.p : null}
          people={(people.data ?? []) as unknown as Person[]}
          workspaces={(ws.data ?? []) as Workspace[]}
          memberships={(mem.data ?? []) as Membership[]}
          reps={buildReps((reps.data ?? []) as RepRow[])}
        />
      </main>
    </>
  );
}
