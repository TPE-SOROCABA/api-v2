/** Inventário estático das chamadas TPE do admin contra os controllers reais.
 * Uso: npx ts-node -T scripts/check-admin-routes.ts [diretório-do-admin]
 * Não executa aplicação nem solicita endpoints remotos.
 * Confirma registro de método/caminho, não equivalência de regras ou respostas.
 */
import * as ts from 'typescript';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';

const adminRoot = resolve(process.argv[2] || '../admin-tpe');
const apiRoot = resolve('src');
function files(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? files(path) : /\.tsx?$/.test(path) ? [path] : [];
  });
}
function parse(path: string) {
  return ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
}
function decorators(node: ts.Node) {
  return ts.canHaveDecorators(node) ? ts.getDecorators(node) || [] : [];
}
function decoratorCall(node: ts.Decorator) {
  return ts.isCallExpression(node.expression) ? node.expression : null;
}
function staticPath(node?: ts.Node): string | undefined {
  if (!node) return '';
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isTemplateExpression(node)) {
    return node.head.text + node.templateSpans.map((span) => ':dynamic' + span.literal.text).join('');
  }
  // URLs concatenadas no admin acrescentam query params ao caminho base.
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) return staticPath(node.left);
  return undefined;
}
function normalize(path: string) {
  return '/' + path.split('?')[0].replace(/^\/+|\/+$/g, '');
}
const routes: { method: string; path: string }[] = [];
for (const path of files(apiRoot).filter((f) => f.endsWith('.controller.ts'))) {
  const ast = parse(path);
  for (const statement of ast.statements) {
    if (!ts.isClassDeclaration(statement)) continue;
    const controller = decorators(statement)
      .map(decoratorCall)
      .find((call) => call?.expression.getText(ast) === 'Controller');
    if (!controller) continue;
    const prefix = staticPath(controller.arguments[0]);
    if (prefix === undefined) throw new Error(`Prefixo dinâmico não resolvido: ${path}`);
    for (const member of statement.members) {
      for (const decorator of decorators(member)) {
        const call = decoratorCall(decorator);
        if (!call) continue;
        const method = call.expression.getText(ast).toUpperCase();
        if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) continue;
        const suffix = staticPath(call.arguments[0]);
        if (suffix === undefined) throw new Error(`Rota dinâmica não resolvida: ${path}`);
        routes.push({ method, path: normalize(`${prefix}/${suffix || ''}`) });
      }
    }
  }
}
function matches(method: string, path: string) {
  const requested = normalize(path).split('/');
  return routes.some((route) => {
    const registered = route.path.split('/');
    return (
      route.method === method &&
      requested.length === registered.length &&
      registered.every((part, index) => part.startsWith(':') || requested[index].startsWith(':') || part === requested[index])
    );
  });
}
let calls = 0;
const unresolved: string[] = [];
const missing: string[] = [];
const consumed = new Set<string>();
for (const path of ['app', 'components', 'hooks', 'lib'].flatMap((dir) => files(join(adminRoot, dir)))) {
  const ast = parse(path);
  function scope(node: ts.Node): ts.Node {
    let parent = node.parent;
    while (parent && !ts.isFunctionLike(parent) && !ts.isSourceFile(parent)) parent = parent.parent;
    return parent || ast;
  }
  const initializers = new Map<string, { init: ts.Expression; scope: ts.Node }[]>();
  function variables(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      initializers.set(node.name.text, [...(initializers.get(node.name.text) || []), { init: node.initializer, scope: scope(node) }]);
    }
    ts.forEachChild(node, variables);
  }
  variables(ast);
  function candidates(node: ts.Expression, seen = new Set<string>()): string[] {
    const value = staticPath(node);
    if (value !== undefined) return [value];
    if (ts.isConditionalExpression(node)) return [...candidates(node.whenTrue, seen), ...candidates(node.whenFalse, seen)];
    if (ts.isIdentifier(node) && !seen.has(node.text)) {
      const next = new Set(seen).add(node.text);
      let currentScope = scope(node);
      while (true) {
        const local = (initializers.get(node.text) || []).filter((entry) => entry.scope === currentScope);
        if (local.length) return local.flatMap((entry) => candidates(entry.init, next));
        if (ts.isSourceFile(currentScope)) break;
        currentScope = scope(currentScope);
      }
      return [];
    }
    return [];
  }
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && ['apiClient', 'serverApiClient'].includes(node.expression.expression.getText(ast))) {
      calls++;
      const callName = node.expression.name.text;
      let methods = [callName === 'upload' ? 'POST' : callName.toUpperCase()];
      if (callName === 'request' || callName === 'upload') {
        const options = node.arguments[callName === 'upload' ? 2 : 1];
        const property = options && ts.isObjectLiteralExpression(options) ? options.properties.find((p) => p.name?.getText(ast) === 'method') : undefined;
        methods = property && ts.isPropertyAssignment(property) ? candidates(property.initializer) : [callName === 'upload' ? 'POST' : 'GET'];
      }
      const urls = node.arguments[0] ? candidates(node.arguments[0]) : [];
      const label = `${relative(adminRoot, path)}:${ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1}`;
      if (!urls.length) unresolved.push(label);
      for (const url of urls) {
        const matched = methods.filter((method) => matches(method, url));
        for (const method of matched) consumed.add(`${method} ${normalize(url)}`);
        if (!matched.length) missing.push(`${label} — ${methods.join('|')} ${url}`);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
}
console.log(`${calls} chamadas HTTP do admin; ${consumed.size} contratos método/caminho; ${routes.length} rotas registradas no BFF.`);
console.log([...consumed].sort().join('\n'));
console.log(`\nNão resolvidas: ${unresolved.length}; sem rota no BFF: ${missing.length}`);
if (unresolved.length || missing.length) {
  console.error([...unresolved, ...missing].join('\n'));
  process.exitCode = 1;
}
