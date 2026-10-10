export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type ChangeCategory =
  | "item-added"
  | "item-removed"
  | "field-added"
  | "field-removed"
  | "field-changed"
  | "localization-added"
  | "localization-removed"
  | "localization-changed"
  | "quality-added"
  | "quality-removed"
  | "quality-changed"
  | "meta-changed";

export type ChangelogEntry = {
  category: ChangeCategory;
  path: string;
  defindex?: number;
  language?: string;
  oldValue?: unknown;
  newValue?: unknown;
};

export type SnapshotArtifacts = {
  meta: Record<string, unknown>;
  items: Record<string, unknown>[];
  i18n: Record<string, Record<string, unknown>[]>;
  qualities: Record<string, Record<string, unknown>[]>;
};

export type ChangelogSummary = {
  addedItems: number;
  removedItems: number;
  updatedItems: number;
  addedFields: number;
  removedFields: number;
  changedFields: number;
  localizationChanges: number;
  qualityChanges: number;
  metaChanges: number;
  totalChanges: number;
};

export type SnapshotChangelog = {
  formatVersion: 1;
  generatedAt: string;
  sourceCommit: string;
  previousContentHash: string | null;
  contentHash: string;
  version: string;
  summary: ChangelogSummary;
  manualNotes: string[];
  changes: ChangelogEntry[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stableJson(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stableJson(value[key])}`,
    ).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function equal(a: unknown, b: unknown): boolean {
  return stableJson(a) === stableJson(b);
}

function indexedBy<T extends Record<string, unknown>>(
  entries: T[],
  key: string,
): Map<string, T> {
  return new Map(entries.map((entry) => [String(entry[key]), entry]));
}

function compareObjectFields(
  before: unknown,
  after: unknown,
  path: string,
  context: { defindex?: number; language?: string },
  categories: {
    added: ChangeCategory;
    removed: ChangeCategory;
    changed: ChangeCategory;
  },
  changes: ChangelogEntry[],
): void {
  if (equal(before, after)) return;
  if (isRecord(before) && isRecord(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
    for (const key of keys) {
      const childPath = path ? `${path}.${key}` : key;
      const hadBefore = Object.prototype.hasOwnProperty.call(before, key);
      const hasAfter = Object.prototype.hasOwnProperty.call(after, key);
      if (!hadBefore) {
        changes.push({
          category: categories.added,
          path: childPath,
          ...context,
          newValue: after[key],
        });
      } else if (!hasAfter) {
        changes.push({
          category: categories.removed,
          path: childPath,
          ...context,
          oldValue: before[key],
        });
      } else {
        compareObjectFields(before[key], after[key], childPath, context, categories, changes);
      }
    }
    return;
  }
  changes.push({
    category: categories.changed,
    path,
    ...context,
    oldValue: before,
    newValue: after,
  });
}

function compareLocalizedEntries(
  previous: Record<string, Record<string, unknown>[]>,
  next: Record<string, Record<string, unknown>[]>,
  key: "defindex" | "quality",
  prefix: "i18n" | "qualities",
  changes: ChangelogEntry[],
): void {
  const languages = [...new Set([...Object.keys(previous), ...Object.keys(next)])].sort();
  for (const language of languages) {
    const before = indexedBy(previous[language] ?? [], key);
    const after = indexedBy(next[language] ?? [], key);
    const ids = [...new Set([...before.keys(), ...after.keys()])].sort(
      (a, b) => Number(a) - Number(b),
    );
    for (const id of ids) {
      const oldEntry = before.get(id);
      const newEntry = after.get(id);
      const numericId = Number(id);
      const context = prefix === "i18n"
        ? { defindex: numericId, language }
        : { language };
      const identityPath = prefix === "i18n"
        ? `i18n.${language}.items[${id}]`
        : `i18n.${language}.qualities[${id}]`;
      if (!oldEntry && newEntry) {
        changes.push({
          category: prefix === "i18n" ? "localization-added" : "quality-added",
          path: identityPath,
          ...context,
          newValue: newEntry,
        });
      } else if (oldEntry && !newEntry) {
        changes.push({
          category: prefix === "i18n" ? "localization-removed" : "quality-removed",
          path: identityPath,
          ...context,
          oldValue: oldEntry,
        });
      } else if (oldEntry && newEntry) {
        compareObjectFields(
          oldEntry,
          newEntry,
          identityPath,
          context,
          prefix === "i18n"
            ? {
                added: "localization-changed",
                removed: "localization-changed",
                changed: "localization-changed",
              }
            : {
                added: "quality-changed",
                removed: "quality-changed",
                changed: "quality-changed",
              },
          changes,
        );
      }
    }
  }
}

function summarize(changes: ChangelogEntry[]): ChangelogSummary {
  const addedItems = changes.filter((c) => c.category === "item-added").length;
  const removedItems = changes.filter((c) => c.category === "item-removed").length;
  const updatedItems = new Set(
    changes.filter((c) => c.defindex !== undefined &&
      !["item-added", "item-removed"].includes(c.category)).map((c) => c.defindex),
  ).size;
  const addedFields = changes.filter((c) => c.category === "field-added").length;
  const removedFields = changes.filter((c) => c.category === "field-removed").length;
  const changedFields = changes.filter((c) => c.category === "field-changed").length;
  const localizationChanges = changes.filter((c) => c.category.startsWith("localization-")).length;
  const qualityChanges = changes.filter((c) => c.category.startsWith("quality-")).length;
  const metaChanges = changes.filter((c) => c.category === "meta-changed").length;
  return {
    addedItems,
    removedItems,
    updatedItems,
    addedFields,
    removedFields,
    changedFields,
    localizationChanges,
    qualityChanges,
    metaChanges,
    totalChanges: changes.length,
  };
}

export function generateSnapshotChangelog(input: {
  previous: SnapshotArtifacts | null;
  next: SnapshotArtifacts;
  sourceCommit: string;
  manualNotes?: string[];
  generatedAt?: string;
}): SnapshotChangelog {
  const { previous, next } = input;
  const changes: ChangelogEntry[] = [];
  const beforeItems = indexedBy(previous?.items ?? [], "defindex");
  const afterItems = indexedBy(next.items, "defindex");
  const ids = [...new Set([...beforeItems.keys(), ...afterItems.keys()])].sort(
    (a, b) => Number(a) - Number(b),
  );

  for (const id of ids) {
    const before = beforeItems.get(id);
    const after = afterItems.get(id);
    const defindex = Number(id);
    if (!before && after) {
      changes.push({ category: "item-added", path: `items[${id}]`, defindex, newValue: after });
    } else if (before && !after) {
      changes.push({ category: "item-removed", path: `items[${id}]`, defindex, oldValue: before });
    } else if (before && after) {
      compareObjectFields(
        before,
        after,
        `items[${id}]`,
        { defindex },
        { added: "field-added", removed: "field-removed", changed: "field-changed" },
        changes,
      );
    }
  }

  compareLocalizedEntries(previous?.i18n ?? {}, next.i18n, "defindex", "i18n", changes);
  compareLocalizedEntries(previous?.qualities ?? {}, next.qualities, "quality", "qualities", changes);

  const ignoredMeta = new Set(["builtAt", "contentHash", "formatVersion"]);
  const beforeMeta = Object.fromEntries(
    Object.entries(previous?.meta ?? {}).filter(([key]) => !ignoredMeta.has(key)),
  );
  const nextMeta = Object.fromEntries(
    Object.entries(next.meta).filter(([key]) => !ignoredMeta.has(key)),
  );
  compareObjectFields(
    beforeMeta,
    nextMeta,
    "meta",
    {},
    { added: "meta-changed", removed: "meta-changed", changed: "meta-changed" },
    changes,
  );

  changes.sort((a, b) =>
    a.path.localeCompare(b.path) || a.category.localeCompare(b.category),
  );
  const contentHash = String(next.meta.contentHash ?? "");
  return {
    formatVersion: 1,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    sourceCommit: input.sourceCommit,
    previousContentHash: previous ? String(previous.meta.contentHash ?? "") : null,
    contentHash,
    version: String(next.meta.version ?? "unknown"),
    summary: summarize(changes),
    manualNotes: input.manualNotes ?? [],
    changes,
  };
}

function displayValue(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (text === undefined) return "undefined";
  return text.length > 100 ? `${text.slice(0, 97)}…` : text;
}

function titleFor(category: ChangeCategory): string {
  const titles: Record<ChangeCategory, string> = {
    "item-added": "Item added",
    "item-removed": "Item removed",
    "field-added": "Field added",
    "field-removed": "Field removed",
    "field-changed": "Field changed",
    "localization-added": "Translation added",
    "localization-removed": "Translation removed",
    "localization-changed": "Translation changed",
    "quality-added": "Quality label added",
    "quality-removed": "Quality label removed",
    "quality-changed": "Quality label changed",
    "meta-changed": "Snapshot metadata changed",
  };
  return titles[category];
}

export function renderChangelogMarkdown(
  report: SnapshotChangelog,
  previousMarkdown = "",
): string {
  const date = report.generatedAt.slice(0, 10);
  const s = report.summary;
  const lines = [
    `## ${report.version} — ${date}`,
    "",
    `- Items: **+${s.addedItems} added**, **-${s.removedItems} removed**, **${s.updatedItems} updated**.`,
    `- Fields: **+${s.addedFields} added**, **-${s.removedFields} removed**, **${s.changedFields} changed**.`,
    `- Localization changes: **${s.localizationChanges}**; quality-label changes: **${s.qualityChanges}**.`,
    `- Metadata changes: **${s.metaChanges}**.`,
    "",
    "### Manual release notes",
    "",
  ];
  if (report.manualNotes.length) {
    for (const note of report.manualNotes) lines.push(note.trim(), "");
  } else {
    lines.push("No manual notes for this data release.", "");
  }

  lines.push("### Automatic schema diff", "");
  if (report.changes.length === 0) {
    lines.push("No field-level differences were found; only release metadata changed.", "");
  } else {
    for (const change of report.changes.slice(0, 30)) {
      let detail = `- **${titleFor(change.category)}** — \`${change.path}\``;
      if (change.category.endsWith("changed") || change.category === "field-changed") {
        detail += `: ${displayValue(change.oldValue)} → ${displayValue(change.newValue)}`;
      }
      lines.push(detail);
    }
    if (report.changes.length > 30) {
      lines.push("", `Full details: ${report.changes.length - 30} additional changes are available in ` + "`changelog.json`.");
    }
    lines.push("");
  }
  lines.push(`Source commit: \`${report.sourceCommit.slice(0, 12)}\``, "");

  const prior = previousMarkdown.trim();
  if (!prior) return `# TF2 Schema Snapshot Changelog\n\n${lines.join("\n")}\n`;
  const priorBody = prior.replace(/^# TF2 Schema Snapshot Changelog\s*/, "");
  return `# TF2 Schema Snapshot Changelog\n\n${lines.join("\n")}\n${priorBody.trim()}\n`;
}
