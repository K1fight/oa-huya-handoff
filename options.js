(function () {
  'use strict';

  var apiInput = document.getElementById('api');
  var msgEl = document.getElementById('msg');
  var extIdEl = document.getElementById('extId');
  var effectiveEl = document.getElementById('effective');

  function show(text, kind) {
    msgEl.textContent = text;
    msgEl.className = kind || '';
  }

  function refresh() {
    oaHuyaApiBase().then(function (base) {
      apiInput.value = base;
      effectiveEl.textContent = base;
    });
    extIdEl.textContent = chrome.runtime.id || '—';
  }

  document.getElementById('save').addEventListener('click', function () {
    var value = apiInput.value.trim();
    if (!/^https?:\/\/[^\s]+$/i.test(value)) {
      show('地址需以 http:// 或 https:// 开头', 'err');
      return;
    }
    oaHuyaSaveApiBase(value).then(function (saved) {
      apiInput.value = saved;
      effectiveEl.textContent = saved;
      show('已保存', 'ok');
    });
  });

  document.getElementById('reset').addEventListener('click', function () {
    oaHuyaSaveApiBase(OA_HUYA_DEFAULT_API).then(function (saved) {
      apiInput.value = saved;
      effectiveEl.textContent = saved;
      show('已恢复默认地址', 'ok');
    });
  });

  refresh();
})();
