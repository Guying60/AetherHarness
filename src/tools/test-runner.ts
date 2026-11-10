import vm from 'node:vm';

export interface TestInput {
  testCode: string;
  sourceCode: string;
  bindings?: string[];
  timeoutMs: number;
}

const ASSERTIONS = `
let passed = 0, failed = 0;
const errors = [];
function assert(condition, message) {
  if (condition) passed++;
  else { failed++; errors.push(String(message || 'assertion failed')); }
}
function assertEqual(actual, expected, message) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  assert(a === b, a === b ? message : (message || 'assertion failed') + ' (expected ' + b + ', got ' + a + ')');
}
function assertClose(actual, expected, tolerance, message) {
  const close = typeof actual === 'number' && Math.abs(actual - expected) <= tolerance;
  assert(close, close ? message : (message || 'assertion failed') + ' (expected ~' + expected + ', got ' + actual + ')');
}
function assertThrows(fn, ctorName, message) {
  try {
    fn();
  } catch (error) {
    const name = error?.constructor?.name || '';
    assert(!ctorName || name === ctorName, (message || 'assertion failed') + ' (expected ' + ctorName + ', got ' + name + ')');
    return;
  }
  assert(false, (message || 'assertion failed') + ' (expected ' + ctorName + ', nothing was thrown)');
}
`;

const createRealm = () => vm.createContext(Object.create(null), {
  codeGeneration: { strings: false, wasm: false },
  microtaskMode: 'afterEvaluate'
});

export function runTests({ testCode, sourceCode, bindings, timeoutMs }: TestInput) {
  const deadline = Date.now() + timeoutMs;
  const evaluate = (source: string, context: vm.Context, filename: string) =>
    new vm.Script(source, { filename }).runInContext(context, { timeout: Math.max(1, deadline - Date.now()) });

  try {
    const candidate = createRealm();
    evaluate(sourceCode, candidate, 'candidate.js');

    // shortcut: legacy scripts share a realm, declare bindings on suites that accept generated code.
    const tests = bindings === undefined ? candidate : createRealm();
    for (const name of bindings ?? []) {
      if (typeof name !== 'string' || !/^[A-Za-z_$][\w$]*$/.test(name)) throw new Error('invalid test binding');
      tests[name] = evaluate(name, candidate, 'candidate-binding.js');
    }

    const report = evaluate(`(() => {
      "use strict";
      ${ASSERTIONS}
      try {
        (() => {
          ${testCode}
        })();
      } catch (error) {
        assert(false, (error?.constructor?.name || 'Error') + ': ' + (error?.message || String(error)));
      }
      return { passed, failed, errors, total: passed + failed };
    })()`, tests, 'acceptance-tests.js');
    return { success: report.failed === 0 && report.total > 0, report };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, report: { passed: 0, failed: 1, errors: [message], total: 1 } };
  }
}

if (process.send) {
  process.once('message', (input: TestInput) => {
    process.send?.(runTests(input), () => process.disconnect?.());
  });
}
