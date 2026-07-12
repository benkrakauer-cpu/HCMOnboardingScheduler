#!/usr/bin/env bash
#
# Build the React app against the deployed API, sync it to the site S3 bucket,
# and invalidate the CloudFront cache.
#
# Usage:  ./frontend/deploy.sh [STACK_NAME]
# Reads all required values from the CloudFormation stack outputs. AWS creds
# come from the environment / active profile only — never passed on the CLI.

set -euo pipefail

STACK="${1:-OnboardingSchedulerStack}"
REGION="${AWS_REGION:-us-east-1}"
EXPECTED_ACCOUNT="098217739895"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# --- Safety: confirm the target account ---
ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
if [[ "$ACCOUNT" != "$EXPECTED_ACCOUNT" ]]; then
  echo "REFUSING TO DEPLOY: account $ACCOUNT != expected $EXPECTED_ACCOUNT" >&2
  exit 1
fi

echo "Reading stack outputs from $STACK ..."
get_output() {
  aws cloudformation describe-stacks \
    --region "$REGION" --stack-name "$STACK" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" \
    --output text
}

API_URL="$(get_output ApiUrl)"
BUCKET="$(get_output SiteBucketName)"
DIST_ID="$(get_output DistributionId)"

if [[ -z "$API_URL" || -z "$BUCKET" || -z "$DIST_ID" ]]; then
  echo "Could not read stack outputs. Has the backend been deployed?" >&2
  exit 1
fi

echo "  API_URL : $API_URL"
echo "  Bucket  : $BUCKET"
echo "  Dist ID : $DIST_ID"

echo "Building frontend..."
cd "$HERE"
VITE_API_URL="$API_URL" npm run build

echo "Syncing to s3://$BUCKET ..."
# Hashed assets: long cache. index.html: no-cache so new deploys show up.
aws s3 sync dist "s3://$BUCKET" --delete \
  --exclude "index.html" \
  --cache-control "public,max-age=31536000,immutable"
aws s3 cp dist/index.html "s3://$BUCKET/index.html" \
  --cache-control "no-cache,no-store,must-revalidate"

echo "Invalidating CloudFront cache..."
aws cloudfront create-invalidation \
  --distribution-id "$DIST_ID" \
  --paths "/*" >/dev/null

echo "Done. The app is live on the CloudFront distribution."
