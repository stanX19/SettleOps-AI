# PR Creator & Git Commit Convention

This skill helps you write conventional commit messages and create pull requests using the GitHub CLI (`gh`).

---

## Step 0: Detect Current Branch

Before anything else, run:

```bash
git branch --show-current
```

- Store the result as `<branch-name>` and use it in all subsequent steps.
- If the current branch is `main` or `master`, **stop and warn the user** — PRs should not be created from the base branch. Suggest they create or switch to a feature branch first.
- Also run `git status` to check for uncommitted changes.

## Step 1: Analyze Changes

Run `git diff --stat` and `git diff` (or `git diff --cached` if staged) to understand what changed. Categorize each change.

## Step 2: Write Conventional Commit Messages

Use the **Conventional Commits** format:

```
<type>(<scope>): <short summary>
```

### Commit Types

| Type         | When to Use                                              |
|--------------|----------------------------------------------------------|
| `feat`       | A new feature or user-facing functionality               |
| `fix`        | A bug fix                                                |
| `refactor`   | Code restructuring with no behavior change               |
| `style`      | Formatting, whitespace, missing semicolons (no logic)    |
| `docs`       | Documentation only changes                               |
| `test`       | Adding or updating tests                                 |
| `chore`      | Build process, dependencies, tooling, CI config          |
| `perf`       | Performance improvements                                 |
| `ci`         | CI/CD pipeline changes                                   |
| `build`      | Build system or external dependency changes              |
| `revert`     | Reverting a previous commit                              |

### Rules

- `<scope>` is optional but recommended (e.g., `feat(auth):`, `fix(api):`, `refactor(sidebar):`).
- Summary must be lowercase, imperative mood, no period at end, max ~72 chars.
- If multiple logical changes exist, split into separate commits.
- Use a blank line + body for additional context when the summary alone isn't enough.
- Add `BREAKING CHANGE:` in the footer or `!` after the type for breaking changes.

### Examples

```
feat(chat): add dark mode logo switching
fix(api): handle 404 response in case lookup
refactor(sidebar): extract NavItem into shared component
docs(readme): add QA testing documentation reference
chore(deps): upgrade next.js to 15.3
style(chat): remove trailing whitespace
```

## Step 3: Stage and Commit

```bash
git add <files>
git commit -m "<type>(<scope>): <summary>"
```

For multi-line commit messages:

```bash
git commit -m "<type>(<scope>): <summary>" -m "<body>"
```

## Step 4: Push Branch

```bash
git push origin <branch-name>
```

If the branch doesn't exist on remote yet:

```bash
git push -u origin <branch-name>
```

## Step 5: Create Pull Request with `gh`

Use this standard PR template:

```bash
gh pr create \
  --base main \
  --head <branch-name> \
  --title "<type>(<scope>): <short summary>" \
  --body "## Summary
<1-2 sentence overview of what this PR does and why>

## Changes
- <bullet point of each logical change>
- <bullet point>

## Type of Change
- [ ] feat: New feature
- [ ] fix: Bug fix
- [ ] refactor: Code refactor
- [ ] style: Formatting/whitespace
- [ ] docs: Documentation
- [ ] test: Tests
- [ ] chore: Maintenance

## Testing
<How was this tested? Manual steps or test commands>

## Screenshots (if applicable)
<Paste screenshots or remove this section>
"
```

### Quick PR (no body editor):

```bash
gh pr create --base main --head <branch-name> --title "<type>(<scope>): <summary>" --fill
```

### PR with Reviewers and Labels:

```bash
gh pr create \
  --base main \
  --head <branch-name> \
  --title "<type>(<scope>): <summary>" \
  --body "<body>" \
  --reviewer <github-username> \
  --label "<label>"
```

## Workflow Checklist

1. Review changes with `git diff --stat`
2. Group related changes into logical commits
3. Write conventional commit message for each
4. Push the branch
5. Create PR with the template above
6. Confirm PR link is returned by `gh`

## Final Output

After the PR is created successfully, always end with:

```
PR link: <the URL returned by gh pr create>
```
