import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

/**
 * Access door — exchanges the operator token for the gate cookie.
 * Constant-time comparison via digest equality.
 */

export const runtime = "nodejs";

const BodySchema = z.object({ token: z.string().min(1) });

function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** Cookie value = sha256(token) hex — the raw secret never leaves the env. */
function digesto(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function POST(request: Request) {
  const expected = process.env.OPERATOR_TOKEN;
  if (!expected) {
    return NextResponse.json({ ok: true, gate: "disabled" });
  }
  let crudo: unknown;
  try {
    crudo = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Solicitud inválida." },
      { status: 400 },
    );
  }
  const parsed = BodySchema.safeParse(crudo);
  if (!parsed.success || !safeEqual(parsed.data.token, expected)) {
    return NextResponse.json(
      { error: "Token incorrecto. Verifica e intenta de nuevo." },
      { status: 401 },
    );
  }
  const res = NextResponse.json({ ok: true });
  // Store the DIGEST, not the token itself — a stolen cookie can no
  // longer reveal the reusable operator secret.
  res.cookies.set("umwelt-operador", digesto(expected), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}
