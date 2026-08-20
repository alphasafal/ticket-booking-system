-- DropIndex
DROP INDEX "BookingSeat_eventSeatId_key";

-- CreateIndex
CREATE INDEX "BookingSeat_eventSeatId_idx" ON "BookingSeat"("eventSeatId");
