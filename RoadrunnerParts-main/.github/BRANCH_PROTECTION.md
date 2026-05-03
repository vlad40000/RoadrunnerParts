# Required CI gate

Set **Provider Regression Gate / provider-regression** as a required status check on `main`.

Why:
- This makes provider regression block bad merges before deploy.
- The workflow already runs on `push` to `main`.
- You can also run it manually with `workflow_dispatch`.

Required repo settings:
- Secret: `GEMINI_API_KEY`
- Optional repository variables for model overrides:
  - `PROVIDER_REGRESSION_GE_MODEL`
  - `PROVIDER_REGRESSION_WHIRLPOOL_MODEL`
  - `PROVIDER_REGRESSION_FRIGIDAIRE_MODEL`
  - `PROVIDER_REGRESSION_LG_MODEL`
  - `PROVIDER_REGRESSION_SAMSUNG_MODEL`
  - `PROVIDER_REGRESSION_BOSCH_MODEL`
  - `PROVIDER_REGRESSION_HISENSE_MODEL`

## Nightly smoke run

The same workflow also runs nightly on a schedule.

Current schedule:
- `3:15 AM America/New_York`

Notes:
- Scheduled runs execute from the latest commit on the default branch.
- If this is a public repo and there is no repository activity for 60 days, GitHub can disable scheduled workflows automatically.
