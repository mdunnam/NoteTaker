import ExternalCaptureClient from "@/components/notes/ExternalCaptureClient";

interface CapturePageProps {
  searchParams?: {
    text?: string | string[];
  };
}

/**
 * Focused capture page used by bookmarklets and other external entry points.
 */
export default function CapturePage({ searchParams }: CapturePageProps) {
  const rawText = Array.isArray(searchParams?.text)
    ? searchParams?.text[0]
    : searchParams?.text;

  return <ExternalCaptureClient initialContent={rawText || ""} />;
}