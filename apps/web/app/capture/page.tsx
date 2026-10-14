import { redirect } from 'next/navigation';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Chunk 2's placeholder route, now Today (AD-104). Middleware redirects it when
 * sign-in is on; this covers a deploy without sign-in, where middleware passes
 * every request through.
 */
export default async function CapturePage({ searchParams }: { readonly searchParams: SearchParams }) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const v of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(key, v);
  }
  const search = query.toString();
  redirect(search ? `/today?${search}` : '/today');
}
