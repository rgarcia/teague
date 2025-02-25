import { createServerFn } from "@tanstack/start";
import { saveChat } from "./chats";

export const createChatWithMessage = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    if (!(data instanceof FormData)) {
      throw new Error("Invalid form data");
    }

    const chatId = data.get("chatId");
    const userId = data.get("userId");
    const initialMessage = data.get("initialMessage");
    if (!userId || !chatId || !initialMessage) {
      throw new Error("Initial message, user ID, and chat ID are required");
    }

    return {
      userId: userId.toString(),
      chatId: chatId.toString(),
      initialMessage: initialMessage.toString(),
    };
  })
  .handler(async ({ data: { chatId, userId, initialMessage } }) => {
    // Create a placeholder title (you might want to generate a better one)
    // TODO: generate a better title
    const title = `Chat started with: ${initialMessage.substring(0, 30)}${
      initialMessage.length > 30 ? "..." : ""
    }`;

    // Save the chat to the database
    await saveChat({
      id: chatId,
      userId,
      title,
    });

    // we store the intiial message in localstorage on the client where it is sent
    // to the LLM after redirect to /chat/$id is loaded
    // await saveMessages({
    //   messages: [{ role: "user", content: initialMessage, chatId }],
    // });
  });
