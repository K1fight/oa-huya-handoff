/**
 * 虎牙登录态直通 —— 后台服务（v1.3.0）。
 *
 * 架构调整说明：
 * 早期版本由扩展后台直接调 OA 的兑换接口，但扩展发出的请求带
 * `Origin: chrome-extension://<id>`，被后端 Spring CORS 校验拒绝（403 Invalid CORS request）。
 *
 * 现在改为：
 *   OA 页面（与接口同源）负责签发凭据 + 兑换 Cookie；
 *   扩展只负责「把 Cookie 写进 .huya.com」并打开官方面板。
 * 这样全程没有跨域请求，不需要后端为扩展开放 CORS。
 *
 * 消息类型：
 *   ping          → 自检，返回扩展版本与 ID
 *   apply-cookies → { cookies: {name:value}, panelUrl } 清空并写入 huya.com Cookie，打开面板
 *
 * 安全：本文件不打印日志、不落地凭据。
 */

var COOKIE_DOMAIN = '.huya.com';

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

/** 把一组 Cookie 写入 .huya.com。 */
async function applyCookies(jar) {
  var names = Object.keys(jar || {});
  var results = await Promise.all(names.map(function (name) {
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
    }).then(function (cookie) { return cookie ? null : name; })
      .catch(function () { return name; });
  }));
  var failed = results.filter(function (x) { return x; });
  if (failed.length) throw new Error('写入 Cookie 失败：' + failed.join(', '));
}

/** 写入登录态并打开官方面板。 */
async function applyCookiesAndOpen(jar, panelUrl) {
  if (!jar || typeof jar !== 'object' || !Object.keys(jar).length) {
    throw new Error('没有收到任何 Cookie，请回 OA 重新点击「官网」');
  }
  if (!panelUrl) throw new Error('缺少目标页面地址');
  await clearHuyaCookies();
  await applyCookies(jar);
  await chrome.tabs.create({ url: panelUrl });
  return { panelUrl: panelUrl, cookieCount: Object.keys(jar).length };
}

/** 统一处理来自网页或扩展页的请求（异步回复）。 */
function handleMessage(message, sender, sendResponse) {
  try {
    return dispatch(message, sender, sendResponse);
  } catch (syncError) {
    // 任何同步异常都要回包，否则通道关闭会变成
    // "The message port closed before a response was received"
    try {
      sendResponse({
        ok: false,
        error: '扩展内部错误：' + (syncError && syncError.message ? syncError.message : String(syncError))
      });
    } catch (ignored) { /* 通道已关闭 */ }
    return true;
  }
}

function dispatch(message, sender, sendResponse) {
  if (!message) return false;

  // 自检
  if (message.type === 'ping') {
    var manifest = chrome.runtime.getManifest();
    sendResponse({
      ok: true,
      pong: true,
      version: manifest.version,
      extensionId: chrome.runtime.id,
      senderOrigin: sender && sender.origin ? sender.origin : ''
    });
    return true;
  }

  // 应用 Cookie 并打开面板
  if (message.type === 'apply-cookies') {
    applyCookiesAndOpen(message.cookies, message.panelUrl)
      .then(function (result) { sendResponse({ ok: true, data: result }); })
      .catch(function (error) {
        sendResponse({ ok: false, error: error && error.message ? error.message : String(error) });
      });
    return true;
  }

  return false;
}

// 网页（externally_connectable 匹配的来源）
chrome.runtime.onMessageExternal.addListener(function (message, sender, sendResponse) {
  return handleMessage(message, sender, sendResponse);
});

// 扩展自身的页面
chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  return handleMessage(message, sender, sendResponse);
});

/** 首次安装打开一次说明页。 */
chrome.runtime.onInstalled.addListener(function (details) {
  if (details && details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('options.html') }).catch(function () {});
  }
});
