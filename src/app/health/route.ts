import { app } from "../../../server/src/app";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return app.handle(request);
}
