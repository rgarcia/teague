import { createClerkClient, verifyToken } from "@clerk/backend";
import { json } from "@tanstack/start";
import { Vapi } from "@vapi-ai/server-sdk";
import { gmailClientForToken } from "./gmail";

export type VapiResponse = {
  messageResponse: Vapi.ServerMessageResponseToolCalls;
};

export const createErrorResponse = (
  error: string,
  status: number
): Response => {
  const response: VapiResponse = {
    messageResponse: { error },
  };
  return json(response, { status });
};

export const createToolCallResponse = (
  name: string,
  toolCallId: string,
  result?: string,
  error?: string
): Response => {
  const toolCallResult: Vapi.ToolCallResult = {
    name,
    toolCallId,
    ...(result && { result }),
    ...(error && { error }),
  };

  const response: VapiResponse = {
    messageResponse: {
      results: [toolCallResult],
    },
  };
  return json(response);
};

const clerk = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
});

export async function getUserIdFromClerkJwt(token: string): Promise<string> {
  try {
    const decodedToken = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY!,
    });
    if (!decodedToken?.sub) {
      throw new Error("No user ID found in token");
    }
    return decodedToken.sub;
  } catch (error) {
    console.error("Error verifying token:", error);
    throw error;
  }
}

export async function validateVapiRequest(request: Request): Promise<
  | {
      gmail: ReturnType<typeof gmailClientForToken>;
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
  const gmail = gmailClientForToken(googleToken);

  const msg = (await request.json()) as Vapi.ServerMessage;
  if (msg.message.type !== "tool-calls") {
    return createErrorResponse(`Invalid message type ${msg.message.type}`, 400);
  }

  return { gmail, toolCalls: msg.message.toolCallList };
}
