import { createClerkClient, User, verifyToken } from "@clerk/backend";

export const clerk = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
});

interface CachedUser {
  user: User;
  timestamp: number;
}

const CACHE_TTL = 10 * 60 * 1000; // 10 minutes in milliseconds
const cachedUsers = new Map<string, CachedUser>();

function cachedUsersGet(clerkUserId: string): User | undefined {
  const cachedUser = cachedUsers.get(clerkUserId);
  if (!cachedUser || isExpired(cachedUser.timestamp)) {
    return undefined;
  }
  return cachedUser.user;
}

function cachedUsersSet(clerkUserId: string, user: User) {
  cachedUsers.set(clerkUserId, { user, timestamp: Date.now() });
}

function isExpired(timestamp: number): boolean {
  return Date.now() - timestamp > CACHE_TTL;
}

export async function cachedGetUser(clerkUserId: string): Promise<User> {
  let user = cachedUsersGet(clerkUserId);
  if (!user) {
    user = await clerk.users.getUser(clerkUserId);
    cachedUsersSet(clerkUserId, user);
  }
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
