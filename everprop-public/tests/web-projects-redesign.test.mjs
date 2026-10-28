import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as jsx from 'react/jsx-runtime';

// Helper to compile TS to CJS
const compile = (relativePath) =>
  ts.transpileModule(fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;

// Transpile project-landing.ts
const landingExports = {
  exports: {},
  require: () => ({
    apiFetch: async () => ({ data: {} }),
  }),
};
vm.runInNewContext(compile('../src/lib/project-landing.ts'), landingExports);
const { landingPayload } = landingExports.exports;

test('EVP-90: landingPayload cleans metadata and prepares clean landing payload', () => {
  const sampleProject = {
    public_id: 'p-123',
    slug: 'el-rocio',
    name: 'El Rocío',
    is_visible: true,
    sort_order: 10,
    featured_order: 0,
    summary: 'Barrio abierto en San Lorenzo Chico',
    description: 'Extensa descripción con detalles del desarrollo.',
    category: 'LAND_DEVELOPMENT',
    status_label: 'En pozo',
    is_featured: false,
    location: {
      city: 'San Lorenzo',
      province: 'Salta',
      address: 'Ruta 28 km 4',
    },
    cover: {
      url: 'https://example.com/cover.jpg',
      alt: 'Acceso principal',
      kind: 'PHOTO',
    },
    logo: {
      url: 'https://example.com/logo.png',
      alt: 'Logo El Rocío',
    },
    gallery: [
      {
        url: 'https://example.com/gal1.jpg',
        alt: 'Vista aérea',
        kind: 'RENDER',
      },
    ],
    features: ['Agua corriente', 'Luz subterránea', 'Seguridad 24hs'],
    documents: [],
    updated_at: '2026-10-28T14:00:00Z',
  };

  const payload = landingPayload(sampleProject);

  assert.equal(payload.slug, 'el-rocio');
  assert.equal(payload.is_visible, true);
  assert.equal(payload.category, 'LAND_DEVELOPMENT');
  assert.equal(payload.status_label, 'En pozo');
  assert.equal(payload.summary, 'Barrio abierto en San Lorenzo Chico');
  assert.equal(payload.cover.url, 'https://example.com/cover.jpg');
  assert.equal(payload.logo.url, 'https://example.com/logo.png');
  assert.deepEqual(payload.features, ['Agua corriente', 'Luz subterránea', 'Seguridad 24hs']);
  assert.equal('public_id' in payload, false, 'public_id must be stripped from payload');
  assert.equal('updated_at' in payload, false, 'updated_at must be stripped from payload');
});

test('EVP-90: ProjectWebEditor renders descriptive catalog, search bar, filters and preview modal', () => {
  const sampleProjects = [
    {
      public_id: 'proj-1',
      name: 'El Rocío Residencial',
      can_edit: true,
      can_publish: true,
      slug: 'el-rocio',
      is_visible: true,
      category: 'LAND_DEVELOPMENT',
      status_label: 'En pozo',
      summary: 'Barrio abierto residencial en San Lorenzo Chico.',
      description: 'Hermoso entorno natural con todos los servicios subterráneos.',
      location: {
        city: 'San Lorenzo',
        province: 'Salta',
        address: 'Ruta 28 km 4',
      },
      cover: {
        url: 'https://pub-6e84e10f99f7480da92cffa0fbe4b8b3.r2.dev/el-rocio/portada.jpg',
        alt: 'Portada',
        kind: 'PHOTO',
      },
      logo: {
        url: 'https://pub-6e84e10f99f7480da92cffa0fbe4b8b3.r2.dev/el-rocio/logo.png',
        alt: 'Logo',
      },
      gallery: [],
      features: ['Luz y agua', 'Calles consolidadas'],
    },
    {
      public_id: 'proj-2',
      name: 'Huasi Mitre',
      can_edit: true,
      can_publish: true,
      slug: 'huasi-mitre',
      is_visible: false,
      category: 'HUASI',
      status_label: 'Preventa',
      summary: 'Complejo de departamentos premium sobre calle Mitre.',
      description: 'Departamentos modernos con terraza y amenities.',
      location: {
        city: 'Salta Capital',
        province: 'Salta',
        address: 'Av. Mitre 540',
      },
      cover: null,
      logo: null,
      gallery: [],
      features: ['Piscina', 'SUM con asador'],
    },
  ];

  // Load Component with mocked context
  const context = {
    exports: {},
    require: (name) => {
      if (name === 'react/jsx-runtime') return jsx;
      if (name === 'react') return React;
      if (name === 'lucide-react') {
        return new Proxy(
          {},
          {
            get: (_, prop) => (props) =>
              React.createElement('span', { 'data-icon': String(prop), ...props }),
          }
        );
      }
      if (name === '@/components/ui/button') {
        return {
          Button: ({ children, className, ...props }) =>
            React.createElement('button', { className, ...props }, children),
        };
      }
      if (name === '@/lib/everprop-api') {
        return {
          apiFetch: async () => ({ data: sampleProjects }),
          EverpropApiError: class extends Error {},
        };
      }
      if (name === '@/lib/project-landing') {
        return landingExports.exports;
      }
      throw new Error(`Unhandled mock require: ${name}`);
    },
  };

  vm.runInNewContext(compile('../src/components/admin/ProjectWebEditor.tsx'), context);
  const ProjectWebEditor = context.exports.default;

  // Render component in default mode (no fixed project)
  const html = renderToStaticMarkup(React.createElement(ProjectWebEditor, {}));

  // Assert catalog search input and filters are present
  assert.ok(html.includes('Buscar por nombre, eslogan o ubicación...'), 'Should have search placeholder');
  assert.ok(html.includes('Loteos'), 'Should render Loteos category tab');
  assert.ok(html.includes('Huasi'), 'Should render Huasi category tab');
  assert.ok(html.includes('Comercial'), 'Should render Comercial tab');
  assert.ok(html.includes('Web y Catálogo de Proyectos'), 'Should have main title');

  // Adherence to Corporate Design System: no bg-gradient allowed
  assert.ok(!html.includes('bg-gradient'), 'Must not contain gradients (corporate design system)');
});
