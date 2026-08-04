# Heather Standard Browser Model on Cloudflare R2

Heather Basic uses a browser-local WebLLM engine. The standard model channel is pinned to:

- Model: `Qwen2.5-3B-Instruct-q4f16_1-MLC`
- Heather model ID: `Heather-Qwen2.5-3B-Instruct-q4f16_1-v1.0.0`
- Quantization: `q4f16_1`
- Browser context window: 4,096 tokens
- Expected WebLLM VRAM: about 2,504.76 MB
- Artifact size: about 1.75 GB before the compatible WebGPU library
- License: Qwen Research License; commercial use requires separate permission

## Architecture

```text
GitHub
  Heather source, model manifest builder, R2 deployment workflow

Vercel
  Heather web application and account APIs

Cloudflare R2
  Versioned MLC weights, tokenizer, configuration, license and WebGPU WASM

models.heather-ai.com
  Public custom domain backed by the R2 bucket and Cloudflare cache

Browser IndexedDB
  Per-browser persistent model cache

Browser WebGPU
  Local inference
```

## 1. Create the Cloudflare resources

Create an R2 Standard bucket named `heather-models`. Connect the custom domain `models.heather-ai.com` to the bucket under **R2 > heather-models > Settings > Public access > Custom Domains**.

The domain must be active before the deployment workflow verifies the public model endpoints. Keep the `r2.dev` development URL disabled for production use.

## 2. Create an R2 API token

Create an R2 S3 access key with object read/write access to the `heather-models` bucket. Record:

- Cloudflare Account ID
- Access Key ID
- Secret Access Key

Do not commit any of these values to the repository.

## 3. Add GitHub Actions secrets

Add these repository secrets:

| Secret | Value |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | R2 S3 access key ID |
| `R2_SECRET_ACCESS_KEY` | R2 S3 secret access key |
| `R2_BUCKET_NAME` | `heather-models` |
| `R2_PUBLIC_BASE_URL` | `https://models.heather-ai.com` |
| `HEATHER_PUBLIC_ORIGIN` | Production Heather origin, without a trailing slash |

The workflow never exposes these secrets to browser code.

## 4. Deploy the standard model

Run the GitHub Actions workflow:

```text
Deploy Heather standard model to R2
```

The workflow performs the following operations:

1. Downloads the pinned MLC model repository.
2. Downloads the WebLLM `v0_2_84/base` compatible WebGPU WASM library.
3. Adds the Qwen license and redistribution notice.
4. Calculates SHA-256 checksums and WebLLM SRI values.
5. Creates `manifests/heather-standard-v1.json`.
6. Uploads model files to an immutable `v1.0.0` path.
7. Applies an R2 browser CORS policy.
8. Verifies the manifest, model configuration and WASM through the public domain.

Expected R2 keys:

```text
models/qwen2.5-3b-instruct-q4f16_1/v1.0.0/...
libs/webllm-v0_2_84/Qwen2.5-3B-Instruct-q4f16_1_cs1k-webgpu.wasm
manifests/heather-standard-v1.json
```

Do not overwrite files inside a released version path. Publish a new version path for updates and change the active manifest only after validation.

## 5. Configure Vercel

Set this environment variable for Production, Preview and Development as appropriate:

```text
NEXT_PUBLIC_HEATHER_MODEL_BASE_URL=https://models.heather-ai.com
```

Redeploy Heather after adding or changing the variable. Because this is a `NEXT_PUBLIC_` value, it is included in the browser bundle at build time.

Optional override:

```text
NEXT_PUBLIC_HEATHER_WEB_MODEL=<supported WebLLM model ID>
```

The optional override is intended for controlled testing. Normal production operation should leave it unset.

## Runtime fallback order

For browsers reporting more than 4 GB of device memory:

1. Heather R2 standard model, when the model base URL is configured.
2. Upstream WebLLM Qwen2.5 3B model if the R2 manifest or artifacts cannot load.
3. Qwen2.5 1.5B low-memory model if the standard model cannot initialize.

For browsers reporting 4 GB or less, Heather starts with the 1.5B low-memory model.

## Cache policy

Versioned model and WASM objects use:

```text
Cache-Control: public,max-age=31536000,immutable
```

The active channel manifest uses:

```text
Cache-Control: public,max-age=60,must-revalidate
```

This allows model artifacts to remain immutable while the small manifest controls the active version.

## Licensing constraint

`Qwen2.5-3B-Instruct` is distributed under the Qwen Research License. The current license permits non-commercial use and requires the license and attribution notice to accompany redistribution. A commercial Heather launch must obtain separate permission or migrate the standard channel to a commercially permitted model before release.
