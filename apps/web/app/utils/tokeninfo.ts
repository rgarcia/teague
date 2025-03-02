import { OauthAccessToken } from "@clerk/backend";
import { OAuth2Client, TokenInfo } from "google-auth-library";
import { clerk } from "~/utils/clerk";

export async function tokeninfo(token: string): Promise<TokenInfo> {
  const auth = new OAuth2Client();
  auth.setCredentials({ access_token: token });
  return auth.getTokenInfo(token);
}

// Interface for cached OAuth token with expiry
interface CachedOAuthToken {
  tokenData: OauthAccessToken;
  expiryDate: number; // Unix timestamp for token expiry
}

// Cache for Google OAuth tokens
const cachedTokens = new Map<string, CachedOAuthToken>();

// Buffer time (in ms) before actual expiry to refresh token (5 minutes)
const TOKEN_REFRESH_BUFFER = 5 * 60 * 1000;
function isTokenExpired(expiryDate: number): boolean {
  return Date.now() + TOKEN_REFRESH_BUFFER > expiryDate;
}

function cachedTokenGet(clerkUserId: string): OauthAccessToken | undefined {
  const cachedToken = cachedTokens.get(clerkUserId);
  if (!cachedToken || isTokenExpired(cachedToken.expiryDate)) {
    return undefined;
  }
  return cachedToken.tokenData;
}

async function cachedTokenSet(
  clerkUserId: string,
  tokenData: OauthAccessToken
): Promise<void> {
  try {
    // Get token expiry information from Google
    const info = await tokeninfo(tokenData.token);

    // Store the token with its expiry date
    cachedTokens.set(clerkUserId, {
      tokenData,
      expiryDate: info.expiry_date,
    });
  } catch (error) {
    console.error("Failed to get token info for caching:", error);
    // If we can't determine expiry, don't cache the token
  }
}

export async function cachedGoogleToken(
  clerkUserId: string
): Promise<OauthAccessToken> {
  // Try to get from cache first
  const tokenData = cachedTokenGet(clerkUserId);
  if (tokenData) {
    return tokenData;
  }

  // If not in cache or expired, fetch from Clerk
  const response = await clerk.users.getUserOauthAccessToken(
    clerkUserId,
    "google"
  );

  // Get the first token (assuming that's the one we want)
  const newTokenData = response.data[0];
  await cachedTokenSet(clerkUserId, newTokenData);
  return newTokenData;
}
