import test from "node:test";
import assert from "node:assert/strict";
import {
  generateSnapshotChangelog,
  renderChangelogMarkdown,
  type SnapshotArtifacts,
} from "./changelog.js";

function artifacts(overrides: Partial<SnapshotArtifacts> = {}): SnapshotArtifacts {
  return {
    meta: { version: "v1-test", contentHash: "hash-a", itemCount: 1, builtAt: "2026-01-01" },
    items: [{ defindex: 10, name: "Item", schemaData: { prefab: "tool" } }],
    i18n: { ru: [{ defindex: 10, name: "Предмет" }] },
    qualities: { en: [{ quality: 6, name: "Unique" }] },
    ...overrides,
  };
}

test("changelog records added, removed, and changed item fields", () => {
  const previous = artifacts();
  const next = artifacts({
    meta: { ...previous.meta, contentHash: "hash-b", itemCount: 2 },
    items: [
      { defindex: 10, name: "Renamed item", schemaData: { prefab: "tool", new_field: true } },
      { defindex: 11, name: "New item" },
    ],
  });
  const report = generateSnapshotChangelog({
    previous,
    next,
    sourceCommit: "1234567890abcdef",
    generatedAt: "2026-10-11T00:00:00.000Z",
  });

  assert.equal(report.summary.addedItems, 1);
  assert.equal(report.summary.updatedItems, 1);
  assert.equal(report.summary.addedFields, 1);
  assert.ok(report.changes.some((change) => change.path === "items[10].name" && change.category === "field-changed"));
  assert.ok(report.changes.some((change) => change.path === "items[10].schemaData.new_field" && change.category === "field-added"));
  assert.ok(report.changes.some((change) => change.category === "item-added" && change.defindex === 11));
});

test("changelog records removals and localization/quality changes", () => {
  const previous = artifacts();
  const next = artifacts({
    items: [],
    i18n: { ru: [{ defindex: 10, name: "Другой перевод" }] },
    qualities: { en: [{ quality: 6, name: "Different" }] },
  });
  const report = generateSnapshotChangelog({ previous, next, sourceCommit: "abcdef" });
  assert.equal(report.summary.removedItems, 1);
  assert.ok(report.changes.some((change) => change.category === "localization-changed"));
  assert.ok(report.changes.some((change) => change.category === "quality-changed"));
});

test("changelog ignores volatile build timestamp and content hash", () => {
  const previous = artifacts();
  const next = artifacts({
    meta: { ...previous.meta, builtAt: "2026-01-02", contentHash: "hash-b" },
  });
  const report = generateSnapshotChangelog({ previous, next, sourceCommit: "abcdef" });
  assert.equal(report.summary.totalChanges, 0);
});

test("markdown includes manual notes and prepends the newest release", () => {
  const report = generateSnapshotChangelog({
    previous: null,
    next: artifacts(),
    sourceCommit: "1234567890abcdef",
    manualNotes: ["- Fixed item icon URL handling."],
    generatedAt: "2026-10-11T00:00:00.000Z",
  });
  const markdown = renderChangelogMarkdown(report, "# TF2 Schema Snapshot Changelog\n\n## v1-old — 2026-10-01\n\nOld release.\n");
  assert.ok(markdown.startsWith("# TF2 Schema Snapshot Changelog\n\n## v1-test — 2026-10-11"));
  assert.ok(markdown.includes("Fixed item icon URL handling."));
  assert.ok(markdown.includes("## v1-old — 2026-10-01"));
});
