# Manual release notes

Add one Markdown file per consumer-visible code change, for example:

`changes/fix-icon-url.md`

Write short notes in plain language, focused on what a consumer needs to know. You may use headings and bullet points. Do not include commit hashes or repeat implementation details.

These notes are included in the next published snapshot changelog when the schema content changes. A note is consumed by commit range: do not edit or reuse an old note for a later change; create a new file instead. If a code change does not alter the published snapshot, its note stays queued until a data snapshot is published.

The generated `dist/CHANGELOG.md` keeps release history, while `dist/changelog.json` contains the full machine-readable diff.
