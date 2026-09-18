import { prisma } from "@/lib/prisma";
import { deleteUploads } from "@/lib/uploads";

export type SavedFile = {
  fileName: string;
  fileUrl: string;
  fileType: string | null;
  fileSize: number;
};

export const urlsOf = (json: string | null) =>
  json ? (JSON.parse(json) as SavedFile[]).map((file) => file.fileUrl) : [];

// Public requests that were never confirmed disappear, and take their files
// with them (uploads are kept on disk until the e-mail is confirmed).
export async function removeExpiredPending(now: Date = new Date()) {
  const expired = await prisma.pendingGuestRequest.findMany({
    where: { expiresAt: { lt: now } },
    select: { id: true, attachments: true },
  });
  if (expired.length === 0) return 0;

  await deleteUploads(expired.flatMap((entry) => urlsOf(entry.attachments)));
  await prisma.pendingGuestRequest.deleteMany({
    where: { id: { in: expired.map((entry) => entry.id) } },
  });

  return expired.length;
}
