/**
 * 虎牙登录态直通 —— 后台服务。
 *
 * 触发来源有两类，共用同一套逻辑：
 *   1. OA 网页通过 `chrome.runtime.sendMessage(<扩展ID>, ...)` 发起
 *      （网页必须在本扩展的 `externally_connectable` 里）；
 *   2. 扩展自己的页面通过 `chrome.runtime.sendMessage(...)` 发起。
 *
 * 注意：Chrome 禁止网页用 `window.open('chrome-extension://...')` 打开扩展页面
 * （ERR_BLOCKED_BY_CLIENT），所以网页侧必须走消息通道，不能再跳扩展 URL。
 *
 * 安全：本文件不打印日志、不落地凭据；token 一次性、60 秒有效。
 */

var COOKIE_DOMAIN = '.huya.com';
var DEFAULT_API = 'http://103.236.90.63:31000';

/** 清空 huya.com 下的全部 Cookie，避免多个账号登录态混用。 */
async function clearHuyaCookies() {
  var cookies = await chrome.cookies.getAll({ domain: 'huya.com' });
  await Promise.all(cookies.map(function (cookie) {
    var host = String(cookie.domain || '').replace(/^\./, '');
    var details = {
      url: (cookie.secure ? 'https' : 'http') + '://' + host + cookie.path,
      name: cookie.name
    };
    if (cookie.storeId) details.storeId = cookie.storeId;
    return chrome.cookies.remove(details).catch(function () { return null; });
  }));
}

/** 写入一组 Cookie 到 .huya.com。 */
async function applyCookies(jar) {
  var names = Object.keys(jar || {});
  var failed = [];
  for (var i = 0; i < names.length; i++) {
    var name = names[i];
    var value = String(jar[name] == null ? '' : jar[name]);
    if (!value) continue;
    var cookie = await chrome.cookies.set({
      url: 'https://www.huya.com/',
      domain: COOKIE_DOMAIN,
      path: '/',
      name: name,
      value: value,
      secure: true,
      sameSite: 'no_restriction'
    });
    if (!cookie) failed.push(name);
  }
  if (failed.length) throw new Error('写入 Cookie 失败：' + failed.join(', '));
}

/**
 * 主流程：兑换凭据 → 写 Cookie → 打开面板。
 * @returns {Promise<{uid:string,passport:string,panelUrl:string}>}
 */
async function runHandoff(token, apiBase) {
  if (!token || !/^[0-9a-f]{32}$/.test(String(token))) {
    throw new Error('凭据格式无效，请回到号库重新点击');
  }
  var base = String(apiBase || DEFAULT_API).replace(/\/+$/, '');

  var response = await fetch(base + '/api/vault/huya/handoff/redeem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: token })
  });
  var payload = await response.json().catch(function () { return {}; });
  if (!response.ok || payload.code !== 200) {
    throw new Error((payload && payload.message) || '凭据校验失败');
  }
  var data = payload.data || {};
  if (!data.panelUrl) throw new Error('后台未返回目标页面地址');

  await clearHuyaCookies();
  await applyCookies(data.cookies || {});
  await chrome.tabs.create({ url: data.panelUrl });

  return {
    uid: String(data.uid || ''),
    passport: String(data.passport || ''),
    panelUrl: data.panelUrl
  };
}

/** 统一处理来自网页或扩展页的请求（异步回复）。 */
function handleMessage(message, sender, sendResponse) {
  if (!message || message.type !== 'huya-handoff') return false;
  runHandoff(message.token, message.api)
    .then(function (result) { sendResponse({ ok: true, data: result }); })
    .catch(function (error) {
      sendResponse({ ok: false, error: error && error.message ? error.message : String(error) });
    });
  return true; // 保持消息通道，等待异步回复
}

// 网页（externally_connectable 匹配的来源）
chrome.runtime.onMessageExternal.addListener(function (message, sender, sendResponse) {
  return handleMessage(message, sender, sendResponse);
});

// 扩展自身的页面（handoff.html 等）
chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  return handleMessage(message, sender, sendResponse);
});

/** 安装/更新后打开一次说明页，便于确认版本。 */
chrome.runtime.onInstalled.addListener(function (details) {
  if (details && details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('options.html') }).catch(function () {});
  }
});
