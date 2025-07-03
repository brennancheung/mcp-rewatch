# Publishing Checklist

## Pre-publish Checklist
- [x] LICENSE file with correct year (2025)
- [x] README.md with proper documentation
- [x] package.json with all required fields
- [x] .gitignore for git
- [x] .npmignore to exclude unnecessary files from npm
- [x] bin field pointing to executable with shebang
- [x] Repository URLs updated to correct GitHub username
- [x] Tests passing (`pnpm test`)
- [x] Build successful (`pnpm build`)
- [x] No sensitive information in code

## Publishing to GitHub

```bash
git add .
git commit -m "Initial release of MCP Rewatch"
git remote add origin https://github.com/brennancheung/mcp-rewatch.git
git push -u origin main
```

## Publishing to npm

1. Make sure you're logged in to npm:
```bash
npm login
```

2. Publish the package:
```bash
npm publish
```

Or with pnpm:
```bash
pnpm publish
```

## Post-publish

1. Create a GitHub release with release notes
2. Test installation: `npm install -g mcp-rewatch`
3. Test with Claude Code
4. Share in MCP community channels

## Version Bumping

For future releases:
```bash
npm version patch  # 1.0.0 -> 1.0.1
npm version minor  # 1.0.1 -> 1.1.0
npm version major  # 1.1.0 -> 2.0.0
```