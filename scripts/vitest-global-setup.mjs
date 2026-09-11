/**
 * vitest globalSetup：为整个测试进程拉起一个专用 dev-stub 实例（端口 9911），
 * 与开发用 stub（9999）、E2E stub 互相隔离，测试数据互不污染。结束后回收子进程。
 */
const PORT = 9911;
const BASE_URL = `http://127.0.0.1:${PORT}`;

async function healthy() {
  try {
    const res = await fetch(`${BASE_URL}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

export default async function globalSetup() {
  if (await healthy()) {
    // 上一次异常退出残留的实例：健康即可复用（数据为旧种子，测试一律自建数据）
    console.log(`[vitest-global] 复用 ${BASE_URL} 上已存在的 stub`);
    return async () => {};
  }

  const { spawn } = await import('node:child_process');
  const proc = spawn(process.execPath, ['scripts/dev-stub.mjs'], {
    env: { ...process.env, STUB_PORT: String(PORT) },
    stdio: ['ignore', 'inherit', 'inherit'],
    detached: false,
  });

  // 等待就绪（最长 15s）
  const deadline = Date.now() + 15000;
  while (!(await healthy())) {
    if (proc.exitCode !== null) {
      throw new Error(`[vitest-global] dev-stub 启动即退出（code=${proc.exitCode}），端口 ${PORT} 可能被占用`);
    }
    if (Date.now() > deadline) {
      proc.kill();
      throw new Error(`[vitest-global] dev-stub 未在 15s 内就绪：${BASE_URL}`);
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  console.log(`[vitest-global] dev-stub 就绪：${BASE_URL} (pid=${proc.pid})`);

  return async function teardown() {
    proc.kill();
    console.log('[vitest-global] dev-stub 已回收');
  };
}
