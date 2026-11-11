export const LOGIN_HTML = /* html */ `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>登录 · AetherHarness</title>
  <style>
    :root { color-scheme: light; font: 15px/1.6 "Segoe UI", "Microsoft YaHei", "PingFang SC", system-ui, sans-serif; color: #172922; background: #f8faf8; }
    * { box-sizing: border-box; }
    body { margin: 0; }
    h1, h2, p { margin: 0; }
    button, input { font: inherit; }
    button { cursor: pointer; }
    .layout { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); min-height: 100vh; }
    .brand { display: inline-flex; align-items: center; gap: 12px; font-size: 19px; font-weight: 750; letter-spacing: -.025em; }
    .mark { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 10px; background: #176348; color: #e4f7eb; }
    .workspace { display: grid; grid-template-rows: auto 1fr; gap: 36px; padding: clamp(30px, 5vw, 76px); color: #edfaf0;
      background: radial-gradient(ellipse at 85% 73%, #235941, transparent 58%), linear-gradient(155deg, #153a2e, #0c281f 72%); }
    .workspace .mark { background: #c0ebce; color: #143a2e; }
    .intro { align-self: center; padding-bottom: 40px; }
    .intro h2 { font-size: clamp(31px, 4.4vw, 60px); font-weight: 750; letter-spacing: -.06em; line-height: 1.13; }
    .workflow { display: grid; gap: 12px; margin: 32px 0 0; padding: 0; max-width: 438px; list-style: none; }
    .step { display: grid; grid-template-columns: 36px 1fr auto; align-items: center; gap: 14px; padding: 13px 15px;
      border: 1px solid #608a72; border-radius: 12px; background: #153a2e; color: #ecfaf0; }
    .step:nth-child(2) { margin-left: 22px; }
    .step:nth-child(3) { margin-left: 44px; }
    .step-id { display: grid; place-items: center; width: 35px; height: 35px; border-radius: 8px; background: #28523f; color: #c3e7cb; font: 13px "Segoe UI", sans-serif; }
    .step-detail { color: #bddeca; font-size: 12px; }
    .signin { display: grid; place-items: center; padding: 44px clamp(26px, 5vw, 84px); }
    .signin-inner { width: min(100%, 396px); }
    .signin .brand { display: none; }
    h1 { color: #132c21; font-size: clamp(32px, 4vw, 44px); line-height: 1.16; letter-spacing: -.06em; }
    .description { color: #4a6257; margin-top: 12px; }
    form { display: grid; gap: 17px; margin-top: 32px; }
    .field { display: grid; gap: 6px; }
    label { font-weight: 650; }
    input { width: 100%; min-height: 49px; padding: 9px 12px; border: 1px solid #bfcfc5; border-radius: 9px; background: #fff; color: #172922; }
    input:focus { border-color: #238060; outline: 2px solid #b4deca; }
    .token-field { position: relative; }
    .token-field input { padding-right: 68px; }
    .toggle { position: absolute; inset: 6px 6px 6px auto; padding: 0 10px; border: 0; border-radius: 5px; color: #205b44; background: #edf5ef; font-size: 13px; font-weight: 650; }
    .submit { min-height: 50px; border: 1px solid #145e44; border-radius: 9px; background: #176348; color: #fff; font-weight: 700; }
    .submit:hover:not(:disabled) { background: #114d38; }
    .submit:disabled { cursor: wait; opacity: .65; }
    button:focus-visible { outline: 2px solid #318363; outline-offset: 3px; }
    .error { padding: 9px 12px; border-radius: 8px; background: #ffe8e4; color: #862b22; font-size: 14px; }
    .error:empty { display: none; }
    .help { margin-top: 25px; padding-top: 19px; border-top: 1px solid #dbe6dd; color: #4a6257; font-size: 13px; }
    @media (max-width: 780px) {
      .layout { grid-template-columns: 1fr; }
      .workspace { display: none; }
      .signin .brand { display: inline-flex; margin-bottom: 38px; }
    }
    @media (max-width: 780px) and (max-height: 650px) { .signin { align-items: start; } }
  </style>
</head>
<body>
  <main class="layout">
    <aside class="workspace" aria-label="AetherHarness 工作流">
      <div class="brand"><span class="mark" aria-hidden="true">◈</span>AetherHarness</div>
      <div class="intro">
        <h2>多 Agent 协作工作台</h2>
        <ol class="workflow">
          <li class="step"><span class="step-id" aria-hidden="true">01</span><strong>需求与规划</strong><span class="step-detail">任务定义</span></li>
          <li class="step"><span class="step-id" aria-hidden="true">02</span><strong>协作执行</strong><span class="step-detail">并行编排</span></li>
          <li class="step"><span class="step-id" aria-hidden="true">03</span><strong>验证与交付</strong><span class="step-detail">测试证据</span></li>
        </ol>
      </div>
    </aside>
    <section class="signin" aria-labelledby="title">
      <div class="signin-inner">
        <div class="brand"><span class="mark" aria-hidden="true">◈</span>AetherHarness</div>
        <h1 id="title">登录工作台</h1>
        <p class="description">使用本机账号和访问令牌继续。</p>
        <form id="login" action="/api/login" method="post">
          <div class="field">
            <label for="username">账号</label>
            <input id="username" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="40" required>
          </div>
          <div class="field">
            <label for="token">访问令牌</label>
            <div class="token-field">
              <input id="token" name="token" type="password" autocomplete="current-password" autocapitalize="none" spellcheck="false" maxlength="64" required>
              <button id="toggle" type="button" class="toggle" aria-label="显示访问令牌" aria-controls="token" aria-pressed="false">显示</button>
            </div>
          </div>
          <p id="login-error" class="error" role="alert"></p>
          <button id="submit" class="submit" type="submit">登录</button>
        </form>
        <p class="help">使用临时账号时，请在启动终端查看本次的账号和令牌。</p>
      </div>
    </section>
  </main>
  <script>
    const form = document.getElementById('login');
    const token = document.getElementById('token');
    const toggle = document.getElementById('toggle');
    const submit = document.getElementById('submit');
    const error = document.getElementById('login-error');
    const query = new URLSearchParams(location.search);
    if (query.has('expired')) error.textContent = '登录已过期，请重新登录。';
    toggle.addEventListener('click', () => {
      const showing = token.type === 'password';
      token.type = showing ? 'text' : 'password';
      toggle.textContent = showing ? '隐藏' : '显示';
      toggle.setAttribute('aria-label', showing ? '隐藏访问令牌' : '显示访问令牌');
      toggle.setAttribute('aria-pressed', String(showing));
    });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (submit.disabled) return;
      error.textContent = '';
      submit.disabled = true;
      submit.textContent = '正在登录…';
      try {
        const response = await fetch(form.action, {
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
      } catch {
        error.textContent = '无法连接本机控制台，请稍后重试。';
      } finally {
        submit.disabled = false;
        submit.textContent = '登录';
      }
    });
  </script>
</body>
</html>`;
