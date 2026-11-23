# MCHOSE Ace 68 Air 2 — SignalRGB / TunerRGB 插件

将迈从（MCHOSE）Ace 68 Air 2 磁轴键盘接入 SignalRGB / TunerRGB，实现画布灯效同步。

- USB `VID 0x3837 / PID 0x300A`（"Ace 68 Air 2"，有线连接）
- 68 键 + RT 侧键逐键控光，顶部 Air 灯箱（Light Box）可独立设色
- 可调帧率（默认 30 FPS），实测流畅运行

## 安装

1. 退出迈从官方驱动 M HUB（避免抢占 HID 接口；托盘常驻的 Watcher/Agent 进程无碍）。
2. 将 `MCHOSE_Ace68_Air2.js` 复制到用户插件目录：
   - **TunerRGB**：`文档\TUNERGB\Plugins\`（本 README 撰写时 TunerRGB 2.5.x 使用自己的目录，例如 `D:\Elements\TUNERGB\Plugins\`）
   - **SignalRGB 原版**：`文档\WhirlwindFX\SignalRGB\Plugins\`（`%USERPROFILE%\Documents\WhirlwindFX\SignalRGB\Plugins`）
3. 重启 TunerRGB / SignalRGB，在「设备」页确认出现 "MCHOSE Ace 68 Air 2"。

## 参数

| 参数 | 说明 | 默认 |
|---|---|---|
| Frame Rate (FPS) | 发送帧率 | 30 |
| Onboard Profile | 写入的板载配置槽位 | 1 |
| Shutdown Color | 关闭/睡眠时颜色 | 黑 |
| Lighting Mode | Canvas（画布）/ Forced（单色） | Canvas |
| Forced Color | 单色模式颜色 | #009bde |
| Light Box Color | 顶部灯箱颜色（黑=熄灭） | 黑 |

## 技术说明（逆向）

键盘在 USB 接口 1 上提供厂商 HID 协议，包格式（64 字节，report ID 0）：

```
55 <cmd> 00 <checksum> 38 <off_lo> <off_hi> 00 <56 data bytes>
checksum = sum(bytes[4..63]) & 0xFF
```

LED 数据为 128 槽 × 3 字节（RGB），分 7 块下发（偏移 0x00/0x38/0x70/0xA8/0xE0/0x118/0x148）。

两条写入通道（同包格式，不同 cmd）：

| 通道 | cmd | 特性 | 用途 |
|---|---|---|---|
| 配置写 | `0x0B` | 每块 ~250ms（持久化校验），ACK `aa 0b …` | 关机色等需持久保存的写入 |
| 音乐律动 | `0xDD` | 每块 ~16ms，深度队列，可盲写 | 实时灯效流（本插件实时帧走此通道） |

`0xDD` 来自官方 Web 驱动的 `setMusicKeyColors`（音乐/GIF 实时刷新所用），实测帧级同步 23+ FPS、纯连写 800+ FPS。

LED 槽位表提取自官方 Web 驱动配置（`cdn.mchose.com.cn/customPage/prod/cizhou/CZ_SHARED_DATA/default-keys-ace68_air_2.*.js`）：

- 槽位 0–70：按键灯
- 槽位 76：RT 侧键
- 槽位 77–127：顶部 Air 灯箱
- 槽位 17/20/24/35/40/46/58/71：保留（未接灯）

## 致谢

- **Carlin16r**（[mchose-ace68-signalrgb](https://github.com/Carlin16r/mchose-ace68-signalrgb)）：Ace 68（PID 0x3003）插件，协议捕获与 0x0B 通道的原始实现。
- 迈从官方 Web 驱动：0xDD 快速通道与 LED 槽位表的来源。

## 许可

与 SignalRGB 社区插件惯例一致，按 GPL-2.0 发布（与所参考的社区插件许可证保持一致）。
