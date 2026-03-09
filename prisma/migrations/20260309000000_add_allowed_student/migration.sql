CREATE TABLE "AllowedStudent" (
  "studentId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AllowedStudent_pkey" PRIMARY KEY ("studentId")
);

CREATE INDEX "AllowedStudent_name_idx"
ON "AllowedStudent"("name");