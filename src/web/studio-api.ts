import type { IncomingMessage } from 'node:http';
import type { Orchestrator } from '../orchestrator.js';
import { StudioError, hash, object, text } from '../studio/definitions.js';
import { blankGraph, GraphError, graphShape } from '../studio/graph.js';

export async function studioRequest(req: IncomingMessage, url: URL, orchestrator: Orchestrator,
  account: { username: string; role: string }, readBody: () => Promise<Record<string, unknown>>) {
  const method = req.method ?? 'GET';
  const path = url.pathname;
  const studio = orchestrator.studio;
  const catalog = studio.catalog;
  const flowMatch = /^\/api\/studio\/workflows(?:\/([\w-]+))?(?:\/(draft|revisions|publish|export))?(?:\/(\d+))?$/.exec(path);
  if (flowMatch || ['/api/studio/workflow-validate', '/api/studio/workflow-import', '/api/studio/workflow-templates'].includes(path)) {
    if (account.role !== 'operator') throw new StudioError(403, 'OPERATOR_REQUIRED', '工作流设计与执行需要操作者权限。');
    const store = studio.workflows;
    if (path.endsWith('/workflow-validate') && method === 'POST') {
      const graph = graphShape(await readBody());
      try { const compiled = studio.compile(graph); return { status: 200, data: { valid: true, errors: [], executionHash: hash({ graph, dependencies: compiled.dependencies }), compiled: compiled.workflow } }; }
      catch (error) { if (error instanceof GraphError || error instanceof StudioError) return { status: 200, data: { valid: false, errors: error instanceof GraphError ? error.issues : [{ code: error.code, message: error.message }] } }; throw error; }
    }
    if (path.endsWith('/workflow-templates') && method === 'GET') {
      const team = catalog.list('teams').find(t => t.enabled && !t.archivedAt);
      const graph = blankGraph(team ? { id: team.id, revision: team.revisions.length } : undefined);
      return { status: 200, data: { blank: graph } };
    }
    if (path.endsWith('/workflow-import') && method === 'POST') {
      const body = await readBody(); object(body, 'import', ['slug', 'bundle']); object(body.bundle, 'bundle', ['schemaVersion', 'graph', 'hash', 'dependencies']);
      if (body.bundle.schemaVersion !== 1 || hash(body.bundle.graph) !== body.bundle.hash) throw new StudioError(422, 'IMPORT_HASH', '导入包格式或指纹不匹配。');
      if (!Array.isArray(body.bundle.dependencies) || body.bundle.dependencies.length > 1000) throw new StudioError(422, 'IMPORT_DEPENDENCY', '依赖清单必须是最多 1000 项的数组。');
      const graph = graphShape(body.bundle.graph);
      for (const dep of body.bundle.dependencies ?? []) {
        object(dep, 'dependency', ['kind', 'id', 'revision', 'hash']);
        const ref = { id: dep.id, revision: dep.revision };
        const revision = dep.kind === 'workflows' ? store.revision(ref) : dep.kind === 'teams' ? catalog.revision('teams', ref) : dep.kind === 'agents' ? catalog.revision('agents', ref) : undefined;
        if (!revision || revision.hash !== dep.hash) throw new StudioError(422, 'IMPORT_DEPENDENCY', '导入依赖版本不匹配；请在目标服务建立相同定义或显式重新绑定。');
      }
      studio.compile(graph);
      return { status: 201, data: store.create({ slug: body.slug, config: graph }, account.username) };
    }
    if (flowMatch) {
      const [, id, action, revision] = flowMatch;
      if (method === 'GET' && !id) return { status: 200, data: store.list().map(w => ({ id: w.id, slug: w.slug, name: w.draft.name, revision: w.revisions.length, publishedRevision: w.publishedRevision, archivedAt: w.archivedAt })) };
      if (method === 'POST' && !id) return { status: 201, data: store.create(await readBody(), account.username) };
      if (method === 'GET' && id && action === 'export') {
        const rev = store.revision({ id, revision: Number(url.searchParams.get('revision')) });
        const compiled = studio.compile(rev.config);
        const team = catalog.revision('teams', rev.config.teamRef!);
        const dependencies = [{ kind: 'teams', ...rev.config.teamRef!, hash: team.hash },
          ...team.config.members.map(m => ({ kind: 'agents', ...m.agentRef, hash: catalog.revision('agents', m.agentRef).hash })),
          ...compiled.dependencies.map(d => ({ kind: 'workflows', ...d.ref, hash: store.revision(d.ref).hash }))];
        return { status: 200, data: { schemaVersion: 1, graph: rev.config, hash: rev.hash, dependencies } };
      }
      if (method === 'GET' && id) {
        const item = store.get(id);
        if (action === 'revisions') return { status: 200, data: revision ? store.revision({ id, revision: Number(revision) }) : item.revisions };
        return { status: 200, data: item, etag: item.etag };
      }
      const etag = typeof req.headers['if-match'] === 'string' ? req.headers['if-match'] : undefined;
      if (id && (method === 'PUT' && action === 'draft' || method === 'POST' && ['revisions', 'publish'].includes(action)))
        return { status: 200, data: store.mutate(id, etag, action === 'revisions' ? 'revision' : action as 'draft' | 'publish', await readBody(), account.username) };
      if (id && method === 'DELETE' && !action) return { status: 200, data: store.mutate(id, etag, 'archive', {}, account.username) };
    }
    throw new StudioError(404, 'NOT_FOUND', '工作流接口不存在。');
  }
  const approvalMatch = /^\/api\/studio\/runs\/(run-\d+)\/approvals\/([\w-]+)$/.exec(path);
  if (approvalMatch && method === 'POST') {
    if (account.role !== 'operator') throw new StudioError(403, 'OPERATOR_REQUIRED', '审批需要操作者权限。');
    const run = orchestrator.decideApproval(approvalMatch[1], approvalMatch[2], await readBody(), account.username);
    return { status: 200, data: { runId: run.runId, status: run.status, approvals: run.approvals } };
  }
  if (method === 'GET' && path === '/api/studio/catalog') {
    const { templates, ...publicCatalog } = studio.getCatalog();
    return { status: 200, data: account.role === 'operator' ? { ...publicCatalog, templates } : publicCatalog };
  }
  const resource = /^\/api\/studio\/(agents|teams)(?:\/([\w-]+))?(?:\/(draft|revisions))?(?:\/(\d+))?$/.exec(path);
  if (resource) {
    const kind = resource[1] as 'agents' | 'teams';
    const id = resource[2]; const action = resource[3]; const revision = resource[4];
    if (method === 'GET' && !id) {
      return { status: 200, data: catalog.list(kind).map(item => ({ id: item.id, slug: item.slug, origin: item.origin,
        enabled: item.enabled, archivedAt: item.archivedAt, createdAt: item.createdAt, revision: item.revisions.length,
        etag: item.etag, name: item.revisions.at(-1)!.config.name,
        description: item.revisions.at(-1)!.config.description,
        ...(kind === 'agents' ? { roleLabel: (item as any).revisions.at(-1).config.roleLabel } : {}) })) };
    }
    if (account.role !== 'operator') throw new StudioError(403, 'OPERATOR_REQUIRED', '编辑配置和历史指令仅对操作者开放。');
    if (method === 'GET' && id) {
      const item = catalog.get(kind, id);
      if (action === 'revisions') {
        const data = revision ? item.revisions.find(r => r.revision === Number(revision)) : item.revisions;
        if (!data) throw new StudioError(404, 'REVISION_NOT_FOUND', '所选版本不存在。');
        return { status: 200, data };
      }
      return { status: 200, data: item, etag: item.etag };
    }
    if (method === 'POST' && !id) return { status: 201, data: catalog.create(kind, await readBody(), account.username) };
    const etag = typeof req.headers['if-match'] === 'string' ? req.headers['if-match'] : undefined;
    if (id && method === 'PUT' && action === 'draft') return { status: 200, data: catalog.mutate(kind, id, etag, 'draft', await readBody(), account.username) };
    if (id && method === 'POST' && action === 'revisions' && !revision) return { status: 201, data: catalog.mutate(kind, id, etag, 'revision', await readBody(), account.username) };
    if (id && !action && method === 'PATCH') return { status: 200, data: catalog.mutate(kind, id, etag, 'status', await readBody(), account.username) };
    if (id && !action && method === 'DELETE') return { status: 200, data: catalog.mutate(kind, id, etag, 'archive', {}, account.username) };
  }
  if (method === 'POST' && ['/api/studio/runs', '/api/studio/tests'].includes(path)) {
    if (account.role !== 'operator') throw new StudioError(403, 'OPERATOR_REQUIRED', '测试与执行需要操作者权限。');
    const body = await readBody();
    if (path.endsWith('/tests')) { object(body, 'request', ['agentRef', 'input']); body.kind = 'agent-test'; }
    const key = req.headers['idempotency-key'];
    if (key !== undefined) text(key, 'Idempotency-Key', 100);
    const fingerprint = hash(body);
    if (key) {
      const previous = orchestrator.getRuns().find(r => r.requestKey?.actor === account.username && r.requestKey.key === key);
      if (previous) {
        if (previous.requestKey!.hash !== fingerprint) throw new StudioError(409, 'IDEMPOTENCY_CONFLICT', '该请求标识已用于不同输入。');
        return { status: 202, data: { runId: previous.runId } };
      }
    }
    let runId: string | undefined;
    orchestrator.runStudio(body, { requestedBy: account.username, onStart: id => {
      runId = id;
      if (key) orchestrator.getRun(id)!.requestKey = { actor: account.username, key, hash: fingerprint };
    } }).catch(() => {});
    if (!runId) throw new StudioError(503, 'RUN_NOT_CREATED', '运行未创建，请重试。');
    return { status: 202, data: { runId } };
  }
  const runId = /^\/api\/studio\/runs\/(run-\d+)$/.exec(path)?.[1];
  if (method === 'GET' && runId) {
    if (account.role !== 'operator') throw new StudioError(403, 'OPERATOR_REQUIRED', '完整版本快照仅对操作者开放。');
    const run = orchestrator.getRun(runId);
    if (!run?.definitions) throw new StudioError(404, 'NOT_FOUND', 'Studio 运行不存在。');
    return { status: 200, data: { runId, definitions: run.definitions, attempts: run.attempts, result: run.result, status: run.status, error: run.error,
      approvals: run.approvals, verification: run.verification, loopRounds: run.loopRounds, events: orchestrator.getEvents(runId) } };
  }
  throw new StudioError(404, 'NOT_FOUND', '接口不存在。');
}
