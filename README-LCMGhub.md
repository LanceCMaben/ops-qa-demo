# Operations QA (GitHub Pages snapshot)

Static snapshot of **Operations QA** from `3enrollment/eee_internal_insights` → `Ops_QA/`.

## Live site

**https://lancecmaben.github.io/ops-qa-demo/**

**Demo mode:** Run checks executes against synthetic Operations datasets (XHR/SQL shim). Results mirror real check logic where possible; some warn/fail outcomes are illustrative.

## Domo publish

`cd Ops_QA` → `npx --yes ryuu -m manifest.dev.json publish` (Dev) or `manifest.json` (Prod).