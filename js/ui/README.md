# UI 模块边界

`ui.js` 继续导出唯一的 `ui` 实例，以及兼容旧调用方的 `SVG`、`svg`、`priceTag`。初始化与订阅顺序保留在入口；公开方法显式转发到具名函数，并传递原来的 `this`、参数和返回值。

- `hud.js`：HUD、触屏控制、任务指引、种子栏。
- `decor-toolbar.js`：装修目录构建和工具操作；`decor-refresh.js`：按变化范围同步呈现。摆放规则仍由 Decor 提供。
- `overlays.js`：通用弹窗、转场、气泡和提示；关闭清理在原方法中。
- `activity-panels.js`：委托、成就、商店、家园、结算和回收。
- `giant-crop-panel.js`：家园中的巨大作物手动展示；只借用已有仓库物品，不改变库存或保存临时手持状态。收获不再自动拿起，普通互动键不再提供反复拿起入口。
- `account-panels.js`：登录、云冲突、邮件；保留请求并发保护、会话归属与关闭监听清理。
- `menus.js`：设置、帮助、教程入口和标题。
- `components/`：无状态图标、价格标签、按钮音效和同值 DOM 写入辅助函数；不导入 `ui.js`。

这些职责模块不创建 UI 单例，也不安装原型或自动混入方法。新增跨模块调用仍通过传入的原 `this`，不要直接导入 `ui.js` 形成反向依赖。

`UI.init(game)` 的第一步同步调用 `bindLivePanels(this)`，早于 HUD 创建和事件订阅。`live/panels.js` 保存这个已存在的实例；同一实例重复绑定无副作用，不同实例或未初始化调用会明确报错。图标与价格标签直接从 `components/` 导入，`live/visitors.js` 也直接使用无状态图标，因此 live 模块不反向导入 UI 入口。不要用动态 import 掩盖循环。

任务栏只复用最终 DOM 呈现，`listTasks`、`trackedTask` 和导航闭包每次仍执行/更新；这些查询涉及居民/访客换日，不能缓存业务结果。缓存还校验状态引用、内容和元素身份，外部改动或重建应自动失效。`refreshAll → refreshReqs → refreshQuest` 只刷新一次；不要再补第二次调用。用 `npm run qa:ui-presentation` 检查辅助边界，真实任务路径另跑 `ui_refresh_checks.js`。

装修栏保留无参数 `refreshDecor()` 完整刷新。`decorPreview` / `partitionPreview` 只更新提示和撤销状态；`decorCamera` 再更新相机控件与面板显隐，不遍历家具/地面目录。选择、历史、交易、金币、区域、模式及换档继续完整同步刷新，不缓存库存、费用或解锁结果，不延迟禁用状态。历史事件不能缩成只刷撤销：房屋升级写入新等级后通过 `clearHistory` 更新隔断权限。Preview 可能嵌在选择/放置动作中，后续同一调用栈的完整事件负责收口；验收真实动作完成后的 DOM 等价，不能假设所有中间事件都只改提示。

验证时运行正常工程检查及真实 UI 套件；`tools/qa/ui_refactor_contract_checks.cjs <before目录> [report.json]` 仅补充验证历史迁移一致性，需要显式提供只读基线。`ui_module_integration_checks.js`、`live_hud_checks.js`、`modal_fit_checks.js`、`diagnostics_ui_checks.js` 可直接验证当前源码，沿用独立资料目录与 slot、禁止外网；账号与邮件专项使用合成 API，不代表真实云端或真机验收。
