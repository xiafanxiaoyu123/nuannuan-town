# 构建与运行

## 网页开发环境

- Node.js 22.13 或更高版本；推荐 Node.js 24。
- npm；Three.js 的精确安装版本由根目录 `package-lock.json` 锁定为 0.170.0。
- 构建静态目录另需 Python 3，使用标准库，无需安装 Python 依赖包。
- 支持 WebGL 的现代浏览器。

```sh
npm ci
npm run check
npm test
npm start
```

`npm start` 默认监听 `127.0.0.1:5173`。`PORT`、`HOST` 可调整端口和监听地址。本机 5173 端口默认自由试玩；`?sandbox=0` 或独立 `?slot=名称` 用于正常进度。不同试玩模式使用独立的存档键，已有正常存档不会被自由试玩覆盖。

源码同时包含 CommonJS 服务端和浏览器 ES Module；根目录没有统一的 `type` 声明，请保留这种组织方式，避免将一侧错误地按另一种模块类型解释。

## 静态网页构建

```sh
npm run build
python -m http.server 5173 --bind 127.0.0.1 --directory dist
```

构建会重建仓库自己的 `dist/`，包含 `index.html`、`js/`、`css/`、实际用到的 `vendor/three/` 模块、项目许可证和 Three.js 许可证。不要将自有文件放入 `dist/`。预览命令启动的静态服务器没有账号 API；它适合检查离线玩法和部署后的资源路径。

根目录的 `server.js` 需要 `server/` 模块，因此不能将它单独复制进 `dist/` 运行。部署纯静态版本时使用静态托管；需要账号服务时独立部署 API，并将 `/api/` 反向代理到它。

## 可选账号与云存档服务

```sh
npm run start:api
```

独立 API 默认监听 `127.0.0.1:3000`。服务使用 Node.js 内置 `node:sqlite`，某些 Node.js 版本会显示实验性提示；这不是第三方 SQLite 模块安装失败。

| 环境变量 | 用途 |
| --- | --- |
| `API_PORT` / `PORT` | 独立 API 端口；`API_PORT` 优先 |
| `DATA_DIR` | SQLite 及服务数据目录，默认仓库内 `data/` |
| `AUTH_DB` | 可选的数据库完整路径 |
| `APP_ORIGINS` | 允许带凭据访问 API 的精确 Origin 白名单，以逗号分隔 |
| `COOKIE_SECURE` | HTTPS 服务设为 `1`；本机 HTTP 开发保留默认值 |
| `ADMIN_API_TOKEN` | 自行生成的管理员令牌；未配置时管理入口关闭 |
| `ADMIN_PUBLIC_ORIGIN` | 自己的管理台公开 Origin |
| `PUBLIC_FREE_ENTITLEMENTS` | `0` 关闭默认免费权益；其他值默认开启，已有运营配置以数据库为准 |
| `TEST_AUTH_ENABLED` | 仅本地测试需要时显式设为 `1`，部署服务保持关闭 |

开发服务器同时承载网页和 API 时无需跨域。分别部署时，配置自己的域名、HTTPS、Origin 白名单及反向代理。不要把管理员令牌、支付密钥或数据库放入静态资源路径，也不要提交进 Git。

浏览器在同源 `/api/` 使用账号接口。原生客户端必须配置自己的 API 地址；桌面支持 `--api-base=`、`NIKKI_API_BASE` 或自己的 `desktop/release-config.json`。Android 可在构建的入口中注入 `window.__NIKKI_API_BASE__`。发布副本默认不连接原项目的生产账号服务或更新服务。

`server/*.env.example` 是支付适配器的变量说明。复制示例不等于支付开通；自行部署的支付、邮件管理及运营功能需要独立配置与验收。使用自己的数据库目录并定期备份；服务端存档使用修订号处理冲突，首次同步应由玩家选择本地或云端存档。

## Windows 桌面版

需要 Windows、根目录的网页构建环境，以及桌面工程的 npm 依赖。桌面依赖由 `desktop/package-lock.json` 锁定。

```sh
npm ci
npm run build
npm --prefix desktop ci
python tools/exe_build.py
```

输出位于 `release/`，为 Windows x64 文件夹与 ZIP。脚本会重建 `desktop/dist/` 并覆盖同名构建产物。Electron 下载需要访问其发布源。此命令不进行 Windows 代码签名，也不上传或发布产物。

客户端配置自己的资源更新清单、公钥和 API 地址后才能使用对应服务。更新私钥必须由部署者自行保存，不能加入仓库；清单和资源更新流程应在自己的环境独立验收。

## Android

需要 JDK 21、Android SDK（本工程 compile/target SDK 36）、Android 构建工具，以及 Capacitor 工程依赖。配置 `JAVA_HOME`、`ANDROID_HOME` 指向自己安装的 JDK 和 Android SDK。

```sh
npm ci
npm run build
npm --prefix apk ci
cd apk
npx cap sync android
cd ..
python tools/apk_build.py
```

脚本会将 Android 工程复制到本项目的 `output/android-build/apk` 暂存目录，执行 Gradle `assembleDebug`，将结果复制为根目录 `暖暖的方块小镇.apk`。建议将仓库克隆到英文路径；也可用 `NIKKI_APK_WORK` 指定独立的英文暂存路径，路径中不要放需要保留的其他文件。脚本需要自己的 JDK/SDK 环境。

此路径生成调试签名 APK。正式发布需使用自己的应用标识、签名密钥、发布配置，以及设备安装和更新验收。仓库不包含签名私钥或现成的正式发布 APK。

## 验证范围

`npm run check` 检查 JavaScript 语法和入口依赖文件。`npm test` 运行选定的纯逻辑测试与存档隔离测试，使用内存数据，不操作真实浏览器档案、生产数据库或支付服务。生成报告位于 `output/`，不应提交。

这些自动检查不能代替实际浏览器体验、移动端触摸测试、APK 安装、Windows 签名或线上部署验收。对自己的改动，至少验证启动、正常游玩、保存后刷新、存档导出与导入，再进行平台构建。
