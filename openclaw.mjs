#!/usr/bin/env node

import module from "node:module";
import { arch, execArgv, execPath, argv } from "node:process";

// RISC-V Sv39: V8 reserves ~10GB VA per Wasm instance for trap-handler guard
// regions.  With only 256GB user VA space this causes OOM after ~24 instances.
// Re-exec with --disable-wasm-trap-handler so V8 uses explicit bounds checks.
if (arch === "riscv64" && !execArgv.includes("--disable-wasm-trap-handler")) {
  const { spawn } = await import("node:child_process");
  const child = spawn(execPath, ["--disable-wasm-trap-handler", ...argv.slice(1)], {
    stdio: "inherit",
  });
  child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 1)));
  // Prevent the rest of the script from executing in the parent process.
  await new Promise(() => {});
}

// https://nodejs.org/api/module.html#module-compile-cache
if (module.enableCompileCache && !process.env.NODE_DISABLE_COMPILE_CACHE) {
  try {
    module.enableCompileCache();
  } catch {
    // Ignore errors
  }
}

const isModuleNotFoundError = (err) =>
  err && typeof err === "object" && "code" in err && err.code === "ERR_MODULE_NOT_FOUND";

const installProcessWarningFilter = async () => {
  // Keep bootstrap warnings consistent with the TypeScript runtime.
  for (const specifier of ["./dist/warning-filter.js", "./dist/warning-filter.mjs"]) {
    try {
      const mod = await import(specifier);
      if (typeof mod.installProcessWarningFilter === "function") {
        mod.installProcessWarningFilter();
        return;
      }
    } catch (err) {
      if (isModuleNotFoundError(err)) {
        continue;
      }
      throw err;
    }
  }
};

await installProcessWarningFilter();

const tryImport = async (specifier) => {
  try {
    await import(specifier);
    return true;
  } catch (err) {
    // Only swallow missing-module errors; rethrow real runtime errors.
    if (isModuleNotFoundError(err)) {
      return false;
    }
    throw err;
  }
};

if (await tryImport("./dist/entry.js")) {
  // OK
} else if (await tryImport("./dist/entry.mjs")) {
  // OK
} else {
  throw new Error("openclaw: missing dist/entry.(m)js (build output).");
}
