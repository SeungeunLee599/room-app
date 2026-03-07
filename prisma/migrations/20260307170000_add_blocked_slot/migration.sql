CREATE TABLE "BlockedSlot" (
    "id" SERIAL NOT NULL,
    "roomName" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startHour" INTEGER NOT NULL,
    "endHour" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlockedSlot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BlockedSlot_weekday_roomName_startHour_idx" ON "BlockedSlot"("weekday", "roomName", "startHour");
