# Setlister

Proof of concept for turning photos of the Ukulele Tuesday song-request
whiteboard — the "whiteboard of wishes" — into a clean, reviewable setlist,
matched against the active UT songbook.

Take a photo of the board, and the app:

1. reads each handwritten row (song title + page number) with a multimodal
   vision model (Gemini),
2. matches every row against the published songbook catalogue
   (title fuzzy-matching + page-number cross-checking with
   [RapidFuzz](https://github.com/rapidfuzz/RapidFuzz)),
3. shows a review screen where uncertain rows can be corrected before
   copying/exporting the final setlist.

The songbook catalogue is derived from the public manifests published by
[songbook-generator](https://github.com/UkuleleTuesday/songbook-generator) at
`https://storage.googleapis.com/ukulele-tuesday-songbooks/<edition>/` — no
credentials needed.

## Quickstart

Requires [uv](https://docs.astral.sh/uv/) and Python 3.12+.

Gemini runs through Vertex AI over Application Default Credentials — no API
key needed. Authenticate once with `gcloud auth application-default login`
(uses the shared `songbook-generator` GCP project, same as `tabby` and
songbook-generator).

```bash
uv sync
gcloud auth application-default login   # one-time; ADC for Vertex AI

# CLI
uv run setlister editions                       # list songbook editions
uv run setlister catalogue --edition current    # dump song -> page catalogue
uv run setlister parse photo.jpg                # parse a whiteboard photo
uv run setlister parse photo.jpg --json         # machine-readable output

# Web app (mobile-first review UI): API + static UI are served separately
uv run setlister serve                          # API on http://127.0.0.1:8080
python3 -m http.server 3000 -d ui               # UI on http://localhost:3000
```

## Development

```bash
uv run pytest              # offline test suite (no API key needed)
uv run pytest -m live      # live smoke test (needs ADC + network)
uv run ruff check .
uv run ruff format .
```

## Deployment

The app deploys automatically on every merge to `main`
(`.github/workflows/ci.yaml`):

- **API** — a gen2 Cloud Function `setlister-api` in the shared
  `songbook-generator` GCP project (`europe-west1`), deployed with
  `gcloud functions deploy --source utrequests` (the same pattern as
  songbook-generator: `requirements.txt` is generated from `uv.lock` with
  `uv export` at deploy time). Vertex AI calls stay in `us-central1`.
- **UI** — the static `ui/` folder, published to GitHub Pages at
  `https://ukuleletuesday.github.io/setlister/`. It calls the function
  cross-origin; allowed origins are configured via `CORS_ALLOWED_ORIGINS`
  (see `.env.deploy`).

The endpoint is public but guarded: uploads are capped at 20 MB, `/api/parse`
is rate-limited per IP (in-process fixed window), and the function runs with
`--max-instances 1` to bound worst-case Vertex AI spend (expected traffic is a
handful of photos per club night, so one instance is plenty).

### One-time setup

CI authenticates to GCP with **Workload Identity Federation** — GitHub mints a
short-lived OIDC token that GCP exchanges for deployer-SA credentials, so
there are **no keys and no GitHub secrets/variables to configure**. A project
admin runs this once (values match `.env.deploy`; `993670465212` is the
`songbook-generator` project number):

```bash
# 1. Dedicated deployer service account
gcloud iam service-accounts create setlister-deployer \
  --project=songbook-generator --display-name="setlister CI deployer"
gcloud projects add-iam-policy-binding songbook-generator \
  --member=serviceAccount:setlister-deployer@songbook-generator.iam.gserviceaccount.com \
  --role=roles/cloudfunctions.admin
# The function runs as the default compute SA; deploying on its behalf needs:
gcloud iam service-accounts add-iam-policy-binding \
  993670465212-compute@developer.gserviceaccount.com \
  --project=songbook-generator \
  --member=serviceAccount:setlister-deployer@songbook-generator.iam.gserviceaccount.com \
  --role=roles/iam.serviceAccountUser

# 2. Workload identity pool + GitHub OIDC provider
#    (skip if the project already has this pool/provider)
gcloud iam workload-identity-pools create github \
  --project=songbook-generator --location=global \
  --display-name="GitHub Actions"
gcloud iam workload-identity-pools providers create-oidc github-oidc \
  --project=songbook-generator --location=global \
  --workload-identity-pool=github --display-name="GitHub OIDC" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository_owner == 'UkuleleTuesday'"

# 3. Allow workflows from this repo (only) to impersonate the deployer SA
gcloud iam service-accounts add-iam-policy-binding \
  setlister-deployer@songbook-generator.iam.gserviceaccount.com \
  --project=songbook-generator \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/993670465212/locations/global/workloadIdentityPools/github/attribute.repository/UkuleleTuesday/setlister"
```

Then:

1. **Runtime Vertex access** — confirm the default compute service account has
   `roles/aiplatform.user` in the project (songbook-generator's worker already
   uses Vertex under it).
2. **GitHub Pages** — after the first `main` deploy creates the `gh-pages`
   branch, set repo Settings → Pages → deploy from branch `gh-pages`, `/`
   (root).
