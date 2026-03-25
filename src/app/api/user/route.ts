/**
 * PATCH /api/user - update the current user's profile
 */

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    const updatedUser = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        ...(body.name !== undefined && { name: (body.name as string).trim() || null }),
      },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });

    return NextResponse.json(updatedUser);
  } catch (error) {
    console.error("Error updating user:", error);
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }
}
