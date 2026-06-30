Run the SDK smoke test to verify all 15 Kapruka tools are working.

Execute this command:
```
npx tsx scripts/smoke.ts
```

Expected output: "15/15 tools working"

If any tool fails:
1. Check COMMERCE_MODE in .env.local (mock vs live)
2. Check that KaprukaAdapter.create() completed without errors
3. Verify the warm-up call (list_categories) runs in the adapter init
4. Check pino logs for the specific tool error and SDK suggestion field

Do not proceed to the next phase until this shows 15/15.
