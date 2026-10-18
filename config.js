/**
 * 扩展共享配置。
 *
 * OA 地址可在扩展的「选项」页修改（右键扩展图标 → 选项，或 chrome://extensions 里点「扩展程序选项」），
 * 换域名/端口无需重装扩展。
 */
var OA_HUYA_DEFAULT_API = 'http://103.236.90.63:31000';
var OA_HUYA_STORAGE_KEY = 'apiBase';

/** 读取生效的 OA 地址（去掉结尾斜杠）。 */
function oaHuyaApiBase() {
  return new Promise(function (resolve) {
    try {
      chrome.storage.local.get({ [OA_HUYA_STORAGE_KEY]: OA_HUYA_DEFAULT_API }, function (values) {
        var base = String((values && values[OA_HUYA_STORAGE_KEY]) || OA_HUYA_DEFAULT_API).trim();
        base = base.replace(/\/+$/, '');
        resolve(base || OA_HUYA_DEFAULT_API);
      });
    } catch (error) {
      resolve(OA_HUYA_DEFAULT_API);
    }
  });
}

/** 保存 OA 地址。 */
function oaHuyaSaveApiBase(base) {
  return new Promise(function (resolve) {
    var value = String(base || '').trim().replace(/\/+$/, '');
    chrome.storage.local.set({ [OA_HUYA_STORAGE_KEY]: value }, function () { resolve(value); });
  });
}
