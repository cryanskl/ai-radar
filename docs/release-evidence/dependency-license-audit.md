# Public Alpha dependency license audit

- Verified at: 2026-08-31T05:26:26Z
- Package manager: pnpm 10.30.2
- Command: `pnpm licenses list --json`
- Result: 538 packages across 14 recognized license groups, 0 unknown and 0 unlicensed.
- Recognized groups: 0BSD, Apache-2.0, BSD-2-Clause, BSD-3-Clause, BlueOak-1.0.0, CC-BY-4.0, CC0-1.0, ISC, LGPL-3.0-or-later, MIT, MIT-0, MPL-2.0, Python-2.0 and Unlicense.

This inventory establishes license identification for the installed dependency graph. It does not replace the license text distributed by each package or extend AI Radar's Apache-2.0 grant to third-party source material and public-data records.

The same release candidate passes `pnpm audit --audit-level high`. The audit may still report lower-severity advisories; this gate only establishes that no known high- or critical-severity dependency advisory remains at the recorded cutoff.
