Run the TypeScript compiler to check for type errors across the entire project.

Execute this command:
```
npx tsc --noEmit
```

Expected output: silence (0 errors).

If there are errors, fix ALL of them before continuing. Common issues:
- Missing return types on async functions
- `any` types (not allowed — use `unknown` and narrow)
- Non-null assertions `!` (not allowed — use proper guards)
- Importing from kapruka-mcp outside src/adapters/ (architecture violation)
- Missing .js extension on local ESM imports

Do not commit code with type errors.
