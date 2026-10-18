# OA 虎牙号库登录态直通（浏览器扩展）

**一键用号库里某个虎牙账号的登录态，打开虎牙官方宝典面板。**

---

## 一、它解决什么问题

浏览器规定：**响应只能给自己所在的域（或其父域）写 Cookie**。

OA 后台在 `103.236.90.63:31000`，无法直接给 `.huya.com` 写登录态 ——
所以「带登录态跳转官方页面」必须由**浏览器扩展**代写 Cookie。

这个扩展就是那个「代写」的角色。

---

## 二、安装（一次性，约 30 秒）

1. 打开 `chrome://extensions`
   （Edge 用 `edge://extensions`，其它 Chromium 内核浏览器同理）
2. 打开右上角 **开发者模式**
3. 点击 **加载已解压的扩展程序**
4. 选择目录：

   ```
   /Users/litianyu/Desktop/OA/OA/extension/huya-handoff
   ```

5. 确认列表里出现 **「OA 虎牙号库登录态直通」**，且 ID 为：

   ```
   ljnnkbiaednllabhicmdkggeegekgnao
   ```

> ID 由 `manifest.json` 里的 `key` 字段固定，**卸载重装也不会变**，
> 所以 OA 后台可以按这个 ID 直接链接扩展。

---

## 三、使用

### 方式一：账号列表行内按钮（推荐）

```
平台管理 → 虎牙 → 货源账号
  → 找到目标账号，最后一列「操作」
  → 点「官网」
```

### 方式二：账号操作抽屉

```
点账号进入操作抽屉 → 「虎牙宝典」区
  →「带登录态打开官方页面」按钮
  → 需要电竞宝典时先切上面的「电竞宝典」再点
```

### 点击后发生什么

```
OA 点按钮
   ↓ POST /api/vault/huya/handoff/{vaultId}/token     （需 vault:manage）
   ← { token（一次性/60秒）, panelUrl }
   ↓ 打开 chrome-extension://ljnnk.../handoff.html?token=...
扩展：POST /api/vault/huya/handoff/redeem { token }     （token 即凭证）
   ← { uid, passport, cookies×N, panelUrl }
   ↓ 清空 .huya.com 既有 Cookie → 写入该账号 Cookie
   ↓ 新标签页打开 https://zt.huya.com/{pageId}/pc/index.html?...
已登录的官方宝典面板
```

扩展页会短暂显示进度（账号、目标页、OA 地址），成功后自动关闭。

---

## 四、配置 OA 地址

如果 OA 换了域名或端口，**不用重装扩展**：

```
chrome://extensions → 找到扩展 → 详情 → 扩展程序选项
（或右键扩展图标 → 选项）
→ 修改「OA 后台地址」→ 保存
```

默认地址：`http://103.236.90.63:31000`

---

## 五、安全设计

| 项 | 做法 |
|---|---|
| 凭据形态 | 128 位随机 token，**60 秒有效**，**兑换一次即失效**（Redis `getAndDelete`）|
| 签发权限 | 需登录 + `vault:manage` / `vault:exchange` / `SUPER` |
| 签发响应 | **不含任何 Cookie**，只有 token 与目标页地址 |
| 兑换端点 | 只认 token，不认 JWT —— **token 本身就是凭证** |
| 后端日志 | **不记录任何 Cookie 值**（兑换端点刻意不加审计日志）|
| 扩展权限 | 仅 `cookies` / `tabs` / `storage`，作用域限定 `*.huya.com` 与 OA 地址 |
| 凭据生命周期 | token 存在扩展内存里，用完即弃；不写入 storage

⚠️ **注意**：扩展会把 `huya.com` 下**原有 Cookie 全部清除**后再写入目标账号 ——
这是为了保证换号干净，但会把你浏览器里其它虎牙登录态一并踢掉。

---

## 六、常见问题

| 现象 | 原因 / 处理 |
|---|---|
| 点「官网」后打开的是错误页 | 扩展未安装或未启用；按第二节安装后重试 |
| 提示「凭据已失效或已被使用」 | token 超过 60 秒或已用过；回 OA 重新点一次 |
| 提示「该账号没有可用的登录态」 | 该账号 CK 为空或已失效；先在 OA 里扫码登录或续期 |
| 提示「浏览器拦截了新窗口」 | 允许本站弹窗后重试 |
| 打开的面板仍是未登录状态 | 该账号 CK 已被平台吊销；先在 OA 里重新登录 |
| 扩展页显示「失败」但有「重试」 | 点重试；若反复失败看下方「OA 地址」是否正确 |
| 安装后 ID 与文档不一致 | `manifest.json` 的 `key` 被改动过；恢复原 key |

---

## 七、文件说明

| 文件 | 作用 |
|---|---|
| `manifest.json` | MV3 清单；`key` 锁定扩展 ID，`options_page` 指向配置页 |
| `handoff.html` / `handoff.js` | 直通页：兑换凭据 → 写 Cookie → 打开面板（含重试与手动打开）|
| `options.html` / `options.js` | 配置页：修改 OA 地址 |
| `config.js` | 共享配置读取/保存 |
| `icons/` | 16/48/128 图标 |
| `../huya-handoff.zip` | 打包产物（分发用；解压后按第二节加载）|

---

## 八、打包成 .crx（可选）

本目录用「加载已解压」即可使用。若要分发自带签名的 `.crx`：

```bash
# 私钥不在仓库里；换私钥会改变扩展 ID，需同步修改：
#   OA 前端 HUYA_HANDOFF_EXTENSION_ID 常量（AccountsTab.tsx / VaultOpsDrawer.tsx）
```

**建议不要换私钥** —— 扩展 ID 变了要改前端并发版。

---

## 九、相关代码

| 位置 | 内容 |
|---|---|
| `backend/.../vault/service/VaultHuyaHandoffService.java` | 签发/兑换逻辑 |
| `backend/.../vault/controller/VaultHuyaHandoffController.java` | 两个端点 |
| `backend/.../common/config/SecurityConfig.java` | 放行 `/api/vault/huya/handoff/redeem` |
| `frontend/src/services/vaultOps.ts` | `huyaHandoffToken` |
| `frontend/src/app/vault/AccountsTab.tsx` | 行内「官网」按钮 |
| `frontend/src/app/vault/VaultOpsDrawer.tsx` | 抽屉内「带登录态打开官方页面」按钮 |
