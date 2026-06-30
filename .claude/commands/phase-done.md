Run all acceptance checks for the current phase before marking it complete.

Execute these in order:

**Step 1 — Type check**
```
npx tsc --noEmit
```
Must show 0 errors.

**Step 2 — Smoke test** (only from Phase 0 onward)
```
npx tsx scripts/smoke.ts
```
Must show 15/15.

**Step 3 — Dev server boots**
```
npm run dev
```
Must start without errors. Open http://localhost:3000 and confirm no console errors.

**Step 4 — Health endpoint** (Phase 0 onward)
```
curl http://localhost:3000/api/health
```
Must return { "ok": true }.

**Step 5 — Architecture check**
Search the codebase for any imports of kapruka-mcp outside src/adapters/:
```
grep -r "from 'kapruka-mcp'" src/agent src/core src/components src/lib app
```
Must return no results.

**Step 6 — Update CLAUDE.md**
Mark the completed phase as ✅ in the Phase Build Log table and add the key files built.

Only move to the next phase when ALL steps pass.
