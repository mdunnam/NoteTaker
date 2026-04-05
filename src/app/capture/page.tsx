import { auth } from "@/auth";
import ExternalCaptureClient from "@/components/notes/ExternalCaptureClient";
import {
  buildExternalCaptureCallbackPath,
  buildExternalCaptureContent,
  type ExternalCaptureSearchParams,
} from "@/lib/externalCapture";
import { redirect } from "next/navigation";

interface CapturePageProps {
  searchParams?: ExternalCaptureSearchParams;
}

/** Focused capture page used by bookmarklets, installed share targets, and other external entry points. */
export default async function CapturePage({ searchParams = {} }: CapturePageProps) {
  const session = await auth();

  if (!session?.user?.id) {
    const callbackPath = buildExternalCaptureCallbackPath(searchParams);
    redirect(`/login?callbackUrl=${encodeURIComponent(callbackPath)}`);
  }

  return <ExternalCaptureClient initialContent={buildExternalCaptureContent(searchParams)} />;
}