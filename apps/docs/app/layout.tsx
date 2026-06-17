import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { RootProvider } from 'fumadocs-ui/provider';
import { source } from '@/lib/source';
import './globals.css';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <RootProvider>
          <DocsLayout
            nav={{ title: 'flue-eve' }}
            tree={source.pageTree}
          >
            {children}
          </DocsLayout>
        </RootProvider>
      </body>
    </html>
  );
}
