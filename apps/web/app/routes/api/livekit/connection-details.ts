import type { ConnectionDetails } from "@/lib/livekit/types";
import { getAuth } from "@clerk/tanstack-start/server";
import { json } from "@tanstack/react-start";
import { createAPIFileRoute } from "@tanstack/react-start/api";
import { cachedGetUser } from "clerk-util";
import {
  AccessToken,
  AccessTokenOptions,
  VideoGrant,
} from "livekit-server-sdk";
import { cachedGoogleToken } from "tools/tokeninfo";

const API_KEY = process.env.LIVEKIT_API_KEY;
const API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_URL = process.env.LIVEKIT_URL;

export const APIRoute = createAPIFileRoute("/api/livekit/connection-details")({
  GET: async ({ request, params }) => {
    try {
      if (LIVEKIT_URL === undefined) {
        throw new Error("LIVEKIT_URL is not defined");
      }
      if (API_KEY === undefined) {
        throw new Error("LIVEKIT_API_KEY is not defined");
      }
      if (API_SECRET === undefined) {
        throw new Error("LIVEKIT_API_SECRET is not defined");
      }
      // Generate participant token
      const participantIdentity = `voice_assistant_user_${Math.floor(
        Math.random() * 10_000
      )}`;
      const roomName = `voice_assistant_room_${Math.floor(
        Math.random() * 10_000
      )}`;
      const { userId: clerkUserId } = await getAuth(request);
      if (!clerkUserId) {
        return json({ error: "Unauthorized" }, { status: 401 });
      }
      const [clerkUser, { token: googleToken }] = await Promise.all([
        cachedGetUser(clerkUserId),
        cachedGoogleToken(clerkUserId),
      ]);
      const participantToken = await createParticipantToken(
        {
          identity: participantIdentity,
          attributes: {
            googleToken,
            user: JSON.stringify({
              firstName: clerkUser.firstName ?? "",
              lastName: clerkUser.lastName ?? "",
              clerkId: clerkUserId,
            }),
          },
        },
        roomName
      );
      const data: ConnectionDetails = {
        serverUrl: LIVEKIT_URL,
        roomName,
        participantToken: participantToken,
        participantName: participantIdentity,
      };
      const headers = new Headers({
        "Cache-Control": "no-store",
      });

      return new Response(JSON.stringify(data), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      });
    } catch (error) {
      console.error("Error generating connection details:", error);
      return new Response(
        JSON.stringify({
          error: error instanceof Error ? error.message : "Unknown error",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  },
});

function createParticipantToken(
  userInfo: AccessTokenOptions,
  roomName: string
) {
  const at = new AccessToken(API_KEY, API_SECRET, {
    ...userInfo,
    ttl: "15m",
  });
  const grant: VideoGrant = {
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canPublishData: true,
    canSubscribe: true,
  };
  at.addGrant(grant);
  return at.toJwt();
}
