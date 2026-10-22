# Dependency maintenance — 2026-10-22

This maintenance change updates the affected direct dependencies and transitive
overrides while keeping the existing NestJS, Vite and TypeScript major versions.
Nodemailer moves from 9.x to 10.2.0 for its security fixes. Its Node.js 20 minimum
fits this project's existing runtime range; a loopback SMTP regression test checks
the configured transport and verification message without sending external mail.

The admin test build now returns its small login fixture directly instead of
importing the missing MockJS runtime. Neither `mockjs` nor its unused type package
is required. This also avoids introducing MockJS's unpatched prototype-pollution
advisory. The mock session identifier is demonstration data, not a credential.
The production build continues to disable mock routes.

Vue's updated model types require array defaults to use a factory; the image
upload component now creates a separate default array per instance. CI includes
both admin production and test-mode builds.

## Local braces mitigation and audit policy

Upstream `braces@3.0.3` still matches
[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
and has no published patched version as of 2026-10-22. Each package now carries
an identical pnpm patch at `patches/braces@3.0.3.patch`, registered by exact
version in `patchedDependencies` and by content hash in its lockfile.

The patch sets a fixed AST depth limit of 128. It checks brace and parenthesis
blocks before parser allocation, all three recursive walkers (including direct
AST/low-level entry points), and ancestor traversal in expand. Excess nesting
raises a controlled `SyntaxError` with a fixed diagnostic, like the existing
input-length validation. The parser accepts at most 127 nested blocks, leaving
room for leaf nodes within AST depth 128. Callers cannot disable this cap with
`maxLength`, `rangeLimit` or an options field. Ordinary quoting, escaping,
ranges and shallow/unclosed patterns retain their original semantics.

This addresses the named uncontrolled-recursion finding. It does not claim to
bound arbitrary user-supplied JavaScript callbacks, regex complexity or all
combinatorial expansion. Existing `rangeLimit` behavior remains unchanged.

`pnpm test:dependencies` verifies every real braces copy reachable through the installed
package links, including pnpm's isolated and hoisted layouts, under normal and reduced Node stack sizes. It rejects
unexpected versions, native stack-overflow exceptions and an absent installation.
Tests include deep brace/paren/mixed/unclosed patterns, parser-internal stringify,
direct ASTs, child/parent cycles, depth boundaries, legitimate glob patterns, and
actual chokidar or fast-glob consumers.

The upstream version-based advisory remains in raw registry data despite the
local fix. Only this GHSA is listed in `auditConfig.ignoreGhsas`; the existing
high-severity threshold is unchanged. CI runs the patch regression gate before
its audit, so removing or failing to apply the patch cannot silently leave a
green audit-only job. Do not add `--ignore-unfixable`, downgrade the threshold,
or broaden this exception. Remove the exception and local patch together when
an upstream fixed version is adopted, then refresh these tests and lockfiles.

The dependency graph is not exclusively development-classified: admin also has
`fast-glob > micromatch > braces` under its declared dependencies. The actual
Docker runtime copies only the pruned service dependencies and built frontend
assets. Dependency classification alone does not prove an HTTP-reachable path.

Docker copies patches before each frozen install and runs the same dependency
gate. `build.sh` also runs the gate and copies service patches into the flat
quick-deploy bundle so frozen production installs can resolve patch metadata.
Three copies of the patch are intentional: each package and the flat bundle
must remain installable without sibling-directory references.

Other low/moderate advisories remain. A successful high-threshold audit is not
an assertion that every dependency advisory has been eliminated. This change
contains no application release or tag.
