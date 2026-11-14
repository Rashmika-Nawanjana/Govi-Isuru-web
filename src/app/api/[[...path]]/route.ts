import { app } from "../../../../server/src/app";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Allow larger uploads (disease images → ML proxy). */
export const maxDuration = 60;

async function handle(request: Request) {
  return app.handle(request);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
export const HEAD = handle;
