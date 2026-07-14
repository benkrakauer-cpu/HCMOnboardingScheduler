# HCM Onboarding Scheduler — repo-root Makefile
#
# Deployment targets. AWS credentials are read ONLY from the environment /
# active AWS profile (AWS_PROFILE). Never pass credentials on the command line.
#
# Target AWS account: 098217739895 (us-east-1). Deploy targets refuse to run
# against any other account.

SHELL := /bin/bash
REGION ?= us-east-1
EXPECTED_ACCOUNT := 098217739895
STACK ?= OnboardingSchedulerStack

# Custom domain defaults so every `make deploy-backend` keeps the CloudFront
# alias attached. The stack removes the alias if these are not supplied, so they
# must be passed on EVERY deploy — defaulting them here prevents that footgun.
# Override on the command line if the domain/cert ever change. (These are public
# infrastructure identifiers, not secrets.)
DOMAIN ?= onboardingscheduler.benjaminkrakauer.com
CERT_ARN ?= arn:aws:acm:us-east-1:098217739895:certificate/542aa55d-b01b-444c-ae9f-fbb9e786e2b7

.PHONY: help install build guard-account deploy-backend deploy-cert \
        outputs deploy-frontend clean

help:
	@echo "HCM Onboarding Scheduler — make targets:"
	@echo "  make install         Install all workspace dependencies"
	@echo "  make build           Build backend + frontend + infra"
	@echo "  make deploy-backend  Deploy CDK app (backend, DB, hosting) to $(EXPECTED_ACCOUNT)"
	@echo "  make deploy-cert     Deploy the optional ACM certificate stack"
	@echo "  make outputs         Print CloudFormation stack outputs"
	@echo "  make deploy-frontend Build the React app, sync to S3, invalidate CloudFront"
	@echo "  make clean           Remove build artifacts"

install:
	npm install

build:
	npm run build --workspace backend
	npm run build --workspace frontend
	npm run build --workspace infra

# Fail closed unless we are pointed at the correct isolated account.
guard-account:
	@echo "Verifying AWS account (expecting $(EXPECTED_ACCOUNT))..."
	@ACCOUNT=$$(aws sts get-caller-identity --query Account --output text); \
	if [ "$$ACCOUNT" != "$(EXPECTED_ACCOUNT)" ]; then \
		echo "REFUSING TO DEPLOY: caller account $$ACCOUNT != expected $(EXPECTED_ACCOUNT)"; \
		exit 1; \
	fi; \
	echo "Account OK: $$ACCOUNT"

# Deploy the main application stack (backend Lambda, DynamoDB, secrets,
# S3 + CloudFront hosting). Pass a custom domain + validated cert like:
#   make deploy-backend DOMAIN=OnboardingScheduler.BenjaminKrakauer.com CERT_ARN=arn:aws:acm:...
deploy-backend: guard-account
	cd infra && npx cdk deploy $(STACK) \
		--require-approval never \
		$(if $(DOMAIN),-c domain=$(DOMAIN),) \
		$(if $(CERT_ARN),-c certArn=$(CERT_ARN),)

# Deploy the ACM certificate stack. This WAITS for you to add the DNS
# validation record (see README). Retrieve the validation record with:
#   aws acm describe-certificate --region us-east-1 --certificate-arn <arn> \
#     --query 'Certificate.DomainValidationOptions[].ResourceRecord'
deploy-cert: guard-account
	cd infra && npx cdk deploy OnboardingSchedulerCertStack \
		--require-approval never \
		-c domain=$(or $(DOMAIN),OnboardingScheduler.BenjaminKrakauer.com)

outputs:
	@aws cloudformation describe-stacks --region $(REGION) \
		--stack-name $(STACK) \
		--query 'Stacks[0].Outputs' --output table

deploy-frontend: guard-account
	./frontend/deploy.sh $(STACK)

clean:
	rm -rf infra/cdk.out backend/dist frontend/dist
	rm -f **/*.tsbuildinfo
