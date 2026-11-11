-- CreateEnum
CREATE TYPE "ProfileStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED', 'BANNED');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "GenderPreference" AS ENUM ('SAME_ONLY', 'ANY');

-- CreateEnum
CREATE TYPE "Situation" AS ENUM ('HAS_HOUSING', 'SEEKING');

-- CreateEnum
CREATE TYPE "HousingType" AS ENUM ('ENTREE_COUCHEE', 'CHAMBRE_SALON', 'DEUX_CHAMBRES_SALON', 'TROIS_CHAMBRES_SALON', 'STUDIO', 'AUTRE');

-- CreateEnum
CREATE TYPE "StudyYear" AS ENUM ('L1', 'L2', 'L3', 'M1', 'M2', 'DOCTORAT', 'AUTRE');

-- CreateEnum
CREATE TYPE "StudyTime" AS ENUM ('DAY', 'NIGHT', 'FLEXIBLE');

-- CreateEnum
CREATE TYPE "GuestsFrequency" AS ENUM ('NEVER', 'RARELY', 'SOMETIMES', 'OFTEN');

-- CreateEnum
CREATE TYPE "IdDocumentType" AS ENUM ('CIP', 'CNI');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('AGENT', 'SCAM', 'FAKE_PROFILE', 'INAPPROPRIATE', 'OTHER');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "AdminActionType" AS ENUM ('APPROVE_PROFILE', 'REJECT_PROFILE', 'SUSPEND_USER', 'BAN_USER', 'RESTORE_USER', 'RESOLVE_REPORT', 'DISMISS_REPORT');

-- CreateEnum
CREATE TYPE "BannedIdentityKind" AS ENUM ('GOOGLE_SUB', 'EMAIL', 'WHATSAPP');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "googleSub" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "googleFirstName" TEXT,
    "whatsapp" TEXT,
    "termsAcceptedAt" TIMESTAMP(3),
    "profileStatus" "ProfileStatus",
    "rejectionReason" TEXT,
    "sanctionReason" TEXT,
    "approvedAt" TIMESTAMP(3),
    "profileSubmittedAt" TIMESTAMP(3),
    "idDocumentType" "IdDocumentType",
    "idDocumentUrl" TEXT,
    "studentCardUrl" TEXT,
    "selfieUrl" TEXT,
    "npiHash" TEXT,
    "whatsappVerifiedAt" TIMESTAMP(3),
    "identityVerifiedAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Profile" (
    "userId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "photoUrl" TEXT NOT NULL,
    "age" INTEGER NOT NULL,
    "gender" "Gender" NOT NULL,
    "isStudent" BOOLEAN NOT NULL DEFAULT true,
    "university" TEXT,
    "campus" TEXT,
    "fieldOfStudy" TEXT,
    "studyYear" "StudyYear",
    "situation" "Situation" NOT NULL,
    "housingNeighborhood" TEXT,
    "housingType" "HousingType",
    "housingTotalRent" INTEGER,
    "housingShareAsked" INTEGER,
    "housingAvailableFrom" DATE,
    "maxBudget" INTEGER,
    "preferredNeighborhoods" TEXT[],
    "genderPreference" "GenderPreference" NOT NULL,
    "wakeTime" TEXT NOT NULL,
    "sleepTime" TEXT NOT NULL,
    "studyTime" "StudyTime" NOT NULL,
    "guestsFrequency" "GuestsFrequency" NOT NULL,
    "cleanliness" INTEGER NOT NULL,
    "smoker" BOOLEAN NOT NULL,
    "bio" TEXT,
    "searching" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "ConnectionRequest" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,
    "message" TEXT,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "respondedAt" TIMESTAMP(3),
    "followUpSentAt" TIMESTAMP(3),
    "senderInColoc" BOOLEAN,
    "receiverInColoc" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConnectionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Colocation" (
    "id" TEXT NOT NULL,
    "requestId" TEXT,
    "userAId" TEXT,
    "userBId" TEXT,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Colocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reportedId" TEXT NOT NULL,
    "reason" "ReportReason" NOT NULL,
    "details" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminAction" (
    "id" TEXT NOT NULL,
    "adminId" TEXT,
    "action" "AdminActionType" NOT NULL,
    "targetUserId" TEXT,
    "reportId" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BannedIdentity" (
    "id" TEXT NOT NULL,
    "kind" "BannedIdentityKind" NOT NULL,
    "hash" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BannedIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_googleSub_key" ON "User"("googleSub");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_whatsapp_key" ON "User"("whatsapp");

-- CreateIndex
CREATE UNIQUE INDEX "User_npiHash_key" ON "User"("npiHash");

-- CreateIndex
CREATE INDEX "User_profileStatus_profileSubmittedAt_idx" ON "User"("profileStatus", "profileSubmittedAt");

-- CreateIndex
CREATE INDEX "Profile_searching_gender_idx" ON "Profile"("searching", "gender");

-- CreateIndex
CREATE INDEX "ConnectionRequest_senderId_createdAt_idx" ON "ConnectionRequest"("senderId", "createdAt");

-- CreateIndex
CREATE INDEX "ConnectionRequest_receiverId_status_idx" ON "ConnectionRequest"("receiverId", "status");

-- CreateIndex
CREATE INDEX "ConnectionRequest_status_respondedAt_idx" ON "ConnectionRequest"("status", "respondedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Colocation_requestId_key" ON "Colocation"("requestId");

-- CreateIndex
CREATE INDEX "Report_status_createdAt_idx" ON "Report"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Report_reportedId_idx" ON "Report"("reportedId");

-- CreateIndex
CREATE INDEX "Report_reporterId_reportedId_idx" ON "Report"("reporterId", "reportedId");

-- CreateIndex
CREATE INDEX "AdminAction_createdAt_idx" ON "AdminAction"("createdAt");

-- CreateIndex
CREATE INDEX "AdminAction_targetUserId_idx" ON "AdminAction"("targetUserId");

-- CreateIndex
CREATE INDEX "BannedIdentity_userId_idx" ON "BannedIdentity"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "BannedIdentity_kind_hash_key" ON "BannedIdentity"("kind", "hash");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- AddForeignKey
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectionRequest" ADD CONSTRAINT "ConnectionRequest_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectionRequest" ADD CONSTRAINT "ConnectionRequest_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Colocation" ADD CONSTRAINT "Colocation_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ConnectionRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reportedId_fkey" FOREIGN KEY ("reportedId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminAction" ADD CONSTRAINT "AdminAction_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminAction" ADD CONSTRAINT "AdminAction_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BannedIdentity" ADD CONSTRAINT "BannedIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
