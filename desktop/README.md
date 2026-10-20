# Windows 资源覆盖更新

桌面版仍然从 `app://game` 加载资源。随 Electron 打包的 `desktop/dist` 是始终可用的基础版本，更新文件放在用户目录的独立版本目录中，协议处理器按“覆盖层优先、基础资源回退”解析，因此只发布发生变化的文件即可。

运行时目录位于 `%LOCALAPPDATA%\暖暖的方块小镇\resource-updates`，结构大致如下：

```text
resource-updates/
  active.json
  active.json.bak
  versions/
    2.1.1/
      manifest.json
      js/main.js
```

`active.json` 是小型版本指针，写入时先生成并校验临时文件，再切换指针；其中会记录 `previousVersion`，所以启动后发现问题时可以调用 `OverlayUpdater.rollback()` 回退上一版。用户存档仍由游戏自身管理，不放进覆盖目录。

更新清单使用 schema 1：

```json
{
  "schema": 1,
  "product": "nikki-block-town-windows",
  "version": "2.1.1",
  "baseVersion": "2.1.0",
  "minRuntime": "1",
  "remove": ["js/old-module.js"],
  "files": [
    {
      "path": "js/main.js",
      "url": "https://example.invalid/updates/2.1.1/js/main.js",
      "size": 12345,
      "sha256": "64 位小写十六进制 SHA-256"
    }
  ]
}
```

正式更新清单必须签名。Windows 与 Android 共用 `ECDSA-P256-SHA256` 协议：签名覆盖去掉 `signature` 字段后的规范化 JSON（递归按 key 排序、`files` 和 `remove` 按路径排序、紧凑分隔符、UTF-8），`signature.value` 是 ASN.1 DER 签名的 base64，`keyId` 用于轮换公钥。客户端只配置公钥，不保存签名私钥：

```json
"signature": {
  "algorithm": "ECDSA-P256-SHA256",
  "keyId": "release-2026",
  "value": "base64..."
}
```

可以用下面的命令从一个已构建的 `desktop/dist` 生成清单；`--base-url` 只负责填入下载地址，不会上传文件：

```powershell
node tools/desktop_update_manifest.js `
  --root=desktop/dist `
  --version=2.1.1 `
  --base-version=2.1.0 `
  --base-url=https://your-host.example/updates/2.1.1/ `
  --private-key=release-signing-private.pem `
  --key-id=release-2026 `
  --output=release/windows-update-2.1.1.json
```

`--private-key` 只在发布机使用，不能放入安装包或 `desktop/`。如果不传它，工具仍可生成供离线调试使用的未签名清单，但联网客户端会拒绝该清单。

如果手上有上一版资源目录，加入 `--base-dir=desktop/dist-2.1.0` 后，清单只会列出新增或内容变化的文件，并在 `remove` 中记录已删除文件；客户端会把上一激活覆盖层先复制到 staging，再应用这些变化，所以连续增量更新不会丢失更早版本的覆盖资源。没有 `--base-dir` 时生成的是完整资源基线，适合每隔数个版本发布一次。

桌面程序默认不联网。只有设置 `NIKKI_UPDATE_MANIFEST_URL`，或启动参数 `--update-manifest=<URL>` 时，渲染进程在登录并取得 `auto_update`/`desktop_auto_update` 权益后才会请求检查；免费发布模式下该权益由服务器公开返回，未来付费模式复用同一字段；主进程通过安全 preload 暴露 `window.NikkiDesktop.updates`，不向页面暴露 `ipcRenderer` 或文件系统。账号 API 地址通过 `NIKKI_API_BASE` 或启动参数 `--api-base=<URL>` 配置，启动参数优先；preload 会把它作为只读的 `window.__NIKKI_API_BASE__` 提供给账号模块。对于 `http://localhost`、`http://127.0.0.1` 或 `http://[::1]` 的本地 API，preload 会将账号请求地址设为 `app://game`，主进程再把 `/api/*` 同源代理到该 loopback 地址，以便 HttpOnly 会话 Cookie 在 Electron 中正常保存；远端 HTTPS 地址也统一由主进程通过 `app://game` 代理，保证 HttpOnly/Secure 会话 Cookie 与页面同源；`window.NikkiDesktop.apiBase` 仍保留用户配置的原始地址。不配置时仍可运行本机游戏，但点击登录会明确提示缺少账号服务器，不会把 `app://game/api/...` 当静态文件请求而显示误导性的 404。检查只读取清单并校验签名，下载会写入独立 staging 目录，用户点击“一键更新”后才切换 `active.json`、重启并应用。公钥通过 `NIKKI_UPDATE_PUBLIC_KEY`（PEM 内容）或 `NIKKI_UPDATE_PUBLIC_KEY_FILE`（PEM 路径）配置，若同时设置 `NIKKI_UPDATE_PUBLIC_KEY_ID` 或 `--update-key-id=<ID>`，客户端还会固定检查签名中的 `keyId`。当前窗口继续使用已经打开的资源，下次启动应用新版本。下载失败、清单篡改或哈希不匹配会删除临时 staging 目录，不会修改当前 active 版本；启动异常时还会使用 `active.json.bak`，运行中可调用 `OverlayUpdater.rollback()` 回退上一版本。

更新 IPC 的公开方法只有 `status()`、`check()`、`download()`、`apply()`、`restart()` 和 `onStatus()`，调用来源必须是 `app://game/` 页面。未登录或不具备自动更新权益时，更新提示模块不会联网检查，也不会下载或应用覆盖层；可继续按官网手动更新。账号模块应在登录/权益刷新后派发 `nuannuan:account` 事件（`detail.entitlements` 或 `detail.profile.entitlements`），或更新 `globalThis.__NIKKI_ACCOUNT_ENTITLEMENTS__`。

源码同步约定：`js/desktop-updates.js` 与根目录 `index.html` 是源文件；`tools/build_dist.py` 会把它们复制到 `dist/`，再由 `tools/exe_build.py` 复制到 `desktop/dist/`。本次为便于现有桌面目录立即运行，也同步提交了 `dist/` 和 `desktop/dist/` 的副本；后续修改只编辑源文件并重新执行构建，不要单独修改副本。

本地端到端检查（使用临时自签名 HTTPS 服务，不连接生产地址）：

```powershell
node tools/qa/windows_update_e2e.js
```

本地账号 API 的 Electron 同源代理检查（使用临时 SQLite，不连接生产账号）：

```powershell
node tools/qa/desktop_api_proxy_e2e.js
```

第一版只完成资源层覆盖。Electron 可执行文件、签名、安装器、主进程代码变更仍需完整 Windows 包发布；不要把更新清单用于直接修改已签名的 Electron 包。



