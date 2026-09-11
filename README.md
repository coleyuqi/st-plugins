# st-plugins —— SillyTavern 1.18 双功能扩展

一个仓库 = 一个扩展：`manifest.json` + `index.js`（两个功能合并），专为 ST 扩展面板的「安装扩展」设计。

## 安装（推荐）

ST 扩展面板 → 安装扩展 → 输入本仓库的 Git 地址（GitHub / GitLab / Gitee 均可）：

- GitHub：https://github.com/coleyuqi/st-plugins

ST 会用 git clone 拉取仓库，按 manifest.json 加载 index.js，装完自动出现在扩展列表，之后还支持面板内「更新」。

（Termux 手动方式：把整个仓库放进 `data/default-user/extensions/st-plugins/` 目录，注意 1.18 起第三方扩展必须是"文件夹+manifest.json"结构，不再支持松散 .js 文件）

## 功能1：NPC 登记

随机 NPC 首次出场时后台生成并锁定人设，后续出场保持一致。

- 标记模式：角色消息中出现 `[[新角色:名字]]`（需卡的世界书配合输出标记）
- 命令模式：`/npc 名字` 或 `/npc 名字 一句话印象`
- 其他命令：`/npclist` 查看已登记，`/npcforget 名字` 删除
- 存储为纯内存：重启或删除对话自动清空
- 注入策略：只注入最近 N 条消息里出现过的已登记 NPC（默认窗口 8）

## 功能2：预设内摘要

每满 N 条消息（默认 20）后台增量总结，写入对话级变量 `chat_summary`，删对话自动消失。

- 预设里放一行 `{{getvar::chat_summary}}` 即可每轮自动携带摘要
- 命令：`/summary` 立即总结，`/summaryclear` 清空
- 参数可调：总结间隔、回顾条数（默认 30）、摘要上限（默认 400 字）

## 设置入口

扩展面板 → 底部「扩展设置」→ 展开「NPC 登记」「预设内摘要」调整参数（默认已启用）。

## 要求

- SillyTavern 1.18（按 1.18 真实 API 编写：events.js / setExtensionPrompt / generateQuietPrompt 对象签名）
- Termux 环境需要 git（`pkg install git`）
