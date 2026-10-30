-- First-run setup wizard.
--
-- `onboarding_completed` existed but was never read, so every restaurant holds
-- false. Restaurants created before the wizard are already set up (or chose
-- not to be): mark them done, so only new signups are sent through it.
UPDATE "restaurants" SET "onboarding_completed" = true;
