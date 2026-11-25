import { AdminCostReconcile } from '@/components/admin/AdminCosts';

export default async function CostReconcilePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <AdminCostReconcile search={new URLSearchParams(Object.entries(await searchParams).filter((e): e is [string, string] => typeof e[1] === 'string')).toString()} />;
}
