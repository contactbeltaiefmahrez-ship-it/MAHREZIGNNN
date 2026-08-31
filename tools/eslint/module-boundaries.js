/**
 * MARKYRA module-boundary enforcement.
 *
 * Technical Architecture 02.3 requires boundaries to be mechanical, not cultural.
 * This rule implements three checks that fail the build:
 *
 *  1. TABLE OWNERSHIP  - SQL in modules/<m>/repository/** may only touch tables
 *                        owned by <m>. A query against a foreign table is an error.
 *  2. DECLARED DEPS    - modules/<a> may import modules/<b> only if <b> is listed
 *                        in modules/<a>/module.json "dependsOn".
 *  3. CONSTITUTIONAL   - `search` and `discovery` may never import `attention`.
 *                        This is the mechanical form of "attention never affects
 *                        search rank or trust". Not overridable.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const MODULES_DIR = path.join(ROOT, 'modules');

/** Modules that may never reach the attention module, at any distance. */
const ATTENTION_FORBIDDEN = new Set(['search', 'discovery']);

function loadManifests() {
  const out = new Map();
  if (!fs.existsSync(MODULES_DIR)) return out;
  for (const name of fs.readdirSync(MODULES_DIR)) {
    const file = path.join(MODULES_DIR, name, 'module.json');
    if (!fs.existsSync(file)) continue;
    out.set(name, JSON.parse(fs.readFileSync(file, 'utf8')));
  }
  return out;
}

const MANIFESTS = loadManifests();

/** table name -> owning module */
const TABLE_OWNER = new Map();
for (const [mod, m] of MANIFESTS) {
  for (const t of m.ownsTables ?? []) TABLE_OWNER.set(t, mod);
}

function moduleOf(filename) {
  const rel = path.relative(ROOT, filename);
  const parts = rel.split(path.sep);
  return parts[0] === 'modules' ? parts[1] : null;
}

function isRepositoryFile(filename) {
  return path.relative(ROOT, filename).split(path.sep)[2] === 'repository';
}

/** Extract table identifiers a SQL string touches. */
const SQL_TABLE_RE =
  /\b(?:from|join|into|update|delete\s+from|insert\s+into)\s+(?:only\s+)?([a-z_][a-z0-9_]*)/gi;
/** CTE / alias names defined inline are not real tables. */
const SQL_CTE_RE = /(?:\bwith\b|,)\s*([a-z_][a-z0-9_]*)\s+as\s*\(/gi;

const SQL_KEYWORDS = new Set([
  // clause keywords that can follow from/join/update in real SQL
  'select', 'where', 'set', 'values', 'returning', 'lateral', 'only',
  'update', 'skip', 'nowait', 'share', 'key', 'no', 'of',
  // set-returning functions are not tables
  'unnest', 'generate_series', 'jsonb_array_elements', 'jsonb_to_recordset',
  'json_to_recordset', 'regexp_split_to_table', 'string_to_table', 'dual',
]);

export default {
  meta: {
    type: 'problem',
    docs: { description: 'Enforce MARKYRA module boundaries' },
    schema: [],
    messages: {
      foreignTable:
        "Module '{{module}}' queried table '{{table}}' owned by '{{owner}}'. " +
        'Go through the owning module\'s service interface (Architecture 02.2).',
      unknownTable:
        "Table '{{table}}' is not declared in any module.json ownsTables. " +
        'Declare ownership before querying it.',
      sqlOutsideRepository:
        "SQL found in '{{module}}' outside repository/. Table access is only " +
        'permitted from modules/{{module}}/repository/ (Architecture 02.3).',
      undeclaredDep:
        "Module '{{from}}' imports '{{to}}' which is not in its module.json dependsOn.",
      constitutional:
        "CONSTITUTIONAL VIOLATION: '{{from}}' may never import 'attention'. " +
        'Attention must not be able to influence search rank or trust.',
      deepImport:
        "Import '{{to}}' reaches into another module's internals. " +
        'Import only from modules/{{mod}}/service.ts.',
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    const mod = moduleOf(filename);
    if (!mod) return {};
    const manifest = MANIFESTS.get(mod);
    const declared = new Set(manifest?.dependsOn ?? []);
    const inRepo = isRepositoryFile(filename);

    function checkSql(node, raw) {
      const sql = raw.toLowerCase();
      // Cheap gate: does this look like SQL at all?
      if (!/\b(select|insert|update|delete)\b/.test(sql)) return;

      if (!inRepo) {
        context.report({ node, messageId: 'sqlOutsideRepository', data: { module: mod } });
        return;
      }
      const ctes = new Set();
      for (const m of sql.matchAll(SQL_CTE_RE)) ctes.add(m[1]);

      for (const m of sql.matchAll(SQL_TABLE_RE)) {
        const table = m[1];
        if (SQL_KEYWORDS.has(table) || ctes.has(table)) continue;
        const owner = TABLE_OWNER.get(table);
        if (!owner) {
          context.report({ node, messageId: 'unknownTable', data: { table } });
        } else if (owner !== mod) {
          context.report({
            node, messageId: 'foreignTable', data: { module: mod, table, owner },
          });
        }
      }
    }

    function checkImport(node, source) {
      // Resolve BOTH forms: 'modules/x/...' and relative '../../x/...'.
      // Relative imports are the common case and must not slip through.
      let target = null;
      let rest = '';
      const abs = /modules\/([a-z-]+)(\/.*)?$/.exec(source);
      if (abs) { target = abs[1]; rest = abs[2] ?? ''; }
      else if (source.startsWith('.')) {
        const resolved = path.resolve(path.dirname(filename), source);
        const rel = path.relative(ROOT, resolved).split(path.sep);
        if (rel[0] === 'modules' && rel[1]) {
          target = rel[1];
          rest = rel.length > 2 ? '/' + rel.slice(2).join('/') : '';
        }
      }
      if (!target) return;
      if (target === mod) return;

      if (ATTENTION_FORBIDDEN.has(mod) && target === 'attention') {
        context.report({ node, messageId: 'constitutional', data: { from: mod } });
        return;
      }
      if (!declared.has(target)) {
        context.report({ node, messageId: 'undeclaredDep', data: { from: mod, to: target } });
      }
      if (rest && !/^\/service(\.ts)?$/.test(rest)) {
        context.report({ node, messageId: 'deepImport', data: { to: source, mod: target } });
      }
    }

    return {
      TemplateLiteral(node) {
        const raw = node.quasis.map((q) => q.value.raw).join(' ');
        checkSql(node, raw);
      },
      Literal(node) {
        if (typeof node.value === 'string') checkSql(node, node.value);
      },
      ImportDeclaration(node) {
        checkImport(node, node.source.value);
      },
    };
  },
};
