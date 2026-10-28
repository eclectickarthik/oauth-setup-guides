# Comparison: GitHub

The generated guide captures the basics of GitHub OAuth apps and correctly identifies the distinction between OAuth Apps and GitHub Apps, but misses specific setup nuances, blockers, and practical tips found in the answer key.

## Wrong (1)

- **[developerPortalUrl]** https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps
  - Developer portal URL should be https://github.com/settings/developers per the answer key.

## Outdated (0)

_None._

## Unsupported (not covered by the answer key) (0)

_None._

## Correct (4)

- **[time]** 15 minutes
  - Aligns reasonably with the answer key's 5-10 min estimate.
- **[steps]** Navigate to your GitHub account settings, go to Developer Settings > OAuth Apps, and click 'New OAuth App'.
  - Matches the navigation path in the answer key.
- **[steps]** Redirect users to https://github.com/login/oauth/authorize with client_id, optional redirect_uri, scopes, and state.
  - Standard GitHub OAuth behavior aligned with building OAuth apps.
- **[steps]** POST request to https://github.com/login/oauth/access_token with client_id, client_secret, and temporary code.
  - Standard GitHub code exchange endpoint.

## Missed from the hand-checked guide (7)

- **[accessCost]** Detailed rate limits (5,000 requests/hour for authenticated requests vs 60/hour for unauthenticated).
- **[requirements]** Specific requirement for a homepage URL and at least one redirect URI (up to 10 allowed).
- **[steps]** Step to review optional settings like wildcard matching, device flow, and token expiry.
- **[steps]** Step to generate and securely store the client secret immediately.
- **[blockers]** Mix-up between Homepage URL and callback URL.
- **[blockers]** Unexplained optional checkboxes on the form.
- **[blockers]** Inability to delete the only client secret without generating a second one first.
