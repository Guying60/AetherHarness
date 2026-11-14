import { randomUUID } from 'node:crypto';
import { JsonStore } from '../store/json-store.js';
import { clone, hash, identifier, StudioError, object, number } from './definitions.js';
import { Graph, GraphDefinition, graphShape } from './graph.js';

interface Data { version: 1; workflows: GraphDefinition[]; audit: Array<{ at: number; actor: string; id: string; action: string }> }
export class WorkflowStore {
  private storage?: JsonStore;
  private data: Data = { version: 1, workflows: [], audit: [] };
  constructor(directory: string | undefined, private readonly validate: (graph: Graph) => unknown) {
    if (!directory) return;
    this.storage = new JsonStore(directory);
    try {
      const data = this.storage.read(this.data);
      if (data.version !== 1 || !Array.isArray(data.workflows) || !Array.isArray(data.audit)) throw new Error('Invalid workflow storage');
      const ids = new Set(), slugs = new Set();
      for (const item of data.workflows) {
        identifier(item.id, 'id'); identifier(item.slug, 'slug'); graphShape(item.draft);
        if (ids.has(item.id) || slugs.has(item.slug) || !item.etag || !Array.isArray(item.revisions) || typeof item.enabled !== 'boolean') throw new Error('Invalid workflow definition');
        ids.add(item.id); slugs.add(item.slug);
        item.revisions.forEach((r, i) => { graphShape(r.config); if (r.revision !== i + 1 || r.hash !== hash(r.config)) throw new Error('Invalid workflow revision'); });
        if (item.publishedRevision && !item.revisions[item.publishedRevision - 1]) throw new Error('Invalid published version');
      }
      this.data = data;
    } catch (cause) { this.storage.close(); throw new Error('Workflow storage could not be loaded; original file preserved.', { cause }); }
  }
  close() { this.storage?.close(); }
  list() { return clone(this.data.workflows); }
  get(id: string): GraphDefinition {
    const item = this.data.workflows.find(w => w.id === id);
    if (!item) throw new StudioError(404, 'NOT_FOUND', '工作流不存在。');
    return clone(item);
  }
  revision(ref: { id: string; revision: number }, enabled = false) {
    const item = this.get(ref.id);
    if (enabled && (!item.enabled || item.archivedAt)) throw new StudioError(409, 'DISABLED', '工作流已停用或归档。');
    const revision = item.revisions.find(r => r.revision === ref.revision);
    if (!revision) throw new StudioError(404, 'REVISION_NOT_FOUND', '工作流固定版本不存在。');
    return revision;
  }
  create(body: unknown, actor: string): GraphDefinition {
    object(body, 'workflow', ['slug', 'config', 'copyFrom']); identifier(body.slug, 'slug');
    if (body.copyFrom) { object(body.copyFrom, 'copyFrom', ['id', 'revision']); identifier(body.copyFrom.id, 'copyFrom.id'); number(body.copyFrom.revision, 'copyFrom.revision', 1, 1000000); }
    if (this.data.workflows.some(w => w.slug === body.slug)) throw new StudioError(409, 'DUPLICATE_SLUG', '工作流标识已存在。');
    const graph = graphShape(body.copyFrom ? this.revision(body.copyFrom).config : body.config);
    const item: GraphDefinition = { id: 'workflow-' + randomUUID(), slug: body.slug, origin: 'custom', enabled: true, etag: randomUUID(),
      createdAt: Date.now(), createdBy: actor, draft: graph, revisions: [], ...(body.copyFrom ? { copiedFrom: clone(body.copyFrom) } : {}) };
    const data = clone(this.data); data.workflows.push(item); this.commit(data, item.id, 'create', actor); return clone(item);
  }
  mutate(id: string, etag: string | undefined, action: 'draft' | 'revision' | 'publish' | 'archive', body: unknown, actor: string) {
    const item = this.get(id);
    if (!etag) throw new StudioError(428, 'ETAG_REQUIRED', '请携带 If-Match。');
    if (etag.replace(/^"|"$/g, '') !== item.etag) throw new StudioError(409, 'VERSION_CONFLICT', '工作流已被其他操作修改，本地修改已保留，请重新载入或另存副本。');
    if (item.archivedAt) throw new StudioError(409, 'ARCHIVED', '工作流已归档。');
    if (action === 'draft') item.draft = graphShape(body);
    if (action === 'revision') {
      object(body, 'request', []); this.validate(item.draft);
      item.revisions.push({ revision: item.revisions.length + 1, config: clone(item.draft), hash: hash(item.draft), createdAt: Date.now(), createdBy: actor });
    }
    if (action === 'publish') {
      object(body, 'request', ['revision']); const rev = item.revisions.find(r => r.revision === body.revision);
      if (!rev) throw new StudioError(404, 'REVISION_NOT_FOUND', '请先保存可执行固定版本。');
      this.validate(rev.config); item.publishedRevision = rev.revision;
    }
    if (action === 'archive') { item.archivedAt = Date.now(); item.enabled = false; }
    item.etag = randomUUID(); const data = clone(this.data); data.workflows[data.workflows.findIndex(w => w.id === id)] = item;
    this.commit(data, id, action, actor); return clone(item);
  }
  private commit(data: Data, id: string, action: string, actor: string) {
    data.audit.push({ at: Date.now(), actor, id, action });
    try { this.storage?.save(data); } catch { throw new StudioError(503, 'STORAGE_FAILED', '保存失败，已有工作流未改变。'); }
    this.data = data;
  }
}
