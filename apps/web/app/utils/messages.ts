import { createServerFn } from "@tanstack/react-start";
import { Message as DBMessage, NewMessage, asc, db, eq, messages } from "db";
type SaveMessagesInput = {
  messages: Array<NewMessage>;
};

export async function saveMessages({
  messages: messagesToSave,
}: SaveMessagesInput): Promise<void> {
  try {
    await db.insert(messages).values(messagesToSave);
  } catch (error) {
    console.error(`saveMessages '${messagesToSave.length}' error`, error);
    throw error;
  }
}

type GetMessagesByChatIdInput = {
  id: string;
};

export async function getMessagesByChatId({
  id,
}: GetMessagesByChatIdInput): Promise<DBMessage[]> {
  try {
    const result = await db
      .select()
      .from(messages)
      .where(eq(messages.chatId, id))
      .orderBy(asc(messages.createdAt));
    return result;
  } catch (error) {
    console.error("Failed to get messages by chat id from database", error);
    throw error;
  }
}

export const fetchMessagesByChatId = createServerFn({ method: "GET" })
  .validator((chatId: string) => chatId)
  // @ts-ignore
  .handler(async ({ data: chatId }): Promise<DBMessage[]> => {
    try {
      return await getMessagesByChatId({ id: chatId });
    } catch (error) {
      console.error(`fetchMessagesByChatId error for '${chatId}':`, error);
      throw new Error("Failed to fetch messages by chat id");
    }
  });
