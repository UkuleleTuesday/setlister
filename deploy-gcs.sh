#!/usr/bin/env bash
#
# One-time GCP setup for CI deployment of setlister.
#
# CI authenticates to GCP with Workload Identity Federation — GitHub mints a
# short-lived OIDC token that GCP exchanges for deployer-SA credentials, so
# there are no keys and no GitHub secrets/variables to configure. A project
# admin runs this script once. It is idempotent: re-running skips resources
# that already exist.
#
# Config (project, region, deployer SA, WIF provider) is read from .env.deploy.
#
# Usage:
#   ./deploy-gcs.sh
#
set -euo pipefail

cd "$(dirname "$0")"

# Load the non-secret deploy config shared with CI (.github/workflows/ci.yaml).
set -a
# shellcheck disable=SC1091
source .env.deploy
set +a

# The GitHub repo allowed to impersonate the deployer SA.
REPO="UkuleleTuesday/setlister"

# Project number is embedded in the workload identity provider path
# (projects/<number>/locations/...); derive it so there is one source of truth.
PROJECT_NUMBER="$(sed -n 's#^projects/\([0-9]*\)/.*#\1#p' <<<"$GCP_WORKLOAD_IDENTITY_PROVIDER")"

# The function runs as the default compute service account.
COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

echo "Project:      $GCP_PROJECT_ID ($PROJECT_NUMBER)"
echo "Deployer SA:  $GCP_DEPLOYER_SERVICE_ACCOUNT"
echo "Repo:         $REPO"
echo

# 1. Dedicated deployer service account.
if ! gcloud iam service-accounts describe "$GCP_DEPLOYER_SERVICE_ACCOUNT" \
  --project="$GCP_PROJECT_ID" >/dev/null 2>&1; then
  gcloud iam service-accounts create setlister-deployer \
    --project="$GCP_PROJECT_ID" --display-name="setlister CI deployer"
fi

gcloud projects add-iam-policy-binding "$GCP_PROJECT_ID" \
  --member="serviceAccount:$GCP_DEPLOYER_SERVICE_ACCOUNT" \
  --role=roles/cloudfunctions.admin

# The function runs as the default compute SA; deploying on its behalf needs:
gcloud iam service-accounts add-iam-policy-binding "$COMPUTE_SA" \
  --project="$GCP_PROJECT_ID" \
  --member="serviceAccount:$GCP_DEPLOYER_SERVICE_ACCOUNT" \
  --role=roles/iam.serviceAccountUser

# 2. Workload identity pool + GitHub OIDC provider.
#    (skip if the project already has this pool/provider)
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

# 3. Allow workflows from this repo (only) to impersonate the deployer SA.
gcloud iam service-accounts add-iam-policy-binding \
  "$GCP_DEPLOYER_SERVICE_ACCOUNT" \
  --project="$GCP_PROJECT_ID" \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github/attribute.repository/${REPO}"

# 4. Runtime Vertex + Cloud Trace access for the function's compute SA.
#    (songbook-generator's worker already uses Vertex under this account; these
#    are usually already granted, but the bindings are idempotent.)
gcloud projects add-iam-policy-binding "$GCP_PROJECT_ID" \
  --member="serviceAccount:$COMPUTE_SA" \
  --role=roles/aiplatform.user
gcloud projects add-iam-policy-binding "$GCP_PROJECT_ID" \
  --member="serviceAccount:$COMPUTE_SA" \
  --role=roles/cloudtrace.agent

echo
echo "Done."
