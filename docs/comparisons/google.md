# Comparison: Google

The generated guide provides a well-structured, comprehensive overview of Google Gmail OAuth integration, closely aligning with the answer key on major workflow concepts, verification paths, and Composio handoff. Minor discrepancies exist around setup times, scope categorization, and specific edge cases (such as the 7-day refresh token expiration vs. test user setup).

## Wrong (0)

_None._

## Outdated (0)

_None._

## Unsupported (not covered by the answer key) (1)

- **[scopes.minimum]** https://www.googleapis.com/auth/gmail.send in minimum scopes
  - The answer key puts send under optional scopes, while the generated guide lists it as minimum; the answer key does not explicitly forbid this classification choice.

## Correct (6)

- **[summary]** Integrating Google Gmail via OAuth requires registering an app in the Google API Console, configuring the OAuth consent screen with proper branding and authorized domains, selecting minimum necessary scopes, and passing Google's verification process if sensitive or restricted scopes are requested.
  - Accurately summarizes the core workflow steps and requirements outlined in the answer key.
- **[setupTime]** 1 to 4 weeks (depending on review and security assessment requirements)
  - Reflects the actual timelines for production review and security assessments mentioned in the answer key, even though initial testing is faster.
- **[approval.paths]** Internal / Testing Use: If the app user type is set to Internal or restricted to test users, no Google review is required, but refresh tokens for external testing accounts expire in 7 days.
  - Matches the non-review status for testing mode, though the 7-day expiration is a known Google external testing quirk.
- **[scopes.optional]** https://www.googleapis.com/auth/gmail.full included as an optional scope
  - Gmail restricted full access scope is accurately recognized as a restricted scope option.
- **[blockers]** Refresh tokens expiring in 7 days during testing.
  - Acknowledges a well-known Google OAuth external test user constraint when apps remain in testing status.
- **[composioHandoff]** Register https://backend.composio.dev/api/v3/toolkits/auth/callback as the authorized redirect URI in your Google OAuth client, then in Composio's dashboard select the Google Gmail OAuth2 scheme, enable 'Use your own developer credentials', and enter your Client ID, Client Secret, and that exact redirect URI.
  - Precisely matches the Composio handoff procedure described in the answer key.

## Missed from the hand-checked guide (2)

- **[steps]** The hand-checked guide highlights the 'Use this client for an AI-powered agent' checkbox decision as a critical one-way configuration choice on the OAuth client page.
- **[blockers]** The hand-checked guide details specific UI error messages and behaviors like Error 400 redirect_uri_mismatch, Error 403 access_denied, and the Branding logo-upload verification trigger.
