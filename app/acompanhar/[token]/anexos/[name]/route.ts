import { prisma } from "@/lib/prisma";
import { isValidTokenFormat } from "@/lib/publicRequest";
import { serveUpload, UPLOAD_URL_PREFIX } from "@/lib/uploads";

// Attachment download for guest requesters: the tracking token is the only
// credential, and only messages visible to the requester are reachable.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string; name: string }> },
) {
  const { token, name } = await params;

  const attachment = isValidTokenFormat(token)
    ? await prisma.projectLogAttachment.findFirst({
        where: {
          fileUrl: `${UPLOAD_URL_PREFIX}${name}`,
          log: { isInternal: false, project: { trackingToken: token } },
        },
        select: { fileName: true },
      })
    : null;

  if (!attachment) {
    return new Response("Arquivo nao encontrado", { status: 404 });
  }

  return serveUpload(name, attachment.fileName);
}
