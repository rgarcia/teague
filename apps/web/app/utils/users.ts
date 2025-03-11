import { getAuth } from "@clerk/tanstack-start/server";
import TTLCache from "@isaacs/ttlcache";
import { createServerFn } from "@tanstack/react-start";
import { getWebRequest } from "@tanstack/react-start/server";
import { clerk } from "clerk-util";
import { db, eq, User, users } from "db";

type GetUserInput = {
  clerkUserId: string;
};

const getUserCache = new TTLCache<string, User>({
  ttl: 1000 * 60 * 60 * 2, // 2 hours
});

export async function cachedGetUser({
  clerkUserId,
}: GetUserInput): Promise<User> {
  try {
    const cachedUser = getUserCache.get(clerkUserId);
    if (cachedUser) {
      return cachedUser;
    }
    const user = await getUser({ clerkUserId });
    getUserCache.set(clerkUserId, user);
    return user;
  } catch (error) {
    console.error(`cachedGetUser '${clerkUserId}' error`, error);
    throw error;
  }
}

export async function getUser({ clerkUserId }: GetUserInput): Promise<User> {
  try {
    const findUser = async (clerkUserId: string): Promise<User | null> => {
      const existingUsers = await db
        .select()
        .from(users)
        .where(eq(users.clerkId, clerkUserId));
      return existingUsers.length > 0 ? existingUsers[0] : null;
    };

    const user = await findUser(clerkUserId);
    if (user) {
      return user as User;
    }

    const clerkUser = await clerk.users.getUser(clerkUserId);
    await db.insert(users).values({
      clerkId: clerkUserId,
      email: clerkUser.emailAddresses[0].emailAddress,
    });
    const createdUser = await findUser(clerkUserId);
    if (!createdUser) throw new Error("Failed to create user");
    return createdUser;
  } catch (error) {
    console.error(`getUser '${clerkUserId}' error`, error);
    throw error;
  }
}

// Server function to fetch user data
export const fetchUserServer = createServerFn({ method: "GET" }).handler(
  async () => {
    const { userId: clerkUserId } = await getAuth(getWebRequest()!);
    if (!clerkUserId) {
      return null;
    }

    try {
      const user = await getUser({ clerkUserId });
      return user;
    } catch (error) {
      console.error(`Server fetchUser error for '${clerkUserId}':`, error);
      throw new Error("Failed to fetch user data");
    }
  }
);
