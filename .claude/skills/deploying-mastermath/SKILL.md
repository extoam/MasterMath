---
name: deploying-mastermath
description: Use when publishing MasterMath to its live address (extoam.github.io/MasterMath), when asked to "deploy", "publish", "make it live" or "update the tablet", when the live site shows 404 or an old version, or when setting up GitHub Pages for this repository again.
---

# Deploying MasterMath

## Overview

The live app is the `gh-pages` branch of github.com/extoam/MasterMath, served by GitHub Pages at **https://extoam.github.io/MasterMath/**. A deploy is done only when `npm run check-live` passes: the live site then serves exactly the current commit.

## Deploy

```bash
git status -sb            # must be clean, on main, not ahead of origin
git push origin main      # if ahead
npm run deploy            # tests, build for /MasterMath/, force-push gh-pages
npm run check-live        # waits until the live site serves this commit
```

`npm run deploy` refuses to run with uncommitted changes or when HEAD is not `origin/main`. Fix that rather than bypassing it: the live app must always match a commit on GitHub.

Report the result from `check-live`, not from the push.

## What to tell the owner

- **Live within minutes:** about 1–2 minutes after the push, once `check-live` passes.
- **The tablet updates by itself:** the next time the app opens online, it downloads the new version in the background. Usually it shows on the following open; fully closing and reopening helps.
- **Her data is untouched:** a deploy never touches it. Never suggest clearing site data to force an update, because that erases her progress and handwriting.

## Quick reference

| Situation | Do |
|---|---|
| Live site 404 right after the first setup | Normal while Pages builds; `check-live` waits |
| `check-live` says NOT LIVE after 10 min | `gh api repos/extoam/MasterMath/pages/builds/latest --jq .status` |
| FAIL: assets not under `/MasterMath/` | Built without `BASE_PATH`; use `npm run deploy`, never plain `npm run build` + push |
| Roll back a bad version | `git revert <bad-commit>` on main → `git push` → `npm run deploy` → `npm run check-live` |
| Pages disabled / new repo | Repo must be **public** (free plan), then `gh api -X POST repos/extoam/MasterMath/pages -f "source[branch]=gh-pages" -f "source[path]=/"` |

## Common mistakes

- **Building with plain `npm run build`.** It targets `/`, so on Pages every asset 404s. Only `npm run deploy` sets `BASE_PATH=/MasterMath/`.
- **Calling it done after the push.** The push succeeding doesn't mean the site is serving it. `check-live` is the proof.
- **Deploying the development server's look.** The "Pretend it's tomorrow" button exists only in development builds and is never in a deploy; that is expected.
- **Making the repository private.** GitHub Pages stops on the free plan, and the live app goes offline for new installs.
