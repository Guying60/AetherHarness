import { createHash, randomUUID } from 'node:crypto';
import type { AgentRole } from '../types/index.js';

export class StudioError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

export type RevisionRef = { id: string; revision: number };
export type ModelRef = { id: string; revision: string };
export interface ValueSchema {
  type: 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null';
  properties?: Record<string, ValueSchema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: ValueSchema;
  enum?: Array<string | number | boolean | null>;
}
export interface AgentConfig {
  name: string;
  role: AgentRole;
  roleLabel: string;
  description: string;
  systemPrompt: string;
  constraints: string[];
  behavior: 'configured' | 'template';
  modelConfigRef: ModelRef;
  temperature: number;
  capabilities: Record<string, number>;
  toolIds: string[];
  memoryPolicy: { mode: 'none' | 'run-window'; maxMessages: number };
  limits: { maxTurns: number; timeoutMs: number; maxTokens: number; maxConcurrency: number };
  inputSchema: ValueSchema;
  outputSchema: ValueSchema;
}
export interface TeamConfig {
  name: string;
  description: string;
  members: Array<{ memberId: string; agentRef: RevisionRef; responsibility: string; eligibleCapabilities: string[] }>;
  coordinatorMemberId?: string;
  routing: 'sequence' | 'capability';
  handoffs: Array<{ from: string; to: string }>;
  toolIds: string[];
}
export interface Revision<T> { revision: number; config: T; hash: string; createdAt: number; createdBy: string }
export interface Definition<T> {
  id: string;
  slug: string;
  origin: 'system' | 'custom';
  enabled: boolean;
  archivedAt?: number;
  createdAt: number;
  createdBy: string;
  etag: string;
  draft: T;
  revisions: Revision<T>[];
  copiedFrom?: RevisionRef;
}
export type AgentDefinition = Definition<AgentConfig>;
export type TeamDefinition = Definition<TeamConfig>;
export interface StudioSnapshot {
  schemaVersion: 1;
  compilerVersion: 'team-v1' | 'graph-v1';
  kind: 'agent-test' | 'team' | 'workflow' | 'node-test';
  workflow?: { id: string; revision: number; hash: string; graph: import('./graph.js').Graph };
  dependencies?: Array<{ ref: RevisionRef; graph: import('./graph.js').Graph }>;
  testNodeId?: string;
  verificationProfileHash?: string;
  team?: { id: string; revision: number; hash: string; config: TeamConfig };
  agents: Array<{ memberId: string; id: string; revision: number; hash: string; config: AgentConfig }>;
  executionHash: string;
  model: { ref: ModelRef; label: string; ready: boolean };
}
export const roles: AgentRole[] = ['orchestrator', 'requirement_analyst', 'architect', 'developer', 'code_reviewer', 'security_auditor', 'qa_verifier', 'critic'];
const templateRoles = new Set(['requirement_analyst', 'architect', 'developer', 'code_reviewer', 'security_auditor', 'critic']);
const reserved = new Set(['__proto__', 'prototype', 'constructor']);
export const clone = <T>(value: T): T => structuredClone(value);
export function hash(value: unknown): string {
  const stable = (v: any): any => Array.isArray(v) ? v.map(stable) : v && typeof v === 'object'
    ? Object.fromEntries(Object.keys(v).sort().map(k => [k, stable(v[k])])) : v;
  return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}
