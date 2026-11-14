import { AsyncLocalStorage } from 'node:async_hooks';
export interface ExecutionContext {
  nodePath?: string; iteration?: number; attemptId?: string; memberId?: string;
  emit?: (kind: string, data: Record<string, any>) => void;
}
export const executionContext = new AsyncLocalStorage<ExecutionContext>();
export function trace(kind: string, data: Record<string, any>) {
  const context = executionContext.getStore();
  context?.emit?.(kind, { ...data, nodePath: context.nodePath, iteration: context.iteration, attemptId: context.attemptId, memberId: context.memberId });
}
