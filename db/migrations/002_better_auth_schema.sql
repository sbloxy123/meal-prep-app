-- BetterAuth required tables

CREATE TABLE IF NOT EXISTS "user" (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    image TEXT,
    "createdAt" TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS "session" (
    id TEXT PRIMARY KEY,
    "expiresAt" TIMESTAMP NOT NULL,
    token TEXT NOT NULL UNIQUE,
    "createdAt" TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "account" (
    id TEXT PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP,
    "refreshTokenExpiresAt" TIMESTAMP,
    scope TEXT,
    password TEXT,
    "createdAt" TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS "verification" (
    id TEXT PRIMARY KEY,
    identifier TEXT NOT NULL,
    value TEXT NOT NULL,
    "expiresAt" TIMESTAMP NOT NULL,
    "createdAt" TIMESTAMP,
    "updatedAt" TIMESTAMP
);
