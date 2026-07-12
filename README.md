# HCM Onboarding Scheduler

A lightweight, single-user internal web app for the **NYCEM Human Capital
Management** team to generate Outlook calendar invitations (`.ics` files) for
new-employee onboarding.

> **The app never sends anything.** It generates `.ics` files that you open in
> your own Outlook / O365, review, add a Teams link if needed, and send
> yourself.

---

## Contents

- [Architecture](#architecture)
- [Repo layout](#repo-layout)
- [Prerequisites](#prerequisites)
- [First-time deploy — do this in order](#first-time-deploy--do-this-in-order)
  - [0. Point your shell at the isolated account](#0-point-your-shell-at-the-isolated-account)
  - [1. Bootstrap CDK (one time per account)](#1-bootstrap-cdk-one-time-per-account)
  - [2. Deploy the backend + hosting](#2-deploy-the-backend--hosting)
  - [3. Set the password and JWT secret](#3-set-the-password-and-jwt-secret)
  - [4. Deploy the frontend](#4-deploy-the-frontend)
  - [5. (Optional) Custom domain + HTTPS certificate](#5-optional-custom-domain--https-certificate)
  - [6. Add an organizer](#6-add-an-organizer)
- [Using the app](#using-the-app)
- [The generated `.ics` files](#the-generated-ics-files)
- [Cost](#cost)
- [Security notes](#security-notes)
- [⚠️ When you are done — delete the IAM access key](#️-when-you-are-done--delete-the-iam-access-key)

---

## Architecture

| Layer         | Service                                                              |
| ------------- | ------------------------------------------------------------------- |
| Frontend      | React + TypeScript SPA on **S3 + CloudFront** (private, OAC)         |
| Backend       | **API Gateway (HTTP API)** → single **Lambda** (Node.js/TypeScript) |
| Data          | **DynamoDB** (single table, on-demand billing)                      |
| Auth          | Shared password → **server-side check in Lambda** → signed JWT      |
| Secrets       | **AWS Secrets Manager** (password + JWT signing key)                 |
| Infra as code | **AWS CDK** (TypeScript)                                             |
| Region        | **us-east-1** · Account **098217739895**                            |

There is **no Cognito, no SES/SMS, no Microsoft Graph/Teams API**. Meeting
`.ics` files are built entirely in the browser and downloaded locally.

## Repo layout

```
.
├── Makefile               # make deploy-backend, deploy-frontend, deploy-cert …
├── infra/                 # AWS CDK app (two stacks: main + optional cert)
├── backend/               # Lambda handlers (api.ts router, seed.ts)
└── frontend/              # React SPA + deploy.sh (build → S3 → CloudFront)
```

## Prerequisites

- **Node.js 20+** and npm
- **AWS CLI v2**, configured with a profile for account `098217739895`
- The AWS CDK CLI is pulled in as a dev dependency — no global install needed
  (all commands use `npx cdk`).

Install everything once:

```bash
make install      # == npm install (workspaces: infra, backend, frontend)
```

---

## First-time deploy — do this in order

### 0. Point your shell at the isolated account

Credentials are read **only** from your environment / active AWS profile. Never
put them in source or on a command line.

```bash
export AWS_PROFILE=your-nycem-profile      # or AWS_ACCESS_KEY_ID / SECRET in env
export AWS_REGION=us-east-1

aws sts get-caller-identity                 # MUST show "Account": "098217739895"
```

Every deploy target re-checks the account and **refuses to run** if it is not
`098217739895`.

### 1. Bootstrap CDK (one time per account)

```bash
cd infra && npx cdk bootstrap aws://098217739895/us-east-1 && cd ..
```

### 2. Deploy the backend + hosting

From the repo root:

```bash
make deploy-backend
```

This creates the DynamoDB table, the two secrets, the Lambda + HTTP API, the
private S3 bucket, and the CloudFront distribution. It also **seeds the Rooms
list** (Conference Room 1A, 3A, 3B, 3C, Executive, North, Press Briefing,
Situation, South, Training).

When it finishes it prints outputs. View them any time with:

```bash
make outputs
```

Key outputs:

| Output                     | Use                                                     |
| -------------------------- | ------------------------------------------------------- |
| `ApiUrl`                   | Backend API base (baked into the frontend at build)     |
| `SiteBucketName`           | S3 bucket the frontend is synced into                   |
| `DistributionId`           | CloudFront distribution (for cache invalidation)        |
| `DistributionDomainName`   | e.g. `d1234abcd.cloudfront.net` — the CNAME target      |
| `AppPasswordSecretName`    | Where to set the real password (next step)              |

### 3. Set the password and JWT secret

The **JWT signing key** is generated automatically by CDK — you do not touch it.

The **password** secret is created with a random placeholder so the real value
(`NYCEM30`) is **never present in source or the CloudFormation template**. Set
it once after the first deploy:

```bash
# Use the secret name from the AppPasswordSecretName output:
PW_SECRET=$(make -s outputs | grep AppPasswordSecretName -A0 || true)

aws secretsmanager put-secret-value \
  --region us-east-1 \
  --secret-id "<AppPasswordSecretName from outputs>" \
  --secret-string 'NYCEM30'
```

> The Lambda reads this secret at request time and compares it server-side, so
> the password is **never shipped in the frontend bundle**. To change the
> password later, just `put-secret-value` again — no redeploy needed.

If you ever want to rotate the JWT signing key, overwrite the
`JwtSigningSecret` value the same way; existing sessions will be invalidated.

### 4. Deploy the frontend

```bash
make deploy-frontend
```

This reads the stack outputs, builds the React app with the correct `ApiUrl`,
syncs it to the S3 bucket, and invalidates the CloudFront cache. When it
finishes, the app is live at the **CloudFront URL**
(`https://<DistributionDomainName>`).

You can start using it immediately at that URL, even before the custom domain
is set up.

### 5. (Optional) Custom domain + HTTPS certificate

Target domain: **`OnboardingScheduler.BenjaminKrakauer.com`**. DNS is managed
externally (GoDaddy registrar, Google DNS), so certificate validation and the
site CNAME are added **by hand**.

**5a. Request the certificate.** Deploy the certificate stack:

```bash
make deploy-cert
```

This stack intentionally **waits in `CREATE_IN_PROGRESS`** until you add the DNS
validation record — that is expected. In a **second terminal**, read the
validation record (available as soon as the request is made):

```bash
# Find the pending cert ARN:
aws acm list-certificates --region us-east-1 \
  --query "CertificateSummaryList[?DomainName=='OnboardingScheduler.BenjaminKrakauer.com'].CertificateArn" \
  --output text

# Read the CNAME name + value you must add at your DNS provider:
aws acm describe-certificate --region us-east-1 \
  --certificate-arn <cert-arn> \
  --query 'Certificate.DomainValidationOptions[].ResourceRecord'
```

**Add the ACM validation record at Google DNS** (CNAME):

| Type  | Name (Host)                          | Value (Target)                        |
| ----- | ------------------------------------ | ------------------------------------- |
| CNAME | `<Name from ResourceRecord>`         | `<Value from ResourceRecord>`         |

> ACM validation `Name`/`Value` are unique per request, so they can only be
> read from the command above — they are not fixed in advance. The `Name` ends
> in `.BenjaminKrakauer.com`; when entering it at Google DNS you typically strip
> the base-domain suffix and the trailing dot per your provider's convention.

Once the record propagates, ACM issues the cert and `make deploy-cert`
completes and prints `CertificateArn`.

**5b. Attach the domain to CloudFront.** Redeploy the main stack with the
domain + validated cert:

```bash
make deploy-backend \
  DOMAIN=OnboardingScheduler.BenjaminKrakauer.com \
  CERT_ARN=<CertificateArn from step 5a>
```

**5c. Point the site domain at CloudFront.** Add the **site CNAME** at Google
DNS:

| Type  | Name (Host)                              | Value (Target)                          |
| ----- | ---------------------------------------- | --------------------------------------- |
| CNAME | `OnboardingScheduler` (→ `.BenjaminKrakauer.com`) | `<DistributionDomainName>` (e.g. `d1234abcd.cloudfront.net`) |

Get the exact `DistributionDomainName` from `make outputs`. After DNS
propagates, the app is live at
`https://OnboardingScheduler.BenjaminKrakauer.com`.

**5d. Re-sync the frontend** (the API URL is unchanged, but re-running is safe):

```bash
make deploy-frontend
```

### 6. Add an organizer

Open the app → **Settings** → **Add organizer** (display name + email). You can
store several; on the Generate screen you pick which one is stamped as the
invitation `ORGANIZER`. Emails follow the `@oem.nyc.gov` convention (type the
username; the suffix is added) with a per-entry override for other domains.
Generation is **blocked** until at least one organizer exists.

---

## Using the app

Navigation (Generate is the landing screen):

**Generate · Patterns · Meetings · Directory · Rooms · Log · Settings**

- **Directory** — people & distribution lists you reuse as attendees.
- **Meetings** — meeting templates (title, default duration, default room,
  required/optional attendees, and an **invitation body** — what the meeting is
  about and what to bring, included in every invitation and editable per
  meeting). Mark an "optional" meeting by putting it in the **title** (e.g.
  `Supervisor Meet & Greet - Optional`). First deploy seeds five sample
  templates (Security / HCM / IT Orientation, Supervisor Meet and Greet -
  Optional, Lunch Break) with blank rooms and no attendees.
- **Rooms** — add / rename / delete rooms.
- **Patterns** — a named onboarding sequence: meeting templates with a day
  offset (0 = start date), start time, and optional duration override.
- **Settings** — the list of **organizers** you can choose from at generation.
- **Generate** — the main screen. Two modes:
  - **Manual** — add meetings one at a time, pre-filling from a template.
  - **From a pattern** — pick a saved pattern + one start date; the app computes
    the concrete date/time for every meeting. Edit any field afterward.

  In both modes you add **new employee(s)** (username + `@oem.nyc.gov`, or an
  override) as removable chips — each is added as a required attendee to every
  meeting — and pick the **organizer**. Any meeting can **repeat** (daily or
  weekly for N occurrences — e.g. lunch every day for the week); each occurrence
  is generated as its own invitation so it works with both the Outlook link and
  the `.ics`. A **validation step** runs before generation and will surface
  **2026 NYC holiday / weekend warnings** for you to acknowledge.

- **Log** — an append-only record of every generation batch.

All times are **America/New_York**. All events are single-occurrence.

## Generating invitations — two ways to open each meeting

On **Generate**, each meeting produces a card with two buttons:

- **Open in Outlook (recommended for new Outlook / O365).** A deep link that
  opens the Outlook-web / new-Outlook **event compose** pre-filled with the
  subject, time, location, body, and attendees. Add a Teams link if needed and
  click **Send**. This is the reliable path because **new Outlook (Windows) and
  Outlook on the web do not open local `.ics` files** on double-click.
- **Download `.ics`** (plus a *Download all (.zip)*). Best for **classic desktop
  Outlook** or record-keeping. Each file uses `METHOD:PUBLISH` (opens as an
  editable event you own), sets `ORGANIZER` to the organizer you selected, lists
  required attendees (template required **+ new employees**) as
  `ROLE=REQ-PARTICIPANT` and optional as `ROLE=OPT-PARTICIPANT`, carries a full
  **`VTIMEZONE` for America/New_York** (DST-aware), and includes the reminder
  *"Add your Teams link before sending, if applicable."*

**Rooms are optional.** Leave the room blank for meetings with no room (e.g.
Lunch), or pick **Virtual (Microsoft Teams)** in the room picker for virtual
meetings — that sets the location to *Microsoft Teams Meeting* (you still add
the real Teams link before sending).

## Cost

Built to be cheap for a low-traffic internal tool: DynamoDB **on-demand**, a
small **256 MB Lambda**, an HTTP API, and CloudFront with `PriceClass_100`.
Idle cost is a few cents/month (mostly Secrets Manager at ~$0.40/secret/month).

## Security notes

- The real password (`NYCEM30`) lives **only** in Secrets Manager and is checked
  server-side; it is never in the frontend bundle or source.
- The JWT signing key is auto-generated in Secrets Manager.
- AWS credentials are read only from the environment / profile — never printed,
  hardcoded, or committed.
- Session tokens expire after 12 hours (`TOKEN_TTL_SECONDS`).
- The DynamoDB table and S3 bucket use `RETAIN` on stack deletion so data is not
  lost accidentally.

## ⚠️ When you are done — delete the IAM access key

This app was deployed with a temporary IAM access key for the isolated account.
**When the work is complete, delete that access key** so it can't be reused:

```bash
# List keys for the deploy user, then delete the one you used:
aws iam list-access-keys --user-name <deploy-user>
aws iam delete-access-key --user-name <deploy-user> --access-key-id <AKIA...>
```

(Or rotate/deactivate it in the IAM console.) The running app does **not** need
that key — the Lambda uses its own execution role.
