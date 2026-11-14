import { Library } from '@/components/Library';
import { filtersFromSearch } from '@/lib/library-view';

export default async function LibraryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <Library initialFilters={filtersFromSearch(await searchParams)} />;
}
