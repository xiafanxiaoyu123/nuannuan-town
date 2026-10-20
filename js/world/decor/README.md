# 装修模块

对外入口仍是 `../decor.js` 的 `DecorSys` 和 `floorTex`。构造器、进入/退出、公开方法和原字段保留在同一个实例上；这里的具名函数显式接收 `decor`，不安装原型，不维护第二份装修状态。

| 文件 | 修改职责 |
| --- | --- |
| `transactions.js` | 会话扣费、历史、撤销、布局保存/预览/应用 |
| `placement.js` | 区域和占格、作物保护、楼层支撑、边缘吸附 |
| `objects.js` | 家具模型、贴墙、碰撞、重建和资源释放 |
| `surfaces.js` | 地板贴图、网格、铺地和笔画 |
| `view.js` | 装修镜头、选择工具、虚影和预览材质 |
| `editing.js` | 放置、拾取、移动、旋转、替换、收回和卖出 |
| `input.js` | 键盘/指针、拖动取消、调用对应编辑动作 |
| `dragging.js` | 已摆家具的直接拖动预览、提交与取消；模型射线优先于地面占格 |

进入装修后沿用原事务标记与待扣费用。`exit()` 必须先结束铺地笔画，再成功结算，最后清除事务、退出和保存；余额不足时仍留在装修模式。`pagehide` 静默提交、撤销对额外收入的保留、库存扣还、带作物地块与承重关系的限制都是行为契约。

修改输入时不要把购买和库存规则复制进指针回调。`onUp` 路由到 `placeSelection` / `pickSelection`；修改规则时先看对应 editing、placement 或 transactions。跨模块仍使用原实例的方法，方便追踪调用者。

第五轮直接拖动只在摆放视角且未选新物品、地面或隔断时启动。达到鼠标10/触摸24像素门限后隐藏原模型，用独立 ghost 预览；松手合法才更新原存档项并登记一次移动历史，不经仓库、不新增费用。空白拖动仍平移。取消、双指缩放、失焦、丢失捕获、切工具/区域/档案恢复原物。建造岛屋顶显隐必须尊重拖动隐藏状态。`npm run qa:decor-drag` 覆盖纯规则及真实模型几何，`decor_drag_ui_checks.js` 单独验证真实浏览器输入。

`objects.js` 的模型适配和碰撞矩形复用同一次 `houseFit` 结果，只在本次操作内传递，不能跨帧或墙体修改缓存。公开 `houseCollisionRects` 按传入墙体重新计算；栅栏、地毯、野餐垫、拱门与秋千保留各自碰撞规则，动画缩放不能替代原始模型边界。`npm run qa:decor-fit` 检查 240 组真实模型/旋转/墙体/位置及调用计数；旧实现对照要直接给 `--baseline <before/js/world/decor/objects.js>`，只给旧门面文件不足以覆盖内部实现。

从工程根执行 `npm run qa:decor-module` 验证当前内存场景。可手动给 `tools/qa/decor_module_checks.cjs` 传 `--baseline <审核过的旧decor.js>` 和 `--out <全新报告.json>` 做差分；该检查使用真实 Three 和放置规则，模型、持久化及浏览器边界为夹具。真实界面另用 Electron 的 `decor_plans_checks.js`、`decor_interaction_checks.js`、`decor_camera_checks.js`、`house_partition_checks.js`，按维护规范使用本轮隔离服务、独立资料目录和存档位。
