# Comparison: GitHub

The generated guide captures the core flow of creating a GitHub OAuth App, but misses several important details present in the hand-checked guide (such as specific scope default behaviors, optional form checkboxes, and common user pitfalls like confusing homepage URL with callback URL).

## Wrong (2)

- **[scopes.minimum]** read:user is a minimum scope for GitHub OAuth Apps.
  - Answer key notes that GitHub OAuth Apps actually default to read access on public data with no scope required at all.
- **[scopes.optional]** offline_access is an optional scope for GitHub OAuth Apps.
  - Answer key does not list offline_access; GitHub uses an 'Expire user access tokens' setting rather than an offline_access scope to issue refresh tokens.

## Outdated (0)

_None._

## Unsupported (not covered by the answer key) (0)

_None._

## Correct (0)

_None._

## Missed from the hand-checked guide (5)

- **[decision]** The entire decision section comparing OAuth App vs. GitHub App and their respective use cases/tradeoffs was omitted.
- **[prerequisites]** Missing the requirement for a homepage URL and the limit of up to 10 redirect URIs per OAuth App.
- **[steps]** Missing Step 3 covering the review of optional settings (wildcard matching, device flow, token expiry).
- **[blockers]** Missing blockers regarding the homepage URL vs. callback URL confusion, unverified optional checkboxes, and the inability to delete the only client secret.
- **[openQuestions]** The entire openQuestions section noting unverified details was omitted.
