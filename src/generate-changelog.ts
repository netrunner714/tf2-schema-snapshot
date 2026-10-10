import { execFileSync } from "node:child_process";
import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import {
  generateSnapshotChangelog,
  renderChangelogMarkdown,
  type SnapshotArtifacts,
} from "./changelog.js";

async function readJson(file: string): Promise<unknown> {
  return JSON.parse(await readFile(file, "utf8"));
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

async function loadArtifacts(dir: string): Promise<SnapshotArtifacts | null> {
  try {
    const meta = record(await readJson(path.join(dir, "meta.json")));
    const itemsValue = await readJson(path.join(dir, "items.json"));
    if (!Array.isArray(itemsValue)) throw new Error("items.json must contain an array");
    const i18n: SnapshotArtifacts["i18n"] = {};
    const qualities: SnapshotArtifacts["qualities"] = {};
    const root = path.join(dir, "i18n");
    try {
      for (const entry of await readdir(root, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const language = entry.name;
        try {
          const items = await readJson(path.join(root, language, "items.json"));
          if (Array.isArray(items)) i18n[language] = items.map(record);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
        try {
          const names = await readJson(path.join(root, language, "qualities.json"));
          if (Array.isArray(names)) qualities[language] = names.map(record);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    return { meta, items: itemsValue.map(record), i18n, qualities };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function manualNotes(previousDir: string, sourceCommit: string): Promise<string[]> {
  let paths: string[] = [];
  let previousSourceCommit = "";
  try {
    const previousChangelog = record(await readJson(path.join(previousDir, "changelog.json")));
    previousSourceCommit = typeof previousChangelog.sourceCommit === "string"
      ? previousChangelog.sourceCommit
      : "";
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  if (previousSourceCommit && /^[0-9a-f]{40}$/i.test(previousSourceCommit)) {
    try {
      paths = execFileSync(
        "git",
        ["diff", "--name-only", "--diff-filter=A", `${previousSourceCommit}..${sourceCommit}`, "--", "changes"],
        { encoding: "utf8" },
      ).split("\n").filter(Boolean);
    } catch {
      paths = [];
    }
  } else {
    try {
      paths = (await readdir("changes", { withFileTypes: true }))
        .filter((entry) => entry.isFile() && entry.name.endsWith(".md") && entry.name !== "README.md")
        .map((entry) => path.join("changes", entry.name));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  const notes: string[] = [];
  for (const file of [...new Set(paths)].sort()) {
    if (!file.startsWith("changes/") || !file.endsWith(".md") || file === "changes/README.md") continue;
    try {
      const content = (await readFile(file, "utf8")).trim();
      if (content) notes.push(content);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return notes;
}

async function main(): Promise<void> {
  const previousDir = process.argv[2] ?? "previous-snapshot/dist";
  const nextDir = process.argv[3] ?? "dist";
  const sourceCommit = process.argv[4] ?? process.env.GITHUB_SHA ?? "local";
  const previous = await loadArtifacts(previousDir);
  const next = await loadArtifacts(nextDir);
  if (!next) throw new Error(`New snapshot not found in ${nextDir}`);

  const notes = await manualNotes(previousDir, sourceCommit);
  const report = generateSnapshotChangelog({
    previous,
    next,
    sourceCommit,
    manualNotes: notes,
  });
  const priorMarkdown = await readFile(path.join(previousDir, "CHANGELOG.md"), "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return "";
    throw error;
  });

  await mkdir(nextDir, { recursive: true });
  await writeFile(path.join(nextDir, "changelog.json"), JSON.stringify(report, null, 2) + "\n", "utf8");
  await writeFile(
    path.join(nextDir, "CHANGELOG.md"),
    renderChangelogMarkdown(report, priorMarkdown),
    "utf8",
  );
  console.log(`Generated changelog: ${report.summary.totalChanges} changes, ${notes.length} manual note(s).`);
}

main().catch((error) => {
  console.error("Failed to generate changelog:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
