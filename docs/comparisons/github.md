# Comparison: GitHub

The generated guide closely mirrors the answer key on general OAuth setup mechanics, but differs in scope definitions (inventing 'offline_access' which isn't how GitHub handles refresh tokens—GitHub uses token expiry settings instead) and misses several key blockers and advanced configuration details like wildcard matching, device flow toggles, and homepage URL mistakes.

## Wrong (2)

- **[scopes.minimum]** read:user is a minimum required scope for GitHub OAuth Apps
  - Answer key notes that GitHub OAuth Apps default to read access on public data with no explicit scope required.
- **[scopes.optional]** offline_access is an optional scope for GitHub OAuth Apps
  - GitHub does not use an 'offline_access' scope; refresh tokens are controlled via the 'Expire user access tokens' setting in the app configuration.

## Outdated (0)

_None._

## Unsupported (not covered by the answer key) (0)

_None._

## Correct (0)

_None._

## Missed from the hand-checked guide (5)

- **[decision]** The choice between OAuth App and GitHub App, along with their specific trade-offs and when to pick each.
- **[setupTime]** The estimated setup time of 5-10 minutes.
- **[steps]** Step regarding reviewing optional settings like wildcard matching, device flow, and token expiry.
- **[blockers]** The blocker regarding accidentally putting the callback URL in the Homepage URL field.
- **[blockers]** The blocker regarding the inability to delete your only client secret.
