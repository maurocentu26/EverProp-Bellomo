// Reproducible source inventory. Static reachability is not proof a file is safe to delete.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const front = path.join(root, 'everprop-public');
const ts = require(path.join(front, 'node_modules/typescript'));
const config = ts.readConfigFile(path.join(front, 'tsconfig.json'), ts.sys.readFile);
const options = ts.parseJsonConfigFileContent(config.config, ts.sys, front).options;
const slash = p => p.replaceAll('\\', '/');
const files = [];
function walk(dir) { for (const entry of fs.readdirSync(dir, {withFileTypes:true})) {
  const p = path.join(dir, entry.name); if (entry.isDirectory()) walk(p); else if (/\.(tsx?|css)$/.test(p)) files.push(p);
}}
walk(path.join(front, 'src'));
const graph = new Map(); const records = [];
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const imports = []; const exports = []; const review = [];
  function visit(node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) imports.push(node.moduleSpecifier.text);
    if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) imports.push(node.moduleSpecifier.text);
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && ts.isStringLiteral(node.arguments[0])) imports.push(node.arguments[0].text);
    if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) && node.name) exports.push(node.name.text);
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(source);
      const attrs = node.attributes.properties.filter(ts.isJsxAttribute).map(a=>a.name.getText(source));
      if (['input','select','textarea'].includes(tag) && !attrs.some(a=>['aria-label','aria-labelledby','id'].includes(a)))
        review.push({line:source.getLineAndCharacterOfPosition(node.getStart()).line+1, type:'control_requires_label_review', tag});
    }
    ts.forEachChild(node, visit);
  }
  if (!file.endsWith('.css')) visit(source);
  const resolved = imports.map(i=>ts.resolveModuleName(i,file,options,ts.sys).resolvedModule?.resolvedFileName).filter(Boolean).map(p=>path.resolve(p));
  graph.set(file,resolved);
  records.push({file:slash(path.relative(root,file)),symbols:exports,imports,review,lines:text.split(/\r?\n/).length});
}
const visited = new Set();
function reach(file) { if (visited.has(file)) return; visited.add(file); for (const dependency of graph.get(file)||[]) reach(dependency); }
for (const file of files) if (/[/\\]src[/\\]app[/\\].*[/\\]?(page|layout|route|manifest|error|loading|not-found|template|global-error)\.[jt]sx?$/.test(file)) reach(file);
for (const record of records) record.reachableFromNextEntry = record.file.endsWith('.css') ? null : visited.has(path.join(root,record.file));
fs.writeFileSync(path.join(__dirname,'frontend-source-review.json'),JSON.stringify(records,null,2));
console.log(JSON.stringify({files:records.length,unreachable:records.filter(r=>r.reachableFromNextEntry===false).map(r=>r.file),labelReviewCandidates:records.reduce((n,r)=>n+r.review.length,0)},null,2));
