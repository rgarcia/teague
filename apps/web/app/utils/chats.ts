import { myProvider } from "@/lib/ai/models";
import { createServerFn } from "@tanstack/start";
import { generateText, Message } from "ai";
import { Chat, chats, db, desc, eq, messages, votes } from "db";

type GetChatInput = {
  chatId: string;
};

export async function getChat({ chatId }: GetChatInput): Promise<Chat | null> {
  const select = await db.select().from(chats).where(eq(chats.id, chatId));
  if (select.length === 0) {
    console.log(`DEBUG getChat '${chatId}' found no chat`);
    return null;
  }
  return select[0];
}

export const fetchChatServer = createServerFn({ method: "GET" })
  .validator((chatId: string) => chatId)
  .handler(async ({ data: chatId }) => {
    return getChat({ chatId });
  });

type SaveChatInput = {
  id: string;
  userId: string;
  title: string;
};

export async function saveChat({
  id,
  userId,
  title,
}: SaveChatInput): Promise<void> {
  console.log("DEBUG saveChat", id, userId, title);
  try {
    await db.insert(chats).values({
      id,
      userId,
      title,
    });
  } catch (error) {
    console.error("Failed to save chat in database");
    throw error;
  }
}

export const saveChatServer = createServerFn({ method: "POST" })
  .validator((chat: Chat) => chat)
  .handler(async ({ data: chat }) => {
    await saveChat(chat);
  });

type DeleteChatInput = {
  id: string;
};

export async function deleteChatById({ id }: DeleteChatInput): Promise<void> {
  try {
    await db.delete(votes).where(eq(votes.chatId, id));
    await db.delete(messages).where(eq(messages.chatId, id));
    await db.delete(chats).where(eq(chats.id, id));
  } catch (error) {
    console.error("Failed to delete chat by id from database");
    throw error;
  }
}

type GetChatsByUserIdInput = {
  id: string;
};

export async function getChatsByUserId({
  id,
}: GetChatsByUserIdInput): Promise<Chat[]> {
  try {
    return await db
      .select()
      .from(chats)
      .where(eq(chats.userId, id))
      .orderBy(desc(chats.createdAt));
  } catch (error) {
    console.error("Failed to get chats by user from database");
    throw error;
  }
}

type GenerateChatTitleInput = {
  message: Message;
};

export async function generateChatTitle({
  message,
}: GenerateChatTitleInput): Promise<string> {
  try {
    const { text: title } = await generateText({
      model: myProvider.languageModel("title-model"),
      system: `
      - you will generate a short title based on the first message a user begins a conversation with
      - ensure it is not more than 80 characters long
      - the title should be a summary of the user's message
      - do not use quotes or colons`,
      prompt: JSON.stringify(message),
    });

    return title;
  } catch (error) {
    console.error("Failed to generate chat title");
    throw error;
  }
}

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
    await saveChat({
      id: chatId,
      userId,
      title,
    });
  });
