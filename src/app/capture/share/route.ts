import { buildExternalCaptureCallbackPath } from "@/lib/externalCapture";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /capture/share
 * Share-target handoff route that converts posted browser share data into the standard /capture query shape.
 */
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const title = formData.get("title");
  const text = formData.get("text");
  const url = formData.get("url");

  const redirectPath = buildExternalCaptureCallbackPath({
    title: typeof title === "string" ? title : undefined,
    text: typeof text === "string" ? text : undefined,
    url: typeof url === "string" ? url : undefined,
  });

  return NextResponse.redirect(new URL(redirectPath, request.url), 303);
}