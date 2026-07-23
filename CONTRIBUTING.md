# Contributing

Thanks for helping make code-native design review better.

## Ground rules

- **Run the gates** before opening a PR: `pnpm check && pnpm check:size && pnpm audit:coverage && pnpm test`.
- **600 lines per file, max.** CI enforces it; split modules rather than exceed it.
- **Schema changes are breaking changes.** Anything touching `shared/changeSchema.ts` must update `docs/export-format.md` and the tests in the same PR.
- **Bug fixes ship with a test** that would have caught the bug (see `server/canvas.failures.test.ts` for the naming convention).
- **No external services.** The tool must keep working offline with zero API keys.

## Dev setup

```bash
pnpm install
pnpm dev   # http://localhost:3000
```

## Good first contributions

- Additional device frames (Android bezel, tablet, watch)
- More export targets (Linear, Jira, GitLab issue URLs)
- Accessibility lints (contrast checker on color edits)
- Android `codeRefs` workflow doc mirroring `docs/ios-workflow.md`

## Code style

Prettier (`pnpm format`) + TypeScript strict. Keep comments explaining *why*, not *what*.
