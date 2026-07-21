# 研发事项推进管理工具 Windows 桌面版

## 启动

双击 `Start-RD-Tracker.cmd`。

启动器会优先在本机 `127.0.0.1:18765` 启动本地服务，然后用 Microsoft Edge 的应用窗口打开工具。关闭应用窗口后，本地服务会自动退出。

## 数据位置

业务数据保存在 `%LOCALAPPDATA%\RDTracker\profile` 用户数据目录中，属于这个桌面应用窗口，不会混入普通浏览器配置。更新或重新解压应用文件时，这个目录会继续保留。

工具内仍然支持：

- JSON 完整导出
- JSON 导入恢复
- CSV 事项列表导出
- Markdown 周报

## 文件结构

- `app/`：应用页面文件
- `%LOCALAPPDATA%\RDTracker\profile`：首次启动后生成，保存本地浏览器数据
- `%LOCALAPPDATA%\RDTracker\logs`：首次启动后生成，保存本地服务日志
- `launch.ps1`：桌面启动逻辑
- `Start-RD-Tracker.cmd`：双击入口

## 说明

这是本地优先桌面封装，不会上传业务数据。后续如果要做安装包级应用，可以在这个原型基础上迁移到 Tauri + SQLite。
