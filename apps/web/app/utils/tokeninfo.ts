import { OauthAccessToken } from "@clerk/backend";
import TTLCache from "@isaacs/ttlcache";
import { OAuth2Client, TokenInfo } from "google-auth-library";
import { clerk } from "~/utils/clerk";

export async function tokeninfo(token: string): Promise<TokenInfo> {
  const auth = new OAuth2Client();
  auth.setCredentials({ access_token: token });
  return auth.getTokenInfo(token);
}

// Buffer time (in ms) before actual expiry to refresh token (5 minutes)
const TOKEN_REFRESH_BUFFER = 5 * 60 * 1000;
const tokenCache = new TTLCache<string, OauthAccessToken>({});

async function cachedTokenSet(
  clerkUserId: string,
  tokenData: OauthAccessToken
): Promise<void> {
  try {
    // Get token expiry information from Google
    const info = await tokeninfo(tokenData.token);

    // Store the token with its expiry date
    const now = Date.now();
    const ttl = info.expiry_date - now - TOKEN_REFRESH_BUFFER;
    tokenCache.set(clerkUserId, tokenData, { ttl });
  } catch (error) {
    console.error("Failed to get token info for caching:", error);
    // If we can't determine expiry, don't cache the token
  }
}

export async function cachedGoogleToken(
  clerkUserId: string
): Promise<OauthAccessToken> {
  const tokenData = tokenCache.get(clerkUserId);
  if (tokenData) {
    return tokenData;
  }
  const response = await clerk.users.getUserOauthAccessToken(
    clerkUserId,
    "google"
  );
  // Get the first token (assuming that's the one we want)
  const newTokenData = response.data[0];
  await cachedTokenSet(clerkUserId, newTokenData);
  return newTokenData;
}
