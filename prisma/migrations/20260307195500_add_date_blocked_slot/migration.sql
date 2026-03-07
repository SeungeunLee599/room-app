CREATE TABLE "DateBlockedSlot" (
  "id" SERIAL NOT NULL,
  "roomName" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  "startHour" INTEGER NOT NULL,
  "endHour" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DateBlockedSlot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DateBlockedSlot_date_roomName_startHour_idx"
ON "DateBlockedSlot"("date", "roomName", "startHour");
