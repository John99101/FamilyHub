# Git workflow

## Project specifics
- Default branch: `main`
- Branch names: none; work happens on `main`
- Commit messages: a plain English sentence in the imperative ("Fix stock rows running out of the card on phones"), a short body for bigger changes
- Pull requests: none; the owner pushes and deploys

## Always
- Commit locally when a piece of work is finished and tested. Never push or deploy; the owner does that.
- Never commit to the default branch directly if it's protected; create a branch.
- One logical change per commit. Don't mix refactors with behaviour changes.
- Never rewrite published history (force-push, rebase of pushed branches) without asking.
- Check `git status` before committing; never commit secrets, build output or local config.
