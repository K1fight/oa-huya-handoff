/**
 * OA 虎牙登录态直通（扩展页）。
 *
 * 流程：
 *  1. OA 后台调用 `POST /api/vault/huya/handoff/{vaultId}/token` 拿一次性凭据；
 *  2. 后台打开 `chrome-extension://<ID>/handoff.html?token=...`；
 *  3. 本脚本用该 token 调 `POST /api/vault/huya/handoff/redeem` 换取该账号 Cookie；
 *  4. 清空 huya.com 既有 Cookie，写入新账号登录态；
 *  5. 打开官方宝典面板并关闭本页。
 *
 * 安全：token 一次性、60 秒内有效；本脚本不写日志、不落地任何凭据。
 */
(function () {
  'use strict';

  var COOKIE_DOMAIN = '.huya.com';
  var stateEl = document.getElementById('state');
  var actionsEl = document.getElementById('actions');
  var infoEl = document.getElementById('info');
  var accountEl = document.getElementById('account');
  var panelEl = document.getElementById('panel');
  var apiEl = document.getElementById('api');
  var retryBtn = document.getElementById('retry');
  var openBtn = document.getElementById('open');

  /** 成功拿到的面板地址，供「直接打开」按钮使用。 */
  var resolvedPanelUrl = '';

  function setState(text, kind) {
    stateEl.textContent = text;
    stateEl.className = kind || '';
  }

  function showActions(showRetry, showOpen) {
    retryBtn.style.display = showRetry ? '' : 'none';
    openBtn.style.display = showOpen ? '' : 'none';
    actionsEl.className = (showRetry || showOpen) ? 'show' : '';
  }

  function query(name) {
    return new URLSearchParams(window.location.search).get(name) || '';
  }

  /** 清空 huya.com 下的全部 Cookie，避免多个账号登录态混用。 */
  function clearHuyaCookies() {
    return chrome.cookies.getAll({ domain: 'huya.com' }).then(function (cookies) {
      return Promise.all(cookies.map(function (cookie) {
        var scheme = cookie.secure ? 'https' : 'http';
        var host = String(cookie.domain || '').replace(/^\./, '');
        var url = scheme + '://' + host + cookie.path;
        var details = { url: url, name: cookie.name };
        if (cookie.storeId) details.storeId = cookie.storeId;
        return chrome.cookies.remove(details).catch(function () { return null; });
      }));
    });
  }

  /** 写入一组 Cookie 到 .huya.com。 */
  function applyCookies(jar) {
    var names = Object.keys(jar);
    return Promise.all(names.map(function (name) {
      var value = String(jar[name] == null ? '' : jar[name]);
      if (!value) return Promise.resolve(null);
      return chrome.cookies.set({
        url: 'https://www.huya.com/',
        domain: COOKIE_DOMAIN,
        path: '/',
        name: name,
        value: value,
        secure: true,
        sameSite: 'no_restriction'
      }).then(function (cookie) {
        if (!cookie) throw new Error('写入 Cookie 失败：' + name);
        return cookie;
      });
    }));
  }

  function openPanel(url) {
    if (!url) return Promise.resolve(null);
    resolvedPanelUrl = url;
    return chrome.tabs.create({ url: url });
  }

  /** 主流程：兑换凭据 → 写 Cookie → 打开面板。 */
  function redeem(token, apiBase) {
    setState('正在校验一次性凭据…');
    showActions(false, false);
    panelEl.textContent = '—';
    apiEl.textContent = apiBase;

    return fetch(apiBase + '/api/vault/huya/handoff/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: token })
    }).then(function (response) {
      return response.json().then(function (body) { return { ok: response.ok, body: body }; });
    }).then(function (result) {
      var payload = result.body || {};
      if (!result.ok || payload.code !== 200) {
        throw new Error(payload.message || '凭据校验失败');
      }
      var data = payload.data || {};
      var jar = data.cookies || {};
      var panelUrl = data.panelUrl;
      if (!panelUrl) throw new Error('后台未返回目标页面地址');

      accountEl.textContent = (data.passport || data.uid || '未知') + '（uid ' + (data.uid || '-') + '）';
      panelEl.textContent = panelUrl;
      infoEl.className = 'show';

      setState('正在写入 ' + (data.passport || data.uid || '') + ' 的登录态…');
      return clearHuyaCookies()
        .then(function () { return applyCookies(jar); })
        .then(function () {
          setState('已登录 ' + (data.passport || data.uid || '') + '，正在打开官方页面…', 'ok');
          return openPanel(panelUrl);
        })
        .then(function () { window.close(); });
    }).catch(function (error) {
      var text = error && error.message ? error.message : String(error);
      setState('失败：' + text, 'err');
      // 凭据类错误需回 OA 重新点；其余错误（如写 Cookie 失败）可重试
      var retryable = !/凭据已失效|凭据格式无效|该账号没有可用|非虎牙账号|号库账号不存在/.test(text);
      showActions(retryable, !!resolvedPanelUrl);
      throw error;
    });
  }

  function run() {
    var token = query('token');
    var fixedApi = query('api');
    if (!token) {
      setState('缺少一次性凭据。请回到 OA 后台重新点击「官网」按钮。', 'err');
      showActions(false, false);
      return;
    }
    oaHuyaApiBase().then(function (base) {
      var apiBase = (fixedApi || base || OA_HUYA_DEFAULT_API).replace(/\/+$/, '');
      apiEl.textContent = apiBase;
      infoEl.className = 'show';
      return redeem(token, apiBase);
    }).catch(function () { /* 错误已在 redeem 中呈现 */ });
  }

  retryBtn.addEventListener('click', function () {
    var token = query('token');
    if (!token) { setState('缺少凭据，请回 OA 重新点击「官网」。', 'err'); return; }
    oaHuyaApiBase().then(function (base) {
      var fixedApi = query('api');
      redeem(token, (fixedApi || base).replace(/\/+$/, '')).catch(function () {});
    });
  });

  openBtn.addEventListener('click', function () {
    if (resolvedPanelUrl) chrome.tabs.create({ url: resolvedPanelUrl });
  });

  run();
})();
