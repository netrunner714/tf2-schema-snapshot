# Security Policy

## Supported Versions

Snapshot artifacts are versioned by build date and content hash
(`meta.json`). Only the artifacts on the current `snapshot-release`
branch receive updates; historical versions are immutable and provided
as-is.

| Source | Supported |
| --- | --- |
| `snapshot-release` branch (latest) | :white_check_mark: |
| Pinned commit SHAs of `snapshot-release` | Immutable, as-is |
| npm `tf2-schema-snapshot@latest` / `@snapshot` | :white_check_mark: |

## Reporting a Vulnerability

To report a security issue in this repository (the snapshot builder, its
GitHub Actions workflow, or published artifacts), use GitHub's private
vulnerability reporting:

1. Go to the **Security** tab of this repository.
2. Select **Report a vulnerability**.

Please include a description of the issue, reproduction steps and, if
applicable, the affected artifact `meta.json` (version + content hash).

You can expect an acknowledgement within a few days. Confirmed issues
are fixed in the next workflow run; artifact corruption is fixed by
rebuilding the snapshot, which replaces the `snapshot-release` branch.

## What this repository does NOT handle

The data itself originates from Steam's public Web API (`items_game.txt`,
`GetSchemaItems`, `GetSchemaOverview`). It contains no secrets by
construction: the Steam API key is injected only into the GitHub Actions
runtime and never reaches any artifact. Secret scanning alerts on the
data are expected to be false positives of token-shaped substrings inside
Steam's own payloads.
