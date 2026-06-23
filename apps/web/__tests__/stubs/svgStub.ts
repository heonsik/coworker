// Test stub for SVG asset imports.
//
// Several components import icons via Vite's public-dir convention, e.g.
// `import icon from '/assets/icons/integrations/lightdash.svg'`. At runtime Vite
// serves these from /public and the import resolves to a URL string. Under
// vitest/jsdom there is no public-dir handling, so the leading-slash path is
// treated as a filesystem path and fails to load (on Windows it surfaces as
// `file:///assets/...`). Aliasing `*.svg` to this stub makes the import return a
// harmless string, matching the runtime shape (a URL string) closely enough for
// component tests that only render the icon's `src`.
export default 'svg-stub';
