#!/usr/bin/env node
// Downloads the rolldown riscv64 native binding from npm registry and copies it
// into every installed rolldown version.
import { copyFileSync, createWriteStream, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { get } from "node:https";
import { join } from "node:path";
import { arch, platform } from "node:process";
import { execSync } from "node:child_process";

if (platform !== "linux" || arch !== "riscv64") {
  process.exit(0);
}

const BINDING_NAME = "rolldown-binding.linux-riscv64-gnu.node";
const CACHE_PATH = join(import.meta.dirname, "..", "node_modules", ".cache", BINDING_NAME);
const BINDING_PKG_URL =
  "https://registry.npmjs.org/@dengxifeng/binding-linux-riscv64-gnu/-/binding-linux-riscv64-gnu-1.0.0-rc.9.tgz";

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const request = (href) => {
      get(href, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          request(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode} for ${href}`));
          return;
        }
        const file = createWriteStream(dest);
        file.on("error", reject);
        res.pipe(file);
        file.on("finish", () => file.close(resolve));
      }).on("error", reject);
    };
    request(url);
  });
}

const pnpmStore = join(import.meta.dirname, "..", "node_modules", ".pnpm");

// Patch rolldown (dev dependency, pnpm only)
if (existsSync(pnpmStore)) {
  if (!existsSync(CACHE_PATH)) {
    console.log(`[patch-rolldown-binding] Downloading from npm registry...`);
    const tarPath = join(import.meta.dirname, "..", "node_modules", ".cache", "binding-riscv64.tgz");
    mkdirSync(join(tarPath, ".."), { recursive: true });
    await download(BINDING_PKG_URL, tarPath);

    const extractDir = join(import.meta.dirname, "..", "node_modules", ".cache", "binding-riscv64-extract");
    mkdirSync(extractDir, { recursive: true });
    execSync(`tar -xzf "${tarPath}" -C "${extractDir}"`, { stdio: "ignore" });

    const bindingInTar = join(extractDir, "package", BINDING_NAME);
    copyFileSync(bindingInTar, CACHE_PATH);

    rmSync(tarPath);
    rmSync(extractDir, { recursive: true });
    console.log(`[patch-rolldown-binding] Downloaded to ${CACHE_PATH}`);
  }
  let patched = 0;
  for (const entry of readdirSync(pnpmStore)) {
    if (!entry.startsWith("rolldown@")) {
      continue;
    }
    const target = join(pnpmStore, entry, "node_modules", "rolldown", "dist", "shared", BINDING_NAME);
    const sharedDir = join(target, "..");
    if (!existsSync(sharedDir)) {
      continue;
    }
    copyFileSync(CACHE_PATH, target);
    patched++;
    console.log(`[patch-rolldown-binding] Patched ${entry}`);
  }

  if (patched > 0) {
    console.log(`[patch-rolldown-binding] Done, patched ${patched} installation(s).`);
  }

  // Patch lightningcss (dev dependency, pnpm only)
  const LCSS_BINDING_NAME = "lightningcss.linux-riscv64-gnu.node";
  const LCSS_CACHE_PATH = join(import.meta.dirname, "..", "node_modules", ".cache", LCSS_BINDING_NAME);
  const LCSS_PKG_URL =
    "https://registry.npmjs.org/@dengxifeng/lightningcss-linux-riscv64-gnu/-/lightningcss-linux-riscv64-gnu-1.32.0.tgz";

  if (!existsSync(LCSS_CACHE_PATH)) {
    console.log(`[patch-lightningcss] Downloading from npm registry...`);
    const tarPath = join(import.meta.dirname, "..", "node_modules", ".cache", "lightningcss-riscv64.tgz");
    mkdirSync(join(tarPath, ".."), { recursive: true });
    await download(LCSS_PKG_URL, tarPath);

    const extractDir = join(import.meta.dirname, "..", "node_modules", ".cache", "lightningcss-riscv64-extract");
    mkdirSync(extractDir, { recursive: true });
    execSync(`tar -xzf "${tarPath}" -C "${extractDir}"`, { stdio: "ignore" });

    const bindingInTar = join(extractDir, "package", LCSS_BINDING_NAME);
    copyFileSync(bindingInTar, LCSS_CACHE_PATH);

    rmSync(tarPath);
    rmSync(extractDir, { recursive: true });
    console.log(`[patch-lightningcss] Downloaded to ${LCSS_CACHE_PATH}`);
  }

  let lcssPatched = 0;
  for (const entry of readdirSync(pnpmStore)) {
    if (!entry.startsWith("lightningcss@")) {
      continue;
    }
    const target = join(pnpmStore, entry, "node_modules", "lightningcss", LCSS_BINDING_NAME);
    if (!existsSync(join(target, ".."))) {
      continue;
    }
    copyFileSync(LCSS_CACHE_PATH, target);
    lcssPatched++;
    console.log(`[patch-lightningcss] Patched ${entry}`);
  }

  if (lcssPatched > 0) {
    console.log(`[patch-lightningcss] Done, patched ${lcssPatched} installation(s).`);
  }
}

// Download and extract davey binding
const DAVEY_BINDING_NAME = "davey.linux-riscv64-gnu.node";
const DAVEY_CACHE_PATH = join(import.meta.dirname, "..", "node_modules", ".cache", DAVEY_BINDING_NAME);
const DAVEY_PKG_URL = "https://registry.npmjs.org/@dengxifeng/davey-linux-riscv64-gnu/-/davey-linux-riscv64-gnu-0.1.9.tgz";

if (!existsSync(DAVEY_CACHE_PATH)) {
  console.log(`[postinstall] Downloading davey binding from npm registry...`);
  const tarPath = join(import.meta.dirname, "..", "node_modules", ".cache", "davey.tgz");
  mkdirSync(join(tarPath, ".."), { recursive: true });
  await download(DAVEY_PKG_URL, tarPath);

  const extractDir = join(import.meta.dirname, "..", "node_modules", ".cache", "davey-extract");
  mkdirSync(extractDir, { recursive: true });
  execSync(`tar -xzf "${tarPath}" -C "${extractDir}"`, { stdio: "ignore" });

  const bindingInTar = join(extractDir, "package", DAVEY_BINDING_NAME);
  copyFileSync(bindingInTar, DAVEY_CACHE_PATH);

  rmSync(tarPath);
  rmSync(extractDir, { recursive: true });
  console.log(`[postinstall] Downloaded davey binding to ${DAVEY_CACHE_PATH}`);
}

// Patch @snazzah/davey with RISC-V binding
const nodeModules = join(import.meta.dirname, "..", "node_modules");

if (existsSync(pnpmStore)) {
  // pnpm structure
  let daveyPatched = 0;
  for (const entry of readdirSync(pnpmStore)) {
    if (!entry.startsWith("@snazzah+davey@")) {continue;}
    const target = join(pnpmStore, entry, "node_modules", "@snazzah", "davey", DAVEY_BINDING_NAME);
    if (!existsSync(join(target, ".."))) {continue;}
    copyFileSync(DAVEY_CACHE_PATH, target);
    daveyPatched++;
    console.log(`[postinstall] Patched davey in ${entry}`);
  }
  if (daveyPatched > 0) {
    console.log(`[postinstall] Done, patched ${daveyPatched} davey installation(s).`);
  }
} else {
  // npm/yarn flat structure
  const daveyTarget = join(nodeModules, "@snazzah", "davey", DAVEY_BINDING_NAME);
  if (existsSync(join(daveyTarget, ".."))) {
    copyFileSync(DAVEY_CACHE_PATH, daveyTarget);
    console.log(`[postinstall] Patched @snazzah/davey with RISC-V binding`);
  }
}
