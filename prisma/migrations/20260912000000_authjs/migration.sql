-- Move authentication off Supabase and into this database.
--
-- The Supabase project backing auth no longer exists, so nobody can sign in.
-- These are the tables Auth.js needs, plus the columns it expects on users.

-- Existing rows were keyed by the Supabase auth uid, which had no default.
-- New users are created locally from here on, so give the column one.
ALTER TABLE "users" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;

-- Password sign-in. Null for accounts that only ever use Google, so a
-- password is never invented for them.
ALTER TABLE "users" ADD COLUMN "password_hash" TEXT;

-- Auth.js reads these two by name.
ALTER TABLE "users" ADD COLUMN "email_verified" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "image" TEXT;

-- One row per external identity linked to a user.
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_account_id" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "accounts_provider_provider_account_id_key"
    ON "accounts"("provider", "provider_account_id");
CREATE INDEX "accounts_user_id_idx" ON "accounts"("user_id");

ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Database-backed sessions, so signing out on the server revokes access
-- immediately rather than waiting for a token to expire.
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "session_token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sessions_session_token_key" ON "sessions"("session_token");
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Short-lived tokens for email verification and password resets.
CREATE TABLE "verification_tokens" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

CREATE UNIQUE INDEX "verification_tokens_token_key" ON "verification_tokens"("token");
CREATE UNIQUE INDEX "verification_tokens_identifier_token_key"
    ON "verification_tokens"("identifier", "token");
