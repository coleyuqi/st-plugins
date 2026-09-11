# SillyTavern 插件：NPC登记 + 预设内摘要

两个通用 SillyTavern 第三方插件，要求 ST 1.12+（开发于 1.18.0）。

## 安装

1. 下载两个 `.js` 文件，放进 SillyTavern 的插件目录：

   ```
   public/scripts/extensions/third-party/
   ```

   - Termux（手机本地跑 ST）示例：
     ```bash
     cp "/storage/emulated/0/NPC登记.js" ~/SillyTavern/public/scripts/extensions/third-party/
     cp "/storage/emulated/0/预设内摘要.js" ~/SillyTavern/public/scripts/extensions/third-party/
     ```
     （若提示 Permission denied，先执行 `termux-setup-storage` 授权，再改用 `~/storage/shared/` 路径）

2. 重启 ST / 刷新页面。

3. 顶部工具栏「扩展」面板 → 底部「扩展设置」→ 展开「NPC 登记」「预设内摘要」调整参数（默认已启用）。

## NPC登记.js —— 随机 NPC 人设锁定

角色卡对话里即兴登场的随机 NPC（路人/店主/卫兵等），首次出场时后台生成并锁定人设，后续出场保持一致。

- **标记模式**：角色消息中出现 `[[新角色:名字]]` 即触发（需卡的世界书配合输出标记）
- **命令模式**：`/npc 名字` 或 `/npc 名字 一句话印象`
- 其他命令：`/npclist` 查看已登记，`/npcforget 名字` 删除
- 存储为纯内存：重启或删除对话自动清空
- 注入策略：只注入最近 N 条消息里出现过的已登记 NPC（默认窗口 8），防止撑爆上下文

## 预设内摘要.js —— 对话自动总结

每满 N 条消息（默认 20）后台增量总结，写入对话级变量 `chat_summary`，删对话自动消失。

- 预设里放一行 `{{getvar::chat_summary}}` 即可每轮自动携带摘要
- 命令：`/summary` 立即总结，`/summaryclear` 清空
- 参数可调：总结间隔、回顾条数（默认 30）、摘要上限（默认 400 字）
