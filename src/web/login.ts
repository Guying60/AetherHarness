/**
 * Login page — standalone two-column shell.
 *
 * Design: `design/20261117-164159` (Figma frame 1248×720).
 *   left  44%  brand / mission / 3-step timeline / loopback footer
 *   right 56%  env pill / 400px auth card / session notices
 *
 * Self-contained on purpose: this design carries its own blue-indigo palette,
 * so the page ships its own stylesheet instead of the console `CONSOLE_STYLE`.
 * The operational contract is unchanged:
 *   - `#login` → POST /api/login {username, token, next}
 *   - `?expired` shows the session notice; `next` is validated server-side
 *   - the page must keep the string "登录工作台" (tests assert it)
 */

const ICON = {
  /** Figma 12:4947 — brand orbit mark */
  brand: '<svg class="ico" viewBox="0 0 22 23" fill="none" aria-hidden="true"><path d="M13.021 10.4791C13.021 11.284 13.4392 11.9374 13.9543 11.9374C14.4694 11.9374 14.8877 11.284 14.8877 10.4791C14.8877 9.67421 14.4694 9.02075 13.9543 9.02075C13.4392 9.02075 13.021 9.67421 13.021 10.4791V10.4791" fill="currentColor"/><path d="M7.021 10.4791C7.021 11.284 7.43921 11.9374 7.95433 11.9374C8.46945 11.9374 8.88766 11.284 8.88766 10.4791C8.88766 9.67421 8.46945 9.02075 7.95433 9.02075C7.43921 9.02075 7.021 9.67421 7.021 10.4791Z" fill="currentColor"/><path d="M18.8127 5.10408C17.3543 2.47908 14.4377 1.02075 11.2293 1.02075C5.571 1.02075 1.021 5.57075 1.021 11.2291C1.021 16.8874 5.571 21.4374 11.2293 21.4374C16.8877 21.4374 20.8543 17.6458 20.8543 12.9791C20.8543 10.3541 20.3877 8.72075 20.271 8.31242" stroke-width="2.04167" stroke-linecap="round" stroke-linejoin="round" stroke="currentColor"/></svg>',
  /** Figma 9:4780 — loopback pin */
  pin: '<svg class="ico" viewBox="0 0 12 13" fill="none" aria-hidden="true"><path d="M0 12.5V8.125H1.875V5.625H5V4.375H3.125V0H8.125V4.375H6.25V5.625H9.375V8.125H11.25V12.5H6.25V8.125H8.125V6.875H3.125V8.125H5V12.5H0V12.5M4.375 3.125H6.875V1.25H4.375V3.125V3.125M1.25 11.25H3.75V9.375H1.25V11.25V11.25M7.5 11.25H10V9.375H7.5V11.25V11.25" fill="currentColor"/></svg>',
  /** Figma 9:4814 — account field */
  user: '<svg class="ico" viewBox="0 0 15 15" fill="none" aria-hidden="true"><path d="M2.8875 11.325C3.525 10.8375 4.2375 10.4531 5.025 10.1719C5.8125 9.89062 6.6375 9.75 7.5 9.75C8.3625 9.75 9.1875 9.89062 9.975 10.1719C10.7625 10.4531 11.475 10.8375 12.1125 11.325C12.55 10.8125 12.8906 10.2312 13.1344 9.58125C13.3781 8.93125 13.5 8.2375 13.5 7.5C13.5 5.8375 12.9156 4.42188 11.7469 3.25312C10.5781 2.08437 9.1625 1.5 7.5 1.5C5.8375 1.5 4.42188 2.08437 3.25312 3.25312C2.08437 4.42188 1.5 5.8375 1.5 7.5C1.5 8.2375 1.62188 8.93125 1.86563 9.58125C2.10938 10.2312 2.45 10.8125 2.8875 11.325V11.325M7.5 8.25C6.7625 8.25 6.14062 7.99687 5.63438 7.49062C5.12813 6.98438 4.875 6.3625 4.875 5.625C4.875 4.8875 5.12813 4.26562 5.63438 3.75938C6.14062 3.25313 6.7625 3 7.5 3C8.2375 3 8.85938 3.25313 9.36563 3.75938C9.87188 4.26562 10.125 4.8875 10.125 5.625C10.125 6.3625 9.87188 6.98438 9.36563 7.49062C8.85938 7.99687 8.2375 8.25 7.5 8.25V8.25M7.5 15C6.4625 15 5.4875 14.8031 4.575 14.4094C3.6625 14.0156 2.86875 13.4812 2.19375 12.8062C1.51875 12.1312 0.984375 11.3375 0.590625 10.425C0.196875 9.5125 0 8.5375 0 7.5C0 6.4625 0.196875 5.4875 0.590625 4.575C0.984375 3.6625 1.51875 2.86875 2.19375 2.19375C2.86875 1.51875 3.6625 0.984375 4.575 0.590625C5.4875 0.196875 6.4625 0 7.5 0C8.5375 0 9.5125 0.196875 10.425 0.590625C11.3375 0.984375 12.1312 1.51875 12.8062 2.19375C13.4812 2.86875 14.0156 3.6625 14.4094 4.575C14.8031 5.4875 15 6.4625 15 7.5C15 8.5375 14.8031 9.5125 14.4094 10.425C14.0156 11.3375 13.4812 12.1312 12.8062 12.8062C12.1312 13.4812 11.3375 14.0156 10.425 14.4094C9.5125 14.8031 8.5375 15 7.5 15V15M7.5 13.5C8.1625 13.5 8.7875 13.4031 9.375 13.2094C9.9625 13.0156 10.5 12.7375 10.9875 12.375C10.5 12.0125 9.9625 11.7344 9.375 11.5406C8.7875 11.3469 8.1625 11.25 7.5 11.25C6.8375 11.25 6.2125 11.3469 5.625 11.5406C5.0375 11.7344 4.5 12.0125 4.0125 12.375C4.5 12.7375 5.0375 13.0156 5.625 13.2094C6.2125 13.4031 6.8375 13.5 7.5 13.5V13.5M7.5 6.75C7.825 6.75 8.09375 6.64375 8.30625 6.43125C8.51875 6.21875 8.625 5.95 8.625 5.625C8.625 5.3 8.51875 5.03125 8.30625 4.81875C8.09375 4.60625 7.825 4.5 7.5 4.5C7.175 4.5 6.90625 4.60625 6.69375 4.81875C6.48125 5.03125 6.375 5.3 6.375 5.625C6.375 5.95 6.48125 6.21875 6.69375 6.43125C6.90625 6.64375 7.175 6.75 7.5 6.75V6.75M7.5 5.625V5.625V5.625V5.625V5.625V5.625V5.625V5.625V5.625V5.625M7.5 12.375V12.375V12.375V12.375V12.375V12.375V12.375V12.375V12.375V12.375" fill="currentColor"/></svg>',
  /** Figma 9:4827 — token field */
  key: '<svg class="ico" viewBox="0 0 18 9" fill="none" aria-hidden="true"><path d="M4.5 6C4.0875 6 3.73438 5.85312 3.44062 5.55937C3.14687 5.26562 3 4.9125 3 4.5C3 4.0875 3.14687 3.73438 3.44062 3.44062C3.73438 3.14687 4.0875 3 4.5 3C4.9125 3 5.26562 3.14687 5.55937 3.44062C5.85312 3.73438 6 4.0875 6 4.5C6 4.9125 5.85312 5.26562 5.55937 5.55937C5.26562 5.85312 4.9125 6 4.5 6V6M4.5 9C3.25 9 2.1875 8.5625 1.3125 7.6875C0.4375 6.8125 0 5.75 0 4.5C0 3.25 0.4375 2.1875 1.3125 1.3125C2.1875 0.4375 3.25 0 4.5 0C5.3375 0 6.09687 0.20625 6.77812 0.61875C7.45937 1.03125 8 1.575 8.4 2.25H15L17.25 4.5L13.875 7.875L12.375 6.75L10.875 7.875L9.28125 6.75H8.4C8 7.425 7.45937 7.96875 6.77812 8.38125C6.09687 8.79375 5.3375 9 4.5 9V9M4.5 7.5C5.2 7.5 5.81563 7.2875 6.34688 6.8625C6.87813 6.4375 7.23125 5.9 7.40625 5.25H9.75L10.8375 6.01875L12.375 4.875L13.7063 5.90625L15.1125 4.5L14.3625 3.75H7.40625C7.23125 3.1 6.87813 2.5625 6.34688 2.1375C5.81563 1.7125 5.2 1.5 4.5 1.5C3.675 1.5 2.96875 1.79375 2.38125 2.38125C1.79375 2.96875 1.5 3.675 1.5 4.5C1.5 5.325 1.79375 6.03125 2.38125 6.61875C2.96875 7.20625 3.675 7.5 4.5 7.5V7.5" fill="currentColor"/></svg>',
  /** Figma 9:4828 — password visibility */
  eye: '<svg class="ico" viewBox="0 0 25 20" fill="none" aria-hidden="true"><path d="M12.25 13C13.1875 13 13.9844 12.6719 14.6406 12.0156C15.2969 11.3594 15.625 10.5625 15.625 9.625C15.625 8.6875 15.2969 7.89062 14.6406 7.23438C13.9844 6.57812 13.1875 6.25 12.25 6.25C11.3125 6.25 10.5156 6.57812 9.85938 7.23438C9.20312 7.89062 8.875 8.6875 8.875 9.625C8.875 10.5625 9.20312 11.3594 9.85938 12.0156C10.5156 12.6719 11.3125 13 12.25 13V13M12.25 11.65C11.6875 11.65 11.2094 11.4531 10.8156 11.0594C10.4219 10.6656 10.225 10.1875 10.225 9.625C10.225 9.0625 10.4219 8.58438 10.8156 8.19063C11.2094 7.79688 11.6875 7.6 12.25 7.6C12.8125 7.6 13.2906 7.79688 13.6844 8.19063C14.0781 8.58438 14.275 9.0625 14.275 9.625C14.275 10.1875 14.0781 10.6656 13.6844 11.0594C13.2906 11.4531 12.8125 11.65 12.25 11.65V11.65M12.25 15.25C10.425 15.25 8.7625 14.7406 7.2625 13.7219C5.7625 12.7031 4.675 11.3375 4 9.625C4.675 7.9125 5.7625 6.54688 7.2625 5.52813C8.7625 4.50938 10.425 4 12.25 4C14.075 4 15.7375 4.50938 17.2375 5.52813C18.7375 6.54688 19.825 7.9125 20.5 9.625C19.825 11.3375 18.7375 12.7031 17.2375 13.7219C15.7375 14.7406 14.075 15.25 12.25 15.25V15.25M12.25 13.75C13.6625 13.75 14.9594 13.3781 16.1406 12.6344C17.3219 11.8906 18.225 10.8875 18.85 9.625C18.225 8.3625 17.3219 7.35938 16.1406 6.61562C14.9594 5.87187 13.6625 5.5 12.25 5.5C10.8375 5.5 9.54063 5.87187 8.35938 6.61562C7.17812 7.35938 6.275 8.3625 5.65 9.625C6.275 10.8875 7.17812 11.8906 8.35938 12.6344C9.54063 13.3781 10.8375 13.75 12.25 13.75V13.75" fill="currentColor"/></svg>',
  /** Figma 9:4835 — submit arrow */
  arrow: '<svg class="ico" viewBox="0 0 11 11" fill="none" aria-hidden="true"><path d="M8.11667 6H0V4.66667H8.11667L4.38333 0.933333L5.33333 0L10.6667 5.33333L5.33333 10.6667L4.38333 9.73333L8.11667 6V6" fill="currentColor"/></svg>'
} as const;

