#!/usr/bin/env node
// Downloads the rolldown riscv64 native binding from GitHub and copies it
// into every installed rolldown version.
import { copyFileSync, createWriteStream, existsSync, mkdirSync, readdirSync } from "node:fs";
import { get } from "node:https";
import { join } from "node:path";
import { arch, platform } from "node:process";

if (platform !== "linux" || arch !== "riscv64") {
  process.exit(0);
}

const BINDING_NAME = "rolldown-binding.linux-riscv64-gnu.node";
const CACHE_PATH = join(import.meta.dirname, "..", "node_modules", ".cache", BINDING_NAME);
const GITHUB_URL = "https://github.com/dengxifeng/rolldown/raw/v1.0.0-riscv/" + BINDING_NAME;

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
        res.pipe(file);
        file.on("finish", () => file.close(resolve));
      }).on("error", reject);
    };
    request(url);
  });
}

if (!existsSync(CACHE_PATH)) {
  console.log(`[patch-rolldown-binding] Downloading from GitHub...`);
  mkdirSync(join(CACHE_PATH, ".."), { recursive: true });
  await download(GITHUB_URL, CACHE_PATH);
  console.log(`[patch-rolldown-binding] Downloaded to ${CACHE_PATH}`);
}

const pnpmStore = join(import.meta.dirname, "..", "node_modules", ".pnpm");
if (!existsSync(pnpmStore)) {
  process.exit(0);
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
  if (existsSync(target)) {
    continue;
  }
  copyFileSync(CACHE_PATH, target);
  patched++;
  console.log(`[patch-rolldown-binding] Patched ${entry}`);
}

if (patched > 0) {
  console.log(`[patch-rolldown-binding] Done, patched ${patched} installation(s).`);
}
