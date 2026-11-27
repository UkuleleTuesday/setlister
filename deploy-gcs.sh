#!/usr/bin/env bash
# One-time, idempotent GCP setup for CI deploys, run by a project admin. CI uses
# Workload Identity Federation, so there are no keys or GitHub secrets.
set -euo pipefail

cd "$(dirname "$0")"

# Non-secret config, shared with CI.
set -a
# shellcheck disable=SC1091
source .env.deploy
set +a

# The GitHub repo allowed to impersonate the deployer SA.
REPO="UkuleleTuesday/setlister"

# Derived from the provider path (projects/<number>/...) to keep one source of truth.
PROJECT_NUMBER="$(sed -n 's#^projects/\([0-9]*\)/.*#\1#p' <<<"$GCP_WORKLOAD_IDENTITY_PROVIDER")"

# The function runs as the default compute service account.
COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

echo "Project:      $GCP_PROJECT_ID ($PROJECT_NUMBER)"
echo "Deployer SA:  $GCP_DEPLOYER_SERVICE_ACCOUNT"
echo "Repo:         $REPO"
echo

if ! gcloud iam service-accounts describe "$GCP_DEPLOYER_SERVICE_ACCOUNT" \
  --project="$GCP_PROJECT_ID" >/dev/null 2>&1; then
  gcloud iam service-accounts create setlister-deployer \
    --project="$GCP_PROJECT_ID" --display-name="setlister CI deployer"
fi

gcloud projects add-iam-policy-binding "$GCP_PROJECT_ID" \
  --member="serviceAccount:$GCP_DEPLOYER_SERVICE_ACCOUNT" \
  --role=roles/cloudfunctions.admin

# deploy-rules: firebase-tools also needs to read the Firebase project config.
gcloud projects add-iam-policy-binding "$GCP_PROJECT_ID" \
  --member="serviceAccount:$GCP_DEPLOYER_SERVICE_ACCOUNT" \
  --role=roles/firebaserules.admin
gcloud projects add-iam-policy-binding "$GCP_PROJECT_ID" \
  --member="serviceAccount:$GCP_DEPLOYER_SERVICE_ACCOUNT" \
  --role=roles/firebase.viewer

# Deploying a function that runs as COMPUTE_SA.
gcloud iam service-accounts add-iam-policy-binding "$COMPUTE_SA" \
  --project="$GCP_PROJECT_ID" \
  --member="serviceAccount:$GCP_DEPLOYER_SERVICE_ACCOUNT" \
  --role=roles/iam.serviceAccountUser

if ! gcloud iam workload-identity-pools describe github \
  --project="$GCP_PROJECT_ID" --location=global >/dev/null 2>&1; then
  gcloud iam workload-identity-pools create github \
    --project="$GCP_PROJECT_ID" --location=global \
    --display-name="GitHub Actions"
fi

if ! gcloud iam workload-identity-pools providers describe github-oidc \
  --project="$GCP_PROJECT_ID" --location=global \
  --workload-identity-pool=github >/dev/null 2>&1; then
  gcloud iam workload-identity-pools providers create-oidc github-oidc \
    --project="$GCP_PROJECT_ID" --location=global \
    --workload-identity-pool=github --display-name="GitHub OIDC" \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
    --attribute-condition="assertion.repository_owner == 'UkuleleTuesday'"
fi

gcloud iam service-accounts add-iam-policy-binding \
  "$GCP_DEPLOYER_SERVICE_ACCOUNT" \
  --project="$GCP_PROJECT_ID" \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github/attribute.repository/${REPO}"

# The function's runtime access.
gcloud projects add-iam-policy-binding "$GCP_PROJECT_ID" \
  --member="serviceAccount:$COMPUTE_SA" \
  --role=roles/aiplatform.user
gcloud projects add-iam-policy-binding "$GCP_PROJECT_ID" \
  --member="serviceAccount:$COMPUTE_SA" \
  --role=roles/cloudtrace.agent

echo
echo "Done."
