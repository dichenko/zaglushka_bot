# Deployment

## Purpose

Defines the Docker-based deployment architecture and CI/CD pipeline for the service. Covers containerization, orchestration, database persistence, and automated deployment via GitHub Actions.

## Requirements

### Requirement: Multi-Stage Docker Build
The Dockerfile SHALL use a two-stage build: a builder stage with full dev dependencies for TypeScript compilation, and a production stage with only production dependencies. The entrypoint SHALL be node dist/index.js.

#### Scenario: Docker image built
- **WHEN** docker compose build is run
- **THEN** the builder stage compiles TypeScript; the production stage copies dist/, migrations/, and scripts/; the image is tagged and ready

### Requirement: Docker Compose Orchestration
docker-compose.yml SHALL define two services: app (builds from Dockerfile, restart unless-stopped, reads .env, depends on postgres) and postgres (postgres:17-alpine, restart unless-stopped, credentials from environment with defaults). PostgreSQL data SHALL be persisted via named volume postgres_data.

#### Scenario: Full stack starts
- **WHEN** docker compose up -d is run with valid .env
- **THEN** postgres container starts first; app container retries DB connection up to 10 times; both containers reach healthy state

### Requirement: Database Connection Retry
The app SHALL retry PostgreSQL connection up to 10 times with 3-second delays. If all retries fail, the process SHALL exit with code 1.

#### Scenario: PostgreSQL starts after app
- **WHEN** the app container starts before PostgreSQL is accepting connections
- **THEN** the first attempt fails with ECONNREFUSED; subsequent attempts succeed once PostgreSQL is ready

#### Scenario: PostgreSQL never available
- **WHEN** PostgreSQL fails to start entirely
- **THEN** after 10 retries the app exits with code 1

### Requirement: Migration Execution
On startup, the app SHALL run two SQL migration files in order: 001_init.sql (bot_contacts table) and 002_ai_agent.sql (bot_configs, system_prompts, first_messages, admin_tokens, conversations, messages, leads, and bot_contacts column additions). All statements use IF NOT EXISTS or ADD COLUMN IF NOT EXISTS for idempotency.

#### Scenario: First run applies all migrations
- **WHEN** the database is empty
- **THEN** both migrations execute; all 7 tables and their indexes are created

#### Scenario: Subsequent runs are idempotent
- **WHEN** migrations were already applied in a previous run
- **THEN** the IF NOT EXISTS clauses prevent errors; the app starts normally

### Requirement: GitHub Actions Deploy
On push to master, .github/workflows/deploy.yml SHALL SSH into the VPS, run git config safe.directory, git pull, docker compose up -d --build, and docker image prune -f. Secrets VPS_HOST, VPS_USER, VPS_PORT, VPS_SSH_KEY are required.

#### Scenario: Code push triggers deploy
- **WHEN** a commit is pushed to master
- **THEN** GitHub Actions connects to the VPS, pulls changes, rebuilds, and restarts containers

### Requirement: Environment-Driven Configuration
All runtime configuration SHALL come from the .env file (not committed). Required variables: DATABASE_URL, LLM_API_KEY, ADMIN_TG_IDS, ADMIN_SESSION_SECRET, ADMIN_CHAT_ID. Optional variables have defaults defined in config.ts.

#### Scenario: Missing required variable
- **WHEN** DATABASE_URL is not set
- **THEN** the app logs a fatal error and exits immediately

### Requirement: PostgreSQL Password and Volume
PostgreSQL SHALL initialize with credentials from POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD on first start. If the volume already has data from a previous run, the existing credentials SHALL be used regardless of new environment values. A docker compose down -v is required to change the database password.

#### Scenario: Password mismatch on existing volume
- **WHEN** POSTGRES_PASSWORD is changed but the volume has old data
- **THEN** authentication fails because the existing PostgreSQL data directory retains the original password
