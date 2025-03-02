import { createClerkClient, User, verifyToken } from "@clerk/backend";
import TTLCache from "@isaacs/ttlcache";

export const clerk = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
});

const userCache = new TTLCache<string, User>({
  ttl: 10 * 60 * 1000, // 10 minutes in milliseconds
});

export async function cachedGetUser(clerkUserId: string): Promise<User> {
  const cachedUser = userCache.get(clerkUserId);
  if (cachedUser) {
    return cachedUser;
  }

  const user = await clerk.users.getUser(clerkUserId);
  userCache.set(clerkUserId, user);
  return user;
}

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
