-- Runs before `prisma db push` on every API start (apps/api/Dockerfile).
-- Upgrades a database from before drivers were assigned by the admin: adds Vehicle.driverId and its unique
-- index itself, because db push refuses to add a unique index to an existing table without --accept-data-loss
-- (the column is new and empty, so nothing can be lost). On a new database this does nothing.
DO $$
BEGIN
  IF to_regclass('public."Vehicle"') IS NOT NULL THEN
    ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "driverId" TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS "Vehicle_driverId_key" ON "Vehicle"("driverId");
  END IF;
END $$;