export function fail(message: string): never { throw new StudioError(422, 'INVALID_CONFIG', message); }
export function object(value: unknown, path: string, keys?: string[]): asserts value is Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${path} 必须是对象。`);
  for (const key of Object.keys(value)) if (reserved.has(key) || (keys && !keys.includes(key))) fail(`${path}.${key} 不受支持。`);
}
export function text(value: unknown, path: string, max = 2000, empty = false): asserts value is string {
  if (typeof value !== 'string' || (!empty && !value.trim()) || value.length > max) fail(`${path} 需要 ${empty ? '0' : '1'}–${max} 字符。`);
}
export function identifier(value: unknown, path: string): asserts value is string {
  if (typeof value !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(value) || reserved.has(value)) fail(`${path} 需要以字母开头的标识（最多 64 字符）。`);
}
export function number(value: unknown, path: string, min: number, max: number, integer = true): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) fail(`${path} 必须在 ${min}–${max} 范围内${integer ? '且为整数' : ''}。`);
}
function strings(value: unknown, path: string, max = 32): asserts value is string[] {
  if (!Array.isArray(value) || value.length > max || new Set(value).size !== value.length) fail(`${path} 必须是至多 ${max} 项的不重复列表。`);
  value.forEach((v, i) => text(v, `${path}[${i}]`, 1000));
}
export function validateSchema(schema: unknown, path = 'schema', depth = 0): asserts schema is ValueSchema {
  if (depth > 8) fail(`${path} 嵌套过深。`);
  object(schema, path, ['type', 'properties', 'required', 'additionalProperties', 'items', 'enum']);
  if (!['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'].includes(schema.type)) fail(`${path}.type 不受支持。`);
  if (schema.properties !== undefined) {
    if (schema.type !== 'object') fail(`${path}.properties 仅适用于 object。`);
    object(schema.properties, `${path}.properties`);
    if (Object.keys(schema.properties).length > 64) fail(`${path} 字段过多。`);
    for (const [k, v] of Object.entries(schema.properties)) validateSchema(v, `${path}.${k}`, depth + 1);
  }
  if (schema.required !== undefined) {
    strings(schema.required, `${path}.required`, 64);
    if (schema.type !== 'object' || schema.required.some((k: string) => !Object.hasOwn(schema.properties ?? {}, k))) fail(`${path}.required 引用了未声明字段。`);
  }
  if (schema.additionalProperties !== undefined && (schema.type !== 'object' || typeof schema.additionalProperties !== 'boolean')) fail(`${path}.additionalProperties 无效。`);
  if (schema.items !== undefined) {
    if (schema.type !== 'array') fail(`${path}.items 仅适用于 array。`);
    validateSchema(schema.items, `${path}.items`, depth + 1);
  }
  if (schema.type === 'array' && !schema.items) fail(`${path}.items 为必填。`);
  if (schema.enum !== undefined && (!Array.isArray(schema.enum) || !schema.enum.length || schema.enum.length > 32 ||
    schema.enum.some((v: unknown) => v !== null && !['string', 'number', 'boolean'].includes(typeof v)))) fail(`${path}.enum 必须是有限的标量列表。`);
}
export function validateValue(value: unknown, schema: ValueSchema, path = 'input', depth = 0): void {
  if (depth > 16) fail(`${path} 嵌套过深。`);
  const actual = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  if (schema.type === 'integer' ? !Number.isSafeInteger(value) : actual !== schema.type) fail(`${path} 应为 ${schema.type}。`);
  if (typeof value === 'number' && !Number.isFinite(value)) fail(`${path} 必须是有限数值。`);
  if (schema.enum && !schema.enum.some(v => v === value)) fail(`${path} 不属于允许的值。`);
  if (schema.type === 'object') {
    object(value, path);
    for (const key of schema.required ?? []) if (!Object.hasOwn(value, key)) fail(`${path}.${key} 为必填。`);
    for (const [key, item] of Object.entries(value)) {
      const property = schema.properties?.[key];
      if (property) validateValue(item, property, `${path}.${key}`, depth + 1);
      else if (schema.additionalProperties === false) fail(`${path}.${key} 未声明。`);
    }
  }
  if (schema.type === 'array') {
    if ((value as unknown[]).length > 1000) fail(`${path} 项目过多。`);
    (value as unknown[]).forEach((v, i) => validateValue(v, schema.items!, `${path}[${i}]`, depth + 1));
  }
}
export function validateAgent(value: unknown, toolIds: string[]): AgentConfig {
  object(value, 'agent', ['name', 'role', 'roleLabel', 'description', 'systemPrompt', 'constraints', 'behavior', 'modelConfigRef', 'temperature', 'capabilities', 'toolIds', 'memoryPolicy', 'limits', 'inputSchema', 'outputSchema']);
  text(value.name, 'name', 80); text(value.roleLabel, 'roleLabel', 80); text(value.description, 'description', 2000, true);
  text(value.systemPrompt, 'systemPrompt', 16000); strings(value.constraints, 'constraints');
  if (!roles.includes(value.role)) fail('role 不受支持。');
  if (!['configured', 'template'].includes(value.behavior) || (value.behavior === 'template' && !templateRoles.has(value.role))) fail('该角色没有可继承的模板行为。');
  object(value.modelConfigRef, 'modelConfigRef', ['id', 'revision']); identifier(value.modelConfigRef.id, 'modelConfigRef.id'); text(value.modelConfigRef.revision, 'modelConfigRef.revision', 80);
  number(value.temperature, 'temperature', 0, 2, false);
  object(value.capabilities, 'capabilities');
  if (Object.keys(value.capabilities).length > 32) fail('能力标签过多。');
  for (const [key, score] of Object.entries(value.capabilities)) { identifier(key, 'capability'); number(score, `capabilities.${key}`, 0, 1, false); }
  strings(value.toolIds, 'toolIds');
  if (value.toolIds.some((id: string) => !toolIds.includes(id))) fail('工具未在服务端注册。');
  object(value.memoryPolicy, 'memoryPolicy', ['mode', 'maxMessages']);
  if (!['none', 'run-window'].includes(value.memoryPolicy.mode)) fail('记忆只支持 none 或 run-window。');
  number(value.memoryPolicy.maxMessages, 'memoryPolicy.maxMessages', 0, 50);
  object(value.limits, 'limits', ['maxTurns', 'timeoutMs', 'maxTokens', 'maxConcurrency']);
  number(value.limits.maxTurns, 'limits.maxTurns', 1, 12); number(value.limits.timeoutMs, 'limits.timeoutMs', 100, 120000);
  number(value.limits.maxTokens, 'limits.maxTokens', 16, 8192); number(value.limits.maxConcurrency, 'limits.maxConcurrency', 1, 8);
  validateSchema(value.inputSchema, 'inputSchema'); validateSchema(value.outputSchema, 'outputSchema');
  if (value.inputSchema.type !== 'object') fail('Agent 输入必须是 object。');
  return clone(value as AgentConfig);
}
export function validateTeam(value: unknown, resolveAgent: (ref: RevisionRef) => AgentConfig, toolIds: string[]): TeamConfig {
  object(value, 'team', ['name', 'description', 'members', 'coordinatorMemberId', 'routing', 'handoffs', 'toolIds']);
  text(value.name, 'name', 80); text(value.description, 'description', 2000, true);
  if (!Array.isArray(value.members) || !value.members.length || value.members.length > 16) fail('团队需要 1–16 位成员。');
  const memberIds = new Set<string>();
  for (const member of value.members) {
    object(member, 'member', ['memberId', 'agentRef', 'responsibility', 'eligibleCapabilities']);
    identifier(member.memberId, 'memberId');
    if (memberIds.has(member.memberId)) fail('memberId 重复。');
    memberIds.add(member.memberId);
    object(member.agentRef, 'agentRef', ['id', 'revision']); identifier(member.agentRef.id, 'agentRef.id'); number(member.agentRef.revision, 'agentRef.revision', 1, 1000000);
    text(member.responsibility, 'responsibility', 2000); strings(member.eligibleCapabilities, 'eligibleCapabilities');
    const agent = resolveAgent({ id: member.agentRef.id, revision: member.agentRef.revision });
    if (member.eligibleCapabilities.some((cap: string) => (agent.capabilities[cap] ?? 0) < 0.5)) fail(`成员 ${member.memberId} 缺少指定能力。`);
  }
  if (value.coordinatorMemberId !== undefined && !memberIds.has(value.coordinatorMemberId)) fail('协调成员必须属于团队。');
  if (!['sequence', 'capability'].includes(value.routing)) fail('routing 只支持 sequence 或 capability。');
  if (!Array.isArray(value.handoffs) || value.handoffs.length > 64) fail('handoffs 无效。');
  const edges = new Set<string>();
  for (const edge of value.handoffs) {
    object(edge, 'handoff', ['from', 'to']);
    if (!memberIds.has(edge.from) || !memberIds.has(edge.to) || edge.from === edge.to || edges.has(`${edge.from}/${edge.to}`)) fail('交接引用无效或重复。');
    edges.add(`${edge.from}/${edge.to}`);
  }
  if (value.routing === 'sequence') {
    const expected = value.members.slice(1).map((m: TeamConfig['members'][number], i: number) => `${value.members[i].memberId}/${m.memberId}`);
    if (expected.length !== edges.size || expected.some((edge: string) => !edges.has(edge))) fail('顺序团队的交接必须与成员顺序一致；条件反馈和循环需使用后续工作流编排器。');
  } else if (edges.size) fail('能力分配每次选择一名成员，不支持同时设置顺序交接。');
  strings(value.toolIds, 'toolIds');
  if (value.toolIds.some((id: string) => !toolIds.includes(id))) fail('团队工具未注册。');
  return clone(value as TeamConfig);
}
export function definition<T>(slug: string, config: T, actor: string, origin: 'system' | 'custom' = 'custom', id = `custom-${randomUUID()}`): Definition<T> {
  identifier(slug, 'slug');
  const now = Date.now();
  return { id, slug, origin, enabled: true, createdAt: now, createdBy: actor, etag: randomUUID(), draft: clone(config),
    revisions: [{ revision: 1, config: clone(config), hash: hash(config), createdAt: now, createdBy: actor }] };
}
