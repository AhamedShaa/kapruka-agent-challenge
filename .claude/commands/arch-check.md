Verify the ports & adapters architecture is not being violated anywhere.

Run these checks:

**1. No direct SDK imports outside the adapter**
```
grep -rn "from 'kapruka-mcp'" src/agent src/core src/components src/lib app
grep -rn "from 'kapruka-mcp/local'" src/agent src/core src/components src/lib app
```
Both must return no results.

**2. No new SqliteStorage() calls (ESM incompatible)**
```
grep -rn "new SqliteStorage(" src
```
Must return no results. Only SqliteStorage.create() is allowed.

**3. CommercePort is the only type import agents use**
```
grep -rn "import.*kapruka-mcp" src/agent
```
Must return no results.

**4. No console.log in production code**
```
grep -rn "console\.log" src app
```
Should return no results (use pino logger instead).

**5. All route handlers use Node runtime**
```
grep -rn "runtime = 'edge'" app
```
Must return no results (agent streaming requires Node runtime, not Edge).

Fix any violations before continuing.
