import { CreateForm } from '@/components/CreateForm';
import { exampleFrom, refillFrom } from '@/lib/reuse';

const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined);

export default async function CreatePage({ searchParams }: { searchParams: Promise<{ reuse?: string; template?: string; example?: string; preset?: string | string[]; model?: string | string[]; image?: string | string[]; prompt?: string | string[] }> }) {
  const q = await searchParams;
  const reuse = refillFrom(q) ?? exampleFrom(q);
  // A picture to start from (History's video action on an image): an asset id only.
  const image = /^[\w-]{1,64}$/.test(one(q.image) ?? '') ? one(q.image) : undefined;
  // A free prompt to start from (the analysis page's push-prompt link): capped so a link cannot push an oversized body; a refill wins over it.
  const seedPrompt = reuse ? undefined : one(q.prompt)?.slice(0, 2000);
  // Keyed by the refill source and the Explore choice, so following another link starts the form afresh.
  return <CreateForm key={[reuse, one(q.preset), one(q.model), image, seedPrompt].join('|')} reuse={reuse} preset={one(q.preset)} model={one(q.model)} image={image} seedPrompt={seedPrompt} />;
}