/** Three-step narrative from the design (content, not behaviour). */
const STEPS = [
  { id: '01', title: 'Scenario & Team', tag: 'DISPATCH', desc: '选择场景与团队。预设 RL 自强化评估案例，或实时加载声明式自定义多智能体 DAG 流。' },
  { id: '02', title: 'Telemetry & Healing', tag: 'ACTIVE', desc: '观察调度与自愈。感知动态节点负载与网络延迟，驱动 PDCA 实时自愈及上下文重放。' },
  { id: '03', title: 'Verification', tag: 'GATEWAY', desc: '验收与交付。实施三层规则契约审计，自动化生成补丁包与工程级交付物归档。' }
];

/** Keep in sync with package.json — displayed as the engine build label. */
const ENGINE_VERSION = 'V2.2.0';

export function loginPage(port: string | number): string {
  const steps = STEPS.map(step =>
    `<li class="step${step.id === '02' ? ' current' : ''}">
      <span class="step-no">${step.id}</span>
      <div class="step-card">
        <div class="step-head"><strong>${step.title}</strong><span class="tag">${step.tag}</span></div>
        <p>${step.desc}</p>
      </div>
    </li>`).join('');

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>登录 · AetherHarness</title>
<style>
  :root {
    color-scheme: light;
    --ink: #0b1c30;
    --body: #464554;
    --deep: #2a14b4;
    --blue: #0058be;
    --field: #eff4ff;
    --chip: #dce9ff;
    --primary: #4338ca;
    --ok: #10b981;
    --ok-ink: #047857;
    --panel: #f8f9ff;
    --font: "Inter", "PingFang SC", "Microsoft YaHei", system-ui, -apple-system, "Segoe UI", sans-serif;
    font: 13px/1.5 var(--font);
    color: var(--ink);
  }
  *, *::before, *::after { box-sizing: border-box; }
  body { margin: 0; display: grid; grid-template-columns: 44fr 56fr; min-height: 100vh; background: var(--panel); }
  h1, h2, p, ol { margin: 0; }
  .ico { display: block; width: 1em; height: 1em; }
  button, input { font: inherit; color: inherit; }
  :focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }

  /* ---------------------------------------------------------- brand column */
  .brand-col {
    position: relative; isolation: isolate;
    display: flex; flex-direction: column; gap: 24px;
    padding: 40px; background: #eff4ff;
  }
  .brand-col::before {
    content: ''; position: absolute; inset: 0; z-index: -1;
    background:
      radial-gradient(120% 80% at 12% 0%, #d3e4fe 0%, transparent 60%),
      radial-gradient(90% 70% at 90% 100%, #d3e4fe 0%, transparent 55%);
    opacity: .4;
  }
  .brand-head { display: flex; align-items: center; gap: 24px; flex-wrap: wrap; }
  .brand { display: flex; align-items: center; gap: 12px; }
  .brand-mark { display: inline-flex; color: var(--primary); font-size: 22px; }
  .brand-mark .ico { width: 22px; height: 23px; }
  .brand-name { display: block; color: var(--ink); font-size: 18px; font-weight: 600; line-height: 24px; letter-spacing: -.45px; }
  .brand-sub { display: block; color: var(--body); font-size: 10px; font-weight: 500; line-height: 12px; letter-spacing: .5px; }
  .daemon {
    display: inline-flex; align-items: center; gap: 6px; margin-left: auto; padding: 4px 8px;
    background: #fff; border-radius: 12px; box-shadow: 0 1px 2px rgba(11, 28, 48, .08);
    color: var(--ok-ink); font-size: 10px; font-weight: 600; letter-spacing: .25px;
  }
  .daemon i { width: 8px; height: 8px; border-radius: 12px; background: var(--ok); }

  .slogan { display: grid; gap: 6px; margin-top: 40px; }
  .eyebrow { color: var(--deep); font-size: 10px; font-weight: 600; letter-spacing: 1px; line-height: 12px; }
  .slogan h1 { color: var(--ink); font-size: 24px; font-weight: 700; line-height: 32px; letter-spacing: -.6px; }
  .slogan .lede { max-width: 34em; color: var(--body); font-size: 13px; line-height: 21px; }

  .steps { position: relative; display: grid; gap: 16px; margin-top: 34px; padding: 4px 0 0; list-style: none; }
  .steps::before { content: ''; position: absolute; top: 20px; left: 15px; width: 2px; height: calc(100% - 40px); background: var(--chip); }
  .step { position: relative; display: flex; align-items: flex-start; gap: 14px; }
  .step-no {
    display: grid; place-items: center; flex: 0 0 32px; height: 32px; border-radius: 12px;
    background: #fff; box-shadow: 0 1px 2px rgba(11, 28, 48, .08);
    color: var(--deep); font-size: 12px; font-weight: 600;
  }
  .step.current .step-no { background: var(--primary); color: #fff; }
  .step-card {
    flex: 1 1 auto; min-width: 0; padding: 12px; border-radius: 4px;
    background: rgba(255, 255, 255, .8); box-shadow: 0 1px 2px rgba(11, 28, 48, .06);
  }
  .step.current .step-card { background: #fff; }
  .step-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .step-head strong { color: var(--ink); font-size: 15px; font-weight: 600; letter-spacing: -.08px; line-height: 20px; }
  .step-card p { margin-top: 3px; color: var(--body); font-size: 13px; line-height: 18px; }
  .tag {
    flex: 0 0 auto; padding: 2px 6px; border-radius: 2px;
    background: #e5eeff; color: var(--blue); font-size: 10px; font-weight: 500; letter-spacing: .4px;
  }
  .step.current .tag { background: #e3dfff; color: #100069; font-weight: 600; }

  .brand-foot {
    display: flex; align-items: center; justify-content: space-between; gap: 16px;
    margin-top: auto; padding: 12px; border-radius: 4px;
    background: rgba(255, 255, 255, .6); color: var(--body); font-size: 11px; font-weight: 500;
  }
  .brand-foot .where { display: inline-flex; align-items: center; gap: 6px; }
  .brand-foot .pin { display: inline-flex; color: var(--deep); font-size: 13px; }
  .brand-foot strong { color: var(--deep); font-size: 12px; font-weight: 500; letter-spacing: -.3px; }

  /* ----------------------------------------------------------- auth column */
  .auth-col { display: flex; flex-direction: column; padding: 40px; background: var(--panel); }
  .env-row { display: flex; justify-content: flex-end; }
  .env {
    display: inline-flex; align-items: center; gap: 8px; padding: 4px 10px;
    border-radius: 12px; background: var(--chip); color: var(--ink);
    font-size: 10px; font-weight: 500; letter-spacing: .5px;
  }
  .env i { width: 6px; height: 6px; border-radius: 12px; background: var(--blue); }

  .auth-slot { flex: 1 1 auto; display: grid; place-items: center; padding: 42px 0; }
  .card {
    width: min(400px, 100%); padding: 28px; border-radius: 8px; background: #fff;
    box-shadow: 0 1px 2px rgba(11, 28, 48, .06), 0 10px 30px rgba(11, 28, 48, .06);
  }
  .card h2 { color: var(--ink); font-size: 15px; font-weight: 700; line-height: 20px; letter-spacing: -.08px; }
  .card .sub { margin-top: 4px; color: var(--body); font-size: 13px; line-height: 18px; }
  form { display: grid; gap: 16px; margin-top: 18px; }
  .field { display: grid; gap: 6px; }
  .field-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .field-head label { color: var(--ink); font-size: 15px; font-weight: 500; letter-spacing: -.08px; }
  .chip { padding: 2px 6px; border-radius: 2px; background: var(--field); color: var(--body); font-size: 10px; font-weight: 500; letter-spacing: .4px; }
  .control { position: relative; display: flex; align-items: center; padding: 2px; border-radius: 4px; background: var(--field); }
  .control .ico-slot { position: absolute; left: 12px; display: inline-flex; color: var(--body); font-size: 15px; pointer-events: none; }
  .control input {
    width: 100%; min-height: 34px; padding: 8px 12px 8px 32px;
    border: 0; border-radius: 4px; background: transparent; color: var(--ink); font-size: 13px;
  }
  .control input::placeholder { color: #8c93a8; }
  .control.key .ico-slot { font-size: 18px; }
  .control.key input { padding-right: 36px; font-family: ui-monospace, Consolas, monospace; font-size: 12px; }
  .reveal {
    position: absolute; right: 8px; display: inline-grid; place-items: center;
    width: 25px; height: 19px; padding: 0; border: 0; border-radius: 2px; background: transparent;
    color: var(--body); font-size: 11px;
  }
  .reveal .ico { width: 17px; height: 11px; }
  .hint { color: #6b7488; font-size: 11px; line-height: 14px; }
  .submit {
    display: flex; align-items: center; justify-content: center; gap: 8px;
    width: 100%; margin-top: 8px; min-height: 38px; padding: 10px 16px;
    border: 0; border-radius: 4px; background: var(--primary); color: #fff;
    font-size: 13px; font-weight: 600; box-shadow: 0 1px 2px rgba(67, 56, 202, .25);
  }
  .submit:hover:not(:disabled) { background: #4f46e5; }
  .submit:disabled { cursor: wait; opacity: .7; }
  .submit .ico { width: 11px; height: 11px; }
  .error { margin-top: 12px; padding: 8px 10px; border-radius: 4px; background: #fdeaea; color: #9b1c1c; font-size: 12px; }
  .error:empty { display: none; }
  .meta { margin-top: 20px; padding: 11px 12px 12px; border-radius: 4px; background: rgba(239, 244, 255, .7); }
  .meta p { color: var(--body); font-size: 11px; font-weight: 500; line-height: 14px; }
  .meta-claims { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 8px; }
  .claim { display: inline-flex; align-items: center; gap: 4px; color: var(--body); font-size: 10px; font-weight: 500; letter-spacing: .4px; }
  .claim i { width: 6px; height: 6px; border-radius: 12px; background: #059669; }
  .foot-note { margin-top: 24px; color: rgba(70, 69, 84, .8); font-size: 11px; font-weight: 500; text-align: center; }

  /* ---------------------------------------------------------------- narrow */
  @media (max-width: 1080px) {
    body { grid-template-columns: minmax(0, 1fr); }
    .brand-col { padding: 24px; gap: 12px; }
    .steps, .slogan, .brand-foot { display: none; }
    .auth-col { padding: 24px; }
    .auth-slot { padding: 24px 0; align-items: start; }
  }
  @media (max-width: 520px) {
    .brand-col, .auth-col { padding: 16px; }
    .card { padding: 20px; }
    .foot-note { text-align: left; }
  }
</style>
</head>
<body>
  <section class="brand-col" aria-label="AetherHarness 平台简介">
    <div class="brand-head">
      <div class="brand">
        <span class="brand-mark">${ICON.brand}</span>
        <span><span class="brand-name">AetherHarness</span><span class="brand-sub">CORE ENGINE · ${ENGINE_VERSION}</span></span>
      </div>
      <span class="daemon"><i aria-hidden="true"></i>DAEMON RUNNING</span>
    </div>

    <div class="slogan">
      <p class="eyebrow">MISSION CRITICAL ORCHESTRATION</p>
      <h1>多 Agent 编排 · 声明式 DAG · 三层验收</h1>
      <p class="lede">面向高并发自愈循环的自主工作流基座，内嵌确定性沙盒与零信任状态审计。</p>
    </div>

    <ol class="steps">${steps}</ol>

    <div class="brand-foot">
      <span class="where"><span class="pin">${ICON.pin}</span>本机控制台 · 仅限 loopback 访问</span>
      <strong>127.0.0.1</strong>
    </div>
  </section>

  <section class="auth-col">
    <div class="env-row"><span class="env"><i aria-hidden="true"></i>ENV: LOCAL_SECURE · PORT: ${port}</span></div>

    <div class="auth-slot">
      <div class="card">
        <h2 id="title">登录工作台</h2>
        <p class="sub">使用账号与访问令牌进入本机控制台</p>

        <form id="login" action="/api/login" method="post">
          <div class="field">
            <div class="field-head"><label for="username">账号</label><span class="chip">本地凭据</span></div>
            <div class="control">
              <span class="ico-slot">${ICON.user}</span>
              <input id="username" name="username" autocomplete="username" autocapitalize="none" spellcheck="false"
                maxlength="40" placeholder="operator" required>
            </div>
            <p class="hint">使用启动终端打印的临时账号，或 AETHER_ACCOUNTS_FILE 中配置的账号。</p>
          </div>

          <div class="field">
            <div class="field-head"><label for="token">访问令牌</label><span class="chip">64 位十六进制</span></div>
            <div class="control key">
              <span class="ico-slot">${ICON.key}</span>
              <input id="token" name="token" type="password" autocomplete="current-password" autocapitalize="none"
                spellcheck="false" maxlength="64" placeholder="启动终端中显示的访问令牌" required>
              <button id="toggle" type="button" class="reveal" aria-label="显示访问令牌" aria-controls="token" aria-pressed="false">${ICON.eye}</button>
            </div>
          </div>

          <button id="submit" class="submit" type="submit"><span id="submit-label">进入控制台</span>${ICON.arrow}</button>
        </form>

        <p id="login-error" class="error" role="alert"></p>

        <div class="meta">
          <p>会话有效期 8 小时 · Cookie 绑定端口 · 采用本地安全密钥</p>
          <div class="meta-claims">
            <span class="claim"><i aria-hidden="true"></i>TLS Loopback</span>
            <span class="claim"><i aria-hidden="true"></i>Zero-Telemetry Leak</span>
          </div>
        </div>
      </div>
    </div>

    <p class="foot-note">响应式就绪：窄屏自适应堆叠，主工作流切换为单列布局</p>
  </section>

  <script>
    (function () {
      var form = document.getElementById('login');
      var token = document.getElementById('token');
      var toggle = document.getElementById('toggle');
      var submit = document.getElementById('submit');
      var label = document.getElementById('submit-label');
      var error = document.getElementById('login-error');
      var query = new URLSearchParams(location.search);
      if (query.has('expired')) error.textContent = '登录已过期，请重新登录。';

      toggle.addEventListener('click', function () {
        var showing = token.type === 'password';
        token.type = showing ? 'text' : 'password';
        toggle.setAttribute('aria-pressed', String(showing));
        toggle.setAttribute('aria-label', showing ? '隐藏访问令牌' : '显示访问令牌');
      });

      form.addEventListener('submit', async function (event) {
        event.preventDefault();
        if (submit.disabled) return;
        error.textContent = '';
        submit.disabled = true;
        label.textContent = '正在登录…';
        try {
          var response = await fetch(form.action, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              username: form.elements.username.value.trim(),
              token: token.value.trim(),
              next: query.get('next')
            })
          });
          if (response.ok) {
            location.replace((await response.json()).next);
            return;
          }
          error.textContent = response.status === 401 ? '账号或访问令牌不正确。' : '登录失败，请重试。';
          token.focus();
          token.select();
        } catch (_) {
          error.textContent = '无法连接本机控制台，请稍后重试。';
        } finally {
          submit.disabled = false;
          label.textContent = '进入控制台';
        }
      });
    })();
  </script>
</body>
</html>`;
}
