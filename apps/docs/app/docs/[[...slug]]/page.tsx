import { source } from '@/lib/source';
import { DocsPage, DocsBody } from 'fumadocs-ui/page';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import defaultMdxComponents from 'fumadocs-ui/mdx';

export default async function DocPage({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug } = await params;
  const page = source.getPage(slug);

  if (!page) {
    return <div>Page not found</div>;
  }

  const MDX = page.data.body;

  return (
    <DocsPage>
      <DocsBody>
        <MDX
          components={{
            ...defaultMdxComponents,
            a: createRelativeLink(source, page),
          }}
        />
      </DocsBody>
    </DocsPage>
  );
}

export async function generateStaticParams() {
  const pages = source.getPages();
  return pages.map((page) => ({
    slug: page.slugs,
  }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug } = await params;
  const page = source.getPage(slug);
  if (!page) return {};

  return {
    title: page.data.title,
    description: page.data.description,
  };
}
