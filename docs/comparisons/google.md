# Comparison: Google

The generated guide provides a reasonable high-level overview of Google OAuth, but misses several critical operational details found in the hand-checked guide, such as the distinction between internal/external/testing modes, the trap of uploading a logo triggering verification, the specific 100-test-user limit, and the 'AI-powered agent' client setting warning.

## Wrong (1)

- **[difficulty]** medium
  - Hand-checked guide rates difficulty as 'hard' due to complex verification and CASA security assessment requirements for restricted scopes.

## Outdated (0)

_None._

## Unsupported (not covered by the answer key) (3)

- **[whenReviewIsNeeded]** If testing an app configured in 'Testing' publishing status with external users, refresh tokens expire in 7 days unless restricted to basic profile/email scopes.
  - The answer key does not mention the 7-day token expiration rule for testing mode.
- **[requirements]** For restricted scopes (e.g., broad Drive file access), apps must fall into approved categories (Backup and sync, Productivity and education, or Reporting and security).
  - The answer key does not mention specific approved scope categories.
- **[blockers]** Refresh tokens issued to apps in 'Testing' mode for external users expire after 7 days.
  - The answer key does not mention this blocker.

## Correct (15)

- **[difficultyReason]** Setting up credentials and code is straightforward, but public apps requesting sensitive or restricted scopes must undergo Google's OAuth app verification and security assessments, which can take days to weeks.
  - Accurately reflects the core reason for difficulty regarding verification and security assessments.
- **[time.setup]** 15-30 minutes to configure project, consent screen, and client credentials.
  - Roughly aligns with the hand-checked guide's 30-60 min estimate.
- **[time.approvalWait]** A few hours to several days (or longer for restricted scopes / security assessments).
  - Generally aligns with the hand-checked guide's timeline descriptions.
- **[accessCost]** Google Cloud Console projects are generally free to set up and use for basic API access, but individual Google APIs may have usage limits, quotas, or billing requirements...
  - Aligns with the hand-checked guide regarding free quotas and potential billing terms.
- **[whenReviewIsNeeded]** If your public application uses scopes that permit access to certain user data (sensitive or restricted scopes), it must complete an OAuth verification process.
  - Matches answer key requirement for sensitive/restricted scope verification.
- **[whenReviewIsNeeded]** If your app stores restricted scope data on servers or transmits it, you must go through a security assessment.
  - Matches answer key requirements for restricted scopes.
- **[requirements]** A Google Account and access to the Google API Console / Google Cloud Console.
  - Matches answer key requirement for a Google Cloud project/account.
- **[requirements]** Configured OAuth consent screen with declared scopes and application details.
  - Matches answer key requirements for Branding.
- **[requirements]** Authorized redirect URIs registered in the Google API Console matching your application endpoints.
  - Matches answer key requirements for client setup.
- **[steps]** Start building: Enable APIs in your project
  - Matches the 'Enable the APIs you need' step in the answer key.
- **[steps]** Start building: Configure the OAuth consent screen
  - Matches the Branding setup step.
- **[steps]** Start building: Create OAuth client credentials
  - Matches the OAuth client creation step.
- **[steps]** Start building: Implement authorization flow in your code
  - Matches the authorization flow step.
- **[steps]** Go live: Submit app for verification
  - Matches the verification submission step.
- **[blockers]** Redirect URI mismatch error during authorization.
  - Matches Error 400: redirect_uri_mismatch in the answer key.

## Missed from the hand-checked guide (5)

- **[decision / Audience]** The distinction between Internal (Workspace org only) and External (Testing vs Production) publishing audiences, including the 100 test user limit for External Testing mode.
- **[blockers / Branding]** The specific warning that uploading a logo to Branding triggers verification even for basic scopes.
- **[steps / Client settings]** The warning about the 'Use this client for an AI-powered agent' checkbox being a non-reversible/high-impact decision.
- **[blockers]** The 'Ineligible accounts not added' test user popup quirk.
- **[time.approvalWait]** The specific requirement for restricted scopes like Gmail to undergo a paid third-party security assessment (CASA) costing $500-$4,500 that repeats annually.
