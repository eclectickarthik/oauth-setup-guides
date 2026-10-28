# Comparison: Google

The generated guide focuses on general Google Workspace / Drive / Docs / Sheets APIs, whereas the answer key specifically focuses on the Gmail API via the Google Auth Platform. While much of the Google Cloud console setup process is structurally similar, the specific scopes, APIs enabled, and certain nuances (like the 7-day refresh token rule and the AI-powered agent client setting) differ between the two guides.

## Wrong (2)

- **[surface]** Google Workspace OAuth 2.0 (Docs, Drive, Sheets APIs)
  - The answer key covers Gmail API specifically, not Docs, Drive, or Sheets.
- **[scopes]** Minimum scope: drive.file; Optional scopes: documents, spreadsheets, drive
  - Generated guide uses Drive/Docs/Sheets scopes, whereas the answer key is for Gmail API scopes (gmail.readonly, gmail.send, gmail.modify, userinfo.email).

## Outdated (0)

_None._

## Unsupported (not covered by the answer key) (4)

- **[otherSurfaces]** Service Accounts and OpenID Connect
  - Answer key doesn't address service accounts or OIDC in otherSurfaces.
- **[approval]** External user type in Testing status issues refresh tokens expiring in 7 days.
  - Answer key does not mention the 7-day refresh token expiration rule for testing mode.
- **[blockers]** Refresh tokens expiring every 7 days in Testing mode
  - Not mentioned in the answer key blockers.
- **[blockers]** Inability to delete the OAuth consent screen
  - Not mentioned in the answer key blockers.

## Correct (4)

- **[summary]** Developers can integrate Google Workspace APIs by configuring an OAuth consent screen and client credentials...
  - Generally accurate description of Google's OAuth setup process.
- **[steps]** Create or Select a Google Cloud Project ... Configure the OAuth Consent Screen ... Add Test Users ... Configure Scopes ... Create OAuth Client Credentials
  - The general sequence of steps matches the Google Cloud console workflow described in the answer key.
- **[steps]** Step owners set to human during second pass verification
  - Aligned with the hand-checked guide's assignment of steps like creating projects and choosing audiences to the human.
- **[composioHandoff]** Provide your Google OAuth Client ID and Client Secret to Composio to finalize the integration.
  - Matches the core handoff requirement stated in the answer key.

## Missed from the hand-checked guide (8)

- **[surface]** The guide specifically covers Gmail API scopes via Google Auth Platform.
- **[decision]** The choice between Internal, External (Testing), and External (Production) with their specific tradeoffs and recommendations.
- **[setupTime]** Specific benchmarked setup time of 30-60 minutes based on hand-checked testing.
- **[approval]** Detailed breakdown of approval paths including the paid third-party security assessment (CASA) costing $500-$4,500 for restricted scopes like Gmail.
- **[cost]** Specific quota limits such as 1,200,000 quota units/minute per project and 6,000 units/minute per user.
- **[prerequisites]** Requirement that the specific Google API (e.g., Gmail API) must be enabled on the project before it can be used.
- **[steps]** Step regarding the 'AI-powered agent' client setting and its warning about being a one-way decision.
- **[blockers]** Specific error handling for Error 400 (redirect_uri_mismatch), Error 403 (access_denied), the 'Ineligible accounts not added' popup, and the logo-upload verification trigger.
