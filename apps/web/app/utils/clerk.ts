import { createClerkClient, verifyToken } from "@clerk/backend";

export const clerk = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
});

export async function getUserIdFromClerkJwt(
  token: string
): Promise<string | null> {
  try {
    const { sub } = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY!,
    });
    return sub;
  } catch (error) {
    console.error("Failed to verify token:", error);
    return null;
  }
}
