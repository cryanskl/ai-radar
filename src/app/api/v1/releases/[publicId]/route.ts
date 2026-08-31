import { publicApiNotFound } from "@/public-api/response";

export async function GET() {
  return publicApiNotFound("Public Data Release does not exist");
}
