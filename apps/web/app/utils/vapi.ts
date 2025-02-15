import { createClerkClient, verifyToken } from "@clerk/backend";
import { json } from "@tanstack/start";
import { Vapi } from "@vapi-ai/server-sdk";

export type VapiResponse = {
  messageResponse: Vapi.ServerMessageResponseToolCalls;
};

export function createErrorResponse(message: string, status: number): Response {
  return json(
    {
      messageResponse: {
        results: [
          {
            error: message,
          },
        ],
      },
    },
    { status }
  );
}

const clerk = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
});

async function getUserIdFromClerkJwt(token: string): Promise<string | null> {
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

export async function validateVapiRequest(request: Request): Promise<
  | {
      googleToken: string;
      toolCalls: Vapi.ToolCall[];
    }
  | Response
> {
  const vapiSecret = request.headers.get("x-vapi-secret");
  if (!vapiSecret) {
    return createErrorResponse("No token provided", 401);
  }

  const userId = await getUserIdFromClerkJwt(vapiSecret);
  if (!userId) {
    return createErrorResponse("Invalid token in x-vapi-secret header", 401);
  }

  const response = await clerk.users.getUserOauthAccessToken(userId, "google");
  const googleToken = response.data[0].token;

  const msg = (await request.json()) as Vapi.ServerMessage;
  if (msg.message.type !== "tool-calls") {
    return createErrorResponse(`Invalid message type ${msg.message.type}`, 400);
  }

  return { googleToken, toolCalls: msg.message.toolCallList };
}
