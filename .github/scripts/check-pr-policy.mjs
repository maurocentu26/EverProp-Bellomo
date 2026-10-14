import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export function checkBranch(base, head) {
  if (base === 'develop' && (head === 'main' || /^ticket\/EVP-(L[0-9]+|[0-9]+(\.[0-9]+)?)-[a-z0-9][a-z0-9-]*$/.test(head))) return;
  if (base === 'main' && /^(release|hotfix)\/[a-z0-9][a-z0-9._/-]*$/.test(head)) return;
  throw new Error(base === 'main'
    ? 'main solo admite release/* o hotfix/*; develop no puede integrarse directamente.'
    : 'develop requiere ticket/EVP-XX-descripcion (o EVP-LXX); única excepción: main.');
}

const excluded = /^(?:everprop-api\/app\/Domain\/(?:AgentRuntime|Conversations|Usage)\/|everprop-api\/config\/(?:agent|conversations)\.php$|everprop-api\/app\/Console\/Commands\/(?:ConversationKpis|ReconcileConversations)\.php$|everprop-api\/database\/schema\/forward\/[^/]*(?:conversation|agent_runtime|knowledge|chatbot)[^/]*\.sql$|everprop-public\/src\/app\/(?:widget\/|admin\/(?:conversaciones|conocimiento|solicitudes-visita)\/)|everprop-public\/src\/components\/(?:admin\/(?:assistant|conversations)\/|admin\/(?:AiSettings|BusinessHoursSettings)\.tsx$|public\/ChatWidget\.tsx$)|everprop-public\/src\/lib\/(?:assistant|conversations)-api\.ts$)/;

export function checkMainTree(tree, cwd = process.cwd()) {
  if (!/^[0-9a-f]{40}$/.test(tree)) throw new Error('Se requiere el SHA completo del árbol del PR.');
  const paths = execFileSync('git', ['ls-tree', '-r', '--name-only', tree], { cwd, encoding: 'utf8' }).trim().split('\n');
  const forbidden = paths.filter((path) => excluded.test(path));
  if (forbidden.length) throw new Error(`main no admite IA/conversaciones, aunque ya estuvieran en la rama:\n${forbidden.join('\n')}`);

  // Mixed files can retain imports/routes after the module directories were removed.
  const fingerprints = 'AgentRuntime|Domain\\\\Conversations|conversations-api|assistant-api|ChatWidget|AiSettings|BusinessHoursSettings|/admin/conversaciones|/admin/conocimiento|/widget/';
  try {
    const matches = execFileSync('git', ['grep', '-n', '-I', '-E', fingerprints, tree, '--', 'everprop-api/app', 'everprop-api/bootstrap', 'everprop-api/config', 'everprop-api/routes', 'everprop-public/src'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    throw new Error(`Quedaron referencias a IA/conversaciones en archivos compartidos:\n${matches}`);
  } catch (error) {
    if (error.status !== 1) throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    checkBranch(process.env.BASE, process.env.HEAD);
    if (process.env.BASE === 'main') checkMainTree(process.env.PR_TREE);
    console.log(`OK: ${process.env.HEAD} → ${process.env.BASE}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
