# Releasing

`kpm` is published to npm as `knowledge-package-manager` (the exposed binary is
`kpm`). Releases are cut from `main`.

## Checklist

1. Confirm `main` is green in CI (tests and typecheck on Node 20 and 22).
2. Update `CHANGELOG.md`: move the relevant `[Unreleased]` entries under a new
   version heading.
3. Bump the version (use a prerelease identifier while in alpha):

   ```bash
   npm version 2.0.0-alpha.2 --no-git-tag-version
   ```

4. Verify locally:

   ```bash
   npm ci
   npm test
   npm run typecheck
   npm pack --dry-run   # confirm dist/cli.js is present and contents look right
   ```

5. Commit the version bump and changelog, then tag and push:

   ```bash
   git commit -am "release: v2.0.0-alpha.2"
   git tag v2.0.0-alpha.2
   git push origin main --tags
   ```

6. Publish. The `prepublishOnly` gate builds and runs the test and typecheck
   suites before anything is uploaded:

   ```bash
   npm publish --access public --tag alpha
   ```

7. Create a GitHub release from the tag and paste in the changelog section.

## Notes

- The `prepare` script builds `dist/` automatically before `npm pack`/`npm publish`.
- Publish prerelease versions under the `alpha` dist-tag so `npm install` does not
  pick them up by default.
- Only `dist/**/*.js`, `README.md`, `LICENSE`, and `package.json` are published;
  double-check `npm pack --dry-run` if you change build output or the `files` list.
