# OpenClaw RISC-V (riscv64) 平台适配总结

## 概述

本次适配使 OpenClaw 能够在 RISC-V 64 位 Linux 平台（riscv64）上正常运行。主要解决了三类问题：原生依赖缺少 riscv64 预编译产物、V8 引擎在 RISC-V Sv39 地址空间下的虚拟内存耗尽问题，以及拦截上游更新。

涉及提交：

| 提交          | 说明                                                   |
| ------------- | ------------------------------------------------------ |
| `8ca5c9a1ba`  | 添加 riscv64 平台支持（原生依赖补丁、构建脚本适配）    |
| `933d63b7c2`  | 修复 V8 Wasm trap handler 导致的虚拟地址空间耗尽       |
| `32d97d5968`  | 拦截上游更新                                     |

---

## 1. 原生依赖适配

### 1.1 问题

OpenClaw 依赖多个包含平台相关原生二进制文件（`.node`）的 npm 包，但均未提供 riscv64 预编译产物：

- **rolldown**（打包工具）— 缺少 `rolldown-binding.linux-riscv64-gnu.node`
- **lightningcss**（CSS 处理器）— 缺少 `lightningcss.linux-riscv64-gnu.node`
- **@matrix-org/matrix-sdk-crypto-nodejs**（Matrix 加密 SDK）— 无 riscv64 原生绑定
- **@lancedb/lancedb**（向量数据库）— 无 riscv64 原生绑定

### 1.2 解决方案

#### rolldown + lightningcss：postinstall 补丁脚本

新增 `scripts/postinstall.mjs`，在 `pnpm install` 的 postinstall 阶段自动执行：

1. 检测当前平台，仅在 `linux` + `riscv64` 时运行，其他平台直接退出
2. 从 npm registry 上的 fork 包（`@dengxifeng/binding-linux-riscv64-gnu`、`@dengxifeng/lightningcss-linux-riscv64-gnu`）下载预编译的 riscv64 binding
3. 缓存到 `node_modules/.cache/` 避免重复下载
4. 遍历所有 rolldown / lightningcss 安装目录，将 binding 复制到对应位置

#### matrix-sdk-crypto-nodejs + lancedb：pnpm override

在 `package.json` 中通过 pnpm `overrides` 将这两个包指向包含 riscv64 原生绑定的 fork：

```json
{
  "pnpm": {
    "overrides": {
      "@matrix-org/matrix-sdk-crypto-nodejs": "github:dengxifeng/matrix-rust-sdk-crypto-nodejs#v0.4.0-riscv",
      "@lancedb/lancedb": "npm:@dengxifeng/lancedb@^0.27.1"
    }
  }
}
```

#### .npmrc 架构声明

添加 `supportedArchitectures` 配置，使 pnpm 在安装时下载 riscv64 平台的可选依赖：

```ini
supportedArchitectures.cpu=riscv64,current
supportedArchitectures.os=linux,current
```

### 1.3 涉及文件

| 文件                    | 变更                                              |
| ----------------------- | ------------------------------------------------- |
| `.npmrc`                | 添加 supportedArchitectures 配置                  |
| `package.json`          | 添加 postinstall 脚本、pnpm overrides、devDeps    |
| `pnpm-lock.yaml`        | 更新依赖解析记录                                  |
| `scripts/postinstall.mjs` | 新增，rolldown + lightningcss riscv64 binding 补丁 |

---

## 2. V8 Wasm Trap Handler 虚拟地址空间耗尽修复

### 2.1 问题

V8 引擎默认启用 Wasm trap handler，为每个 WebAssembly 实例预留约 10GB 虚拟地址空间作为 guard region。在 x86-64（用户态 VA 空间 128TB）上这不是问题，但 RISC-V Sv39 的用户态虚拟地址空间仅有 256GB，约 24 个 Wasm 实例就会耗尽 VA 空间，导致：

```
Out of memory: Cannot allocate Wasm memory
```

Node.js 内置的 undici HTTP 客户端使用 llhttp 的 Wasm 实现，因此即使应用本身不使用 WebAssembly，也会触发此问题。

### 2.2 解决方案

在所有 Node.js 启动入口传递 `--disable-wasm-trap-handler` 标志，使 V8 改用显式边界检查（explicit bounds check）替代 trap handler，消除大块 VA 预留。

### 2.3 性能影响

- 禁用 trap handler 后，V8 在每次 Wasm 内存访问前插入一条比较+分支指令
- 对 Wasm 密集型负载约有 5-15% 的执行开销
- OpenClaw 的核心逻辑为 JS/TS 和 I/O 操作，Wasm 不在热路径上，实际影响可忽略

### 2.4 涉及文件

三个 Node.js 启动入口均需处理，确保所有运行模式都覆盖：

| 文件                         | 角色             | 实现方式                                                      |
| ---------------------------- | ---------------- | ------------------------------------------------------------- |
| `openclaw.mjs`               | CLI 主入口       | 检测 riscv64 后用 `child_process.spawn` 带 flag 重新执行自身  |
| `scripts/run-node.mjs`       | 开发/脚本启动器  | `riscvNodeFlags()` 函数在 spawn 时注入 flag                   |
| `src/daemon/program-args.ts` | 守护进程参数构建 | `platformNodeFlags()` 函数在构建 programArguments 时注入 flag |

### 2.5 实现细节

`openclaw.mjs` 采用 re-exec 模式（检测到 riscv64 且 `execArgv` 中无该 flag 时，spawn 一个带 flag 的子进程并等待退出），因为它是直接被 Node.js 执行的入口脚本，无法在自身启动前注入 V8 flag。

`run-node.mjs` 和 `program-args.ts` 则在构建 spawn 参数时直接将 flag 插入到 Node.js 可执行文件路径之后、脚本路径之前。`program-args.ts` 额外判断了运行时类型，仅在 Node.js 运行时（非 Bun 等）时注入该 flag。

---

## 3. 拦截上游更新

### 3.1 问题

riscv64 构建的版本号带有 `-riscv64.N` 后缀（如 `2026.3.23-riscv64.1`），但 npm 公共 registry 上的 `openclaw` 包只提供 x86-64 / arm64 构建。如果 riscv64 用户执行 `openclaw update`，会从上游拉取到不兼容的架构版本并覆盖当前安装。

### 3.2 解决方案

新增 `isCompatibleArchUpdate()` 函数，检查当前版本与目标版本的 prerelease 标签：

- 如果当前版本包含 `riscv64` 后缀，则目标版本也必须包含 `riscv64` 后缀，否则拒绝更新
- 非 riscv64 版本不受影响

在三个更新路径中都加入了拦截：

| 文件                              | 更新路径           |
| --------------------------------- | ------------------ |
| `src/cli/update-cli/update-command.ts` | CLI `openclaw update` 命令 |
| `src/infra/update-startup.ts`     | 启动时自动更新检查  |
| `src/infra/update-runner.ts`      | 全局包管理器更新    |

---

## 4. 构建脚本适配

`scripts/bundle-a2ui.sh` 增加了 hoisted `node_modules/rolldown` 路径的兜底查找，确保在 pnpm hoisted 模式下也能正确定位 rolldown CLI。

---

## 5. 已知限制

- **oxlint/tsgolint**：pre-commit hook 中的 lint 工具暂无 riscv64 原生包，lint 步骤会报错但不阻塞提交
- **依赖 fork 维护**：rolldown、lightningcss、matrix-sdk-crypto-nodejs、lancedb 的 riscv64 支持依赖第三方 fork，需跟踪上游合并进度，待上游原生支持后移除 override 和补丁脚本
