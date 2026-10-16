# Security Report — Setlister

**Scope:** full repository (`ukuleletuesday/setlister`) at branch head.
**Date:** 2026-07-13.
**Reviewer:** automated security review.

Setlister is a proof-of-concept web/CLI tool: a public, unauthenticated
gen2 Cloud Function (`utrequests/`) parses uploaded whiteboard photos with
Gemini, matches them against a public songbook catalogue fetched from GCS,
and a static GitHub Pages UI (`ui/`) drives it. There are no user accounts,
no database, and no secrets in the request path (Gemini runs over Workload
Identity / ADC, no API keys), which keeps the overall attack surface small.

The findings below are ranked by severity. Nothing here is a critical,
remotely-exploitable compromise; the most significant issue is a
server-side request forgery / path-traversal vector through the unvalidated
`edition` parameter.

## Summary

| # | Severity | Issue | Location |
|---|----------|-------|----------|
| 1 | Medium | Unvalidated `edition` allows path traversal to arbitrary public GCS objects (SSRF-lite) | `catalogue.py`, `api.py` |
| 2 | Low–Medium | Per-IP rate limit is trivially bypassed via a spoofed `X-Forwarded-For` | `ratelimit.py`, `api.py` |
| 3 | Low | Decompression-bomb / malformed image raises an uncaught error (500 instead of 400) and decodes before size is bounded | `preprocess.py` |
| 4 | Low | Upload body is read fully into memory before the size check | `api.py` |
| 5 | Low | Second-order prompt injection: fetched catalogue text is embedded verbatim in the Gemini prompt | `vision.py` (compounds #1) |
| 6 | Info | Public unauthenticated endpoint invoking a paid model — cost/abuse exposure | `ci.yaml`, `config.py` |
| 7 | Info | Non-secret deploy config committed in `.env.deploy` | `.env.deploy` |
| 8 | Info | `localhost` origins in the default CORS allowlist | `config.py` |

No hardcoded credentials, API keys, or private tokens were found in the
working tree or in git history. Dependencies (`uv.lock`) are current with
no known-vulnerable versions flagged.

---

## 1. Unvalidated `edition` → path traversal to arbitrary GCS objects (Medium)

**Where:** `utrequests/api.py:127` → `utrequests/pipeline.py` → `utrequests/catalogue.py:92`

The `edition` value comes straight from the request and is interpolated
into a URL with no validation:

```python
# api.py
edition = request.form.get("edition") or "current"      # attacker-controlled
...
# catalogue.py
base = f"{settings.bucket_base_url}/{edition}"
latest = httpx.get(f"{base}/latest.json", ...)
```

`httpx` normalizes `../` segments in the path *before* sending the request,
so a crafted `edition` walks out of the songbook prefix:

```
edition = "../evil-bucket"
  → https://storage.googleapis.com/evil-bucket/latest.json
edition = "../../foo/bar"
  → https://storage.googleapis.com/foo/bar/latest.json
```

(Both verified against `httpx.URL`.) The host stays pinned to
`storage.googleapis.com` — an authority-injection escape is not possible
because the authority is already fixed by the literal prefix — so this is
**not** a full SSRF to arbitrary hosts. The impact is nonetheless real:

- The server can be coerced into fetching **any publicly-readable object in
  any GCS bucket** and reflecting its JSON back to the caller (the parsed
  catalogue is returned in the `/api/parse` response and also fed to the
  vision model — see finding #5).
- `list_editions()` in the same module *does* validate edition IDs against
  `_EDITION_ID = ^[a-z0-9]+(-[a-z0-9]+)*$`, so the guard already exists —
  it is simply not applied on the `fetch_catalogue` / parse path. This is a
  clear "validation exists but was not wired in everywhere" gap.

**Recommendation:** validate `edition` against the existing `_EDITION_ID`
regex (or an allowlist) in `fetch_catalogue`, and reject `.`/`/` outright.
Fail closed with a 400 before any network call.

## 2. Rate limit bypass via spoofed `X-Forwarded-For` (Low–Medium)

**Where:** `utrequests/ratelimit.py:52` (`parse_client_ip`), `utrequests/api.py:105`

The per-IP budget for the paid `/api/parse` call keys off the leftmost
entry of the client-supplied `X-Forwarded-For` header:

```python
client_ip = ratelimit.parse_client_ip(request.headers.get("X-Forwarded-For"), request.remote_addr)
```

That value is fully attacker-controlled, so rotating `X-Forwarded-For:
1.2.3.<n>` gives an effectively unlimited number of distinct rate-limit
buckets and defeats the per-IP limit entirely.

The code comments acknowledge this and correctly note the *hard* backstop is
the deploy's `--max-instances 1` / `--concurrency 1`, which caps total
concurrent paid calls regardless of the per-IP limit. So the blast radius is
bounded today. The risk is that the per-IP limit reads as protection it
does not actually provide, and the backstop is a deploy-time flag that a
future change could loosen. This is flagged Low–Medium rather than higher
precisely because of that existing `--max-instances` cap.

**Recommendation:** on Cloud Functions gen2, trust only the platform-added
rightmost XFF hop (or `request.remote_addr`) rather than the leftmost
client-set entry; document that per-IP limiting is best-effort and that
`--max-instances` is the real control.

## 3. Decompression-bomb / malformed image handling (Low)

**Where:** `utrequests/preprocess.py:18-33`

```python
try:
    image = Image.open(io.BytesIO(data))
    image = ImageOps.exif_transpose(image)
    image = image.convert("RGB")
except (UnidentifiedImageError, OSError, ValueError) as e:
    raise ImageError(...)
```

`PIL.Image.DecompressionBombError` is **not** a subclass of any of the
caught types (verified: it derives directly from `Exception`). A
"decompression bomb" — a small, highly-compressed file that expands to a
huge pixel count — therefore escapes this handler and propagates as an
unhandled `500` rather than the intended `400 Could not read image`. Pillow's
default `MAX_IMAGE_PIXELS` (~89M px) does raise the error, so this is a
robustness / error-classification issue rather than a memory-exhaustion
hole, but a well-formed image just under that threshold is still fully
decoded into an RGB buffer before the long edge is capped.

**Recommendation:** add `Image.DecompressionBombError` (and a bare
`Exception` fallback) to the `except` clause so malformed/oversized images
return a clean 400; optionally lower `MAX_IMAGE_PIXELS` to a value matched to
the expected whiteboard photos.

## 4. Upload buffered fully into memory before size check (Low)

**Where:** `utrequests/api.py:99-126`

The `Content-Length` pre-check is a good early-out, but it is skippable
(chunked / absent / spoofed length). When it is skipped, the code does:

```python
image = request.files.get("image")
data = image.read()          # entire body into memory, unbounded
...
if len(data) > settings.max_upload_bytes:   # checked only after the full read
    return _error(request, 413, "Upload too large")
```

The `413` fires only *after* the whole body is in memory. Combined with the
512 MiB function memory and `--concurrency 1`, a single oversized streamed
upload can pressure memory before rejection. No `MAX_CONTENT_LENGTH` is set
on the Flask/functions-framework app.

**Recommendation:** set Werkzeug's `MAX_CONTENT_LENGTH` (or read in bounded
chunks and abort once `max_upload_bytes` is exceeded) so the body is capped
during ingestion, not after.

## 5. Second-order prompt injection via catalogue content (Low)

**Where:** `utrequests/vision.py:69-73`, `build_prompt`

The catalogue's `page | Title - Artist` lines are concatenated verbatim into
the Gemini prompt. With the trusted public songbook this is fine. Chained
with finding #1, however, an attacker who redirects `edition` to a bucket
they control supplies the "catalogue" text and can inject instructions into
the model prompt. The downstream damage is limited (output is a structured
extraction reflected to the same caller, and matching is still done locally),
but it is worth noting the prompt is assembled from data whose origin is only
as trustworthy as finding #1 makes it.

**Recommendation:** fixing #1 (validating `edition`) closes the untrusted
path; no separate change is required beyond that.

## 6. Public unauthenticated endpoint invoking a paid model (Info)

**Where:** `.github/workflows/ci.yaml:67` (`--allow-unauthenticated`), `utrequests/config.py`

By design the API is public (`--allow-unauthenticated`) and every
`/api/parse` invokes a billable Gemini call. CORS is implemented correctly
(origin is echoed only when allowlisted, never `*`), but CORS is a browser
control and does not stop direct/non-browser POSTs. Cost/abuse is currently
bounded by `--max-instances 1`, `--concurrency 1`, `--timeout 120s`, and the
(bypassable, per #2) rate limit. This is acceptable for a POC but should be
a conscious decision, not an accident, before any traffic scale-up.

**Recommendation:** keep the `--max-instances` cap as the load-bearing
control; consider a lightweight proof-of-work / token / Turnstile check if
the tool is ever promoted beyond POC.

## 7. Committed deploy config `.env.deploy` (Info)

**Where:** `.env.deploy`

The file is committed and loaded into CI. Its contents are **non-secret** by
design — GCP project ID/number, region, function name, the Workload Identity
Federation provider path, and the deployer service-account *email*. WIF is
keyless, so no credential is exposed. The only consideration is that it
discloses internal infrastructure identifiers (project number `993670465212`,
SA email, WIF pool). This is informational; no secret leak. Worth confirming
the referenced GCP resources are not additionally protected by obscurity.

## 8. `localhost` origins in default CORS allowlist (Info)

**Where:** `utrequests/config.py:43-47`

The `Settings` default `cors_allowed_origins` includes
`http://localhost:3000` and `http://127.0.0.1:3000`. Production overrides
this via the `CORS_ALLOWED_ORIGINS` env var set at deploy time (verified in
`.env.deploy` / `ci.yaml`, which pins it to the GitHub Pages origin only),
so localhost is **not** accepted in prod. The residual risk is only if a
deploy ever forgets to set that env var, at which point a page served from
the developer's localhost could call the production API. Low likelihood given
the current CI wiring.

**Recommendation:** drop localhost from the shipped default and add it only
via a local `.env`, so the fail-open default is the safe one.

---

## Things that were checked and are fine

- **CORS:** correctly echoes an allowlisted origin, never `*`, and sets
  `Vary: Origin`.
- **XSS in the UI:** `ui/app.js` builds DOM with `textContent` /
  `createElement` throughout; no `innerHTML` sink with server/user data.
- **Tuning knobs** (`model`, `thinking_budget`, `max_image_edge`,
  `catalogue_in_prompt`): all clamped/allowlisted in `_parse_knobs`
  (`api.py`), model restricted to the `gemini-2.5-flash` prefix.
- **Secrets:** none in the tree or git history; auth is keyless via WIF/ADC.
- **CI supply chain:** `astral-sh/setup-uv` is pinned to a commit SHA;
  `uv sync --locked` enforces the lockfile. (Other first-party GitHub
  Actions are pinned to floating major tags — a minor hardening opportunity,
  not a finding.)
- **Dependencies:** `uv.lock` versions are current; nothing known-vulnerable.
