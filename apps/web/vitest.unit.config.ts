import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Stub SVG asset imports (e.g. `/assets/icons/integrations/lightdash.svg`).
// Vite serves these from /public at runtime so the import resolves to a URL
// string; vitest/jsdom has no public-dir handling, so the leading-slash path
// fails to resolve. A pre-resolver maps any `.svg` id to a string stub. Using a
// resolveId hook (not an alias) reliably matches whole ids including the public
// `/assets/...` form, which a suffix-based alias regex cannot.
const stubSvgImports = {
  name: 'stub-svg-imports',
  enforce: 'pre' as const,
  resolveId(id: string) {
    if (id.endsWith('.svg')) {
      return path.resolve(__dirname, '__tests__/stubs/svgStub.ts');
    }
    return null;
  },
};

export default defineConfig({
  plugins: [stubSvgImports, react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/client'),
      '@accomplish_ai/agent-core/common': path.resolve(
        __dirname,
        '../../packages/agent-core/src/common',
      ),
      '@accomplish_ai/agent-core': path.resolve(__dirname, '../../packages/agent-core/src'),
      '@locales': path.resolve(__dirname, 'locales'),
    },
  },
  test: {
    name: 'unit',
    globals: true,
    root: __dirname,
    include: ['__tests__/**/*.unit.test.{ts,tsx}'],
    setupFiles: ['__tests__/setup.ts'],
    environment: 'jsdom',
    testTimeout: 5000,
    hookTimeout: 10000,
  },
});
