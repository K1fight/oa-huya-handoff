/**
 * 直通页（手动打开时使用）。
 *
 * 正常路径是 OA 网页直接给后台发消息，不会打开本页；
 * 本页保留给「手动从扩展图标/历史记录打开」的场景，逻辑委托给后台服务，避免两套实现。
 */
(function () {
  'use strict';

  var stateEl = document.getElementById('state');
  var actionsEl = document.getElementById('actions');
  var infoEl = document.getElementById('info');
  var accountEl = document.getElementById('account');
  var panelEl = document.getElementById('panel');
  var apiEl = document.getElementById('api');
  var retryBtn = document.getElementById('retry');
  var openBtn = document.getElementById('open');

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

  /** 委托后台完成「兑换 → 写 Cookie → 打开面板」。 */
  function run() {
    var token = query('token');
    if (!token) {
      setState('缺少一次性凭据。请回到 OA 后台点「官网」按钮。', 'err');
      showActions(false, false);
      return;
    }
    oaHuyaApiBase().then(function (base) {
      var apiBase = (query('api') || base || OA_HUYA_DEFAULT_API).replace(/\/+$/, '');
      apiEl.textContent = apiBase;
      infoEl.className = 'show';
      setState('正在校验一次性凭据…');
      showActions(false, false);

      chrome.runtime.sendMessage({ type: 'huya-handoff', token: token, api: apiBase }, function (reply) {
        if (chrome.runtime.lastError || !reply) {
          setState('失败：' + ((chrome.runtime.lastError && chrome.runtime.lastError.message) || '后台无响应'), 'err');
          showActions(true, false);
          return;
        }
        if (!reply.ok) {
          var text = reply.error || '未知错误';
          setState('失败：' + text, 'err');
          var retryable = !/凭据已失效|凭据格式无效|该账号没有可用|非虎牙账号|号库账号不存在/.test(text);
          showActions(retryable, false);
          return;
        }
        var data = reply.data || {};
        resolvedPanelUrl = data.panelUrl || '';
        accountEl.textContent = (data.passport || data.uid || '未知') + '（uid ' + (data.uid || '-') + '）';
        panelEl.textContent = resolvedPanelUrl || '—';
        setState('已登录 ' + (data.passport || data.uid || '') + '，官方页面已在新标签页打开', 'ok');
        showActions(false, !!resolvedPanelUrl);
      });
    });
  }

  retryBtn.addEventListener('click', run);
  openBtn.addEventListener('click', function () {
    if (resolvedPanelUrl) chrome.tabs.create({ url: resolvedPanelUrl });
  });

  run();
})();
