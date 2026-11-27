import { copyFile, mkdir, access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, "kumo-status");
await access(resolve(root, "scripts/kumo-stocks/Dockerfile"));
await mkdir(output, { recursive: true });
await copyFile(resolve(root, "deploy/kumo-status/index.html"), resolve(output, "index.html"));
console.log("Kumo deployment page built in", output);
