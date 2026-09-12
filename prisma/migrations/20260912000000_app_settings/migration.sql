-- Platform settings an administrator can change from the UI without a
-- redeploy. Secret values are stored as AES-256-GCM ciphertext, so a database
-- dump does not expose third-party credentials in plain text.
CREATE TABLE "app_settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "encrypted" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);
