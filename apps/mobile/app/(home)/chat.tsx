import React, { useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  useColorScheme,
  TextInput,
  Platform,
  ActivityIndicator,
  FlatList,
  Keyboard,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  KeyboardAwareScrollView,
  KeyboardToolbar,
} from "react-native-keyboard-controller";
import { useVapi, CALL_STATUS } from "@/hooks/useVapi";
import { Colors } from "@/constants/colors";
import { useRef, useState, useMemo } from "react";
import { Vapi } from "@vapi-ai/server-sdk";
import { useAuth } from "@clerk/clerk-expo";
import Ionicons from "@expo/vector-icons/Ionicons";

type ConversationMessage = Vapi.ClientMessageConversationUpdateMessagesItem;

interface CondensedMessage {
  type: "user" | "bot" | "tool";
  messages: string[];
  time: number;
  toolCall?: {
    name: string;
    arguments: string;
    result?: string;
  };
}

interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

// isToolCall handles the fact that the Vapi SDK types have "unknown" bodies for tool call messages contained in the conversation update message.
function isToolCall(obj: unknown): ToolCall | null {
  if (typeof obj !== "object" || obj === null) return null;

  const tc = obj as Record<string, unknown>;

  if (
    "id" in tc &&
    typeof tc.id === "string" &&
    "type" in tc &&
    tc.type === "function" &&
    "function" in tc &&
    typeof tc.function === "object" &&
    tc.function !== null
  ) {
    const func = tc.function as Record<string, unknown>;
    if (
      "name" in func &&
      typeof func.name === "string" &&
      "arguments" in func &&
      typeof func.arguments === "string"
    ) {
      return {
        id: tc.id,
        type: "function",
        function: {
          name: func.name,
          arguments: func.arguments,
        },
      };
    }
  }

  return null;
}

const condenseMessages = (
  messages: ConversationMessage[]
): CondensedMessage[] => {
  if (!messages) return [];

  const condensed: CondensedMessage[] = [];
  let currentBotMessage: CondensedMessage | null = null;
  const toolCalls: Record<string, CondensedMessage> = {};

  for (const message of messages) {
    if ("role" in message) {
      switch (message.role) {
        case "system":
          // Ignore system messages
          break;

        case "user":
          // Flush any pending bot message
          if (currentBotMessage) {
            condensed.push(currentBotMessage);
            currentBotMessage = null;
          }
          if ("message" in message) {
            condensed.push({
              type: "user",
              messages: [message.message],
              time: message.time,
            });
          }
          break;

        case "bot":
          if ("message" in message) {
            if (!currentBotMessage) {
              currentBotMessage = {
                type: "bot",
                messages: [],
                time: message.time,
              };
            }
            currentBotMessage.messages.push(message.message);
          }
          break;

        case "tool_calls":
          // Flush any pending bot message
          if (currentBotMessage) {
            condensed.push(currentBotMessage);
            currentBotMessage = null;
          }

          if ("toolCalls" in message && message.toolCalls.length > 0) {
            const potentialToolCall = message.toolCalls[0];
            const toolCall = isToolCall(potentialToolCall);
            if (toolCall === null) {
              console.log(
                "[tool-call] Unexpected tool call structure:",
                potentialToolCall
              );
            } else {
              const toolMessage: CondensedMessage = {
                type: "tool",
                messages: [],
                time: message.time,
                toolCall: {
                  name: toolCall.function.name,
                  arguments: toolCall.function.arguments,
                },
              };
              toolCalls[toolCall.id] = toolMessage;
              condensed.push(toolMessage);
            }
          }
          break;

        case "tool_call_result":
          if ("toolCallId" in message && "result" in message) {
            const toolMessage = toolCalls[message.toolCallId];
            if (toolMessage && toolMessage.toolCall) {
              toolMessage.toolCall.result = message.result;
            }
          }
          break;
      }
    }
  }

  // Flush any remaining bot message
  if (currentBotMessage) {
    condensed.push(currentBotMessage);
  }

  return condensed;
};

function inProgressText(toolName: string) {
  switch (toolName) {
    case "GetNextEmail":
      return "Getting next email";
    case "ArchiveEmail":
      return "Archiving email";
    case "FilterSender":
      return "Filtering sender from inbox";
    case "AcceptInvite":
      return "Accepting calendar invite";
    case "Unsubscribe":
      return "Unsubscribing from sender";
    case "CreateDraftReply":
      return "Creating draft reply";
    case "UpdateDraftReply":
      return "Updating draft reply";
    case "DeleteDraft":
      return "Deleting draft reply";
    case "SendDraft":
      return "Sending draft";
    default:
      return toolName;
  }
}

const MessageItem = ({ message }: { message: CondensedMessage }) => {
  const colorScheme = useColorScheme() ?? "light";
  const themedStyles = styles[colorScheme];

  const renderToolResult = () => {
    if (!message.toolCall?.result) {
      return (
        <View style={themedStyles.loadingContainer}>
          <ActivityIndicator size="small" color={Colors[colorScheme].icon} />
          <Text style={[themedStyles.messageText, themedStyles.loadingText]}>
            {inProgressText(message.toolCall?.name ?? "")}
          </Text>
        </View>
      );
    }

    try {
      const result = JSON.parse(message.toolCall.result);

      switch (message.toolCall.name) {
        case "ArchiveEmail":
          return (
            <Text style={themedStyles.messageText}>
              {result.success
                ? "✓ Email archived"
                : "⚠️ Failed to archive email"}
            </Text>
          );
        case "FilterSender":
          return (
            <Text style={themedStyles.messageText}>
              {result.success
                ? "✓ Sender filtered"
                : "⚠️ Failed to filter sender"}
            </Text>
          );
        case "AcceptInvite":
          return (
            <Text style={themedStyles.messageText}>
              {result.success
                ? "✓ Invite accepted"
                : "⚠️ Failed to accept invite"}
            </Text>
          );
        case "Unsubscribe":
          return (
            <Text style={themedStyles.messageText}>
              {result.success ? "✓ Unsubscribed" : "⚠️ Failed to unsubscribe"}
            </Text>
          );

        case "GetNextEmail": {
          if (!result.content) return <Text>No email found</Text>;
          const from = (
            result.content
              .split("\n")
              .find((l: string) => l.startsWith("From:")) ?? ""
          )
            .replace("From: ", "")
            .trim();
          const subject = (
            result.content
              .split("\n")
              .find((l: string) => l.startsWith("Subject:")) ?? ""
          )
            .replace("Subject: ", "")
            .trim();
          return (
            <View style={themedStyles.emailPreview}>
              <Text style={themedStyles.emailField}>
                <Text style={themedStyles.emailLabel}>From: </Text>
                {from}
              </Text>
              <Text style={themedStyles.emailField}>
                <Text style={themedStyles.emailLabel}>Subject: </Text>
                {subject}
              </Text>
            </View>
          );
        }
        case "CreateDraftReply":
          return (
            <View style={themedStyles.emailPreview}>
              <Text style={themedStyles.messageText}>
                {result.body ? result.body : "⚠️ Failed to create draft"}
              </Text>
            </View>
          );
        case "UpdateDraftReply":
          return (
            <View style={themedStyles.emailPreview}>
              <Text style={themedStyles.messageText}>
                {result.body ? result.body.trim() : "⚠️ Failed to update draft"}
              </Text>
            </View>
          );
        case "DeleteDraft":
          return (
            <Text style={themedStyles.messageText}>
              {result.success ? "✓ Draft deleted" : "⚠️ Failed to delete draft"}
            </Text>
          );
        case "SendDraft":
          return (
            <Text style={themedStyles.messageText}>
              {result.messageId ? "✓ Draft sent" : "⚠️ Failed to send draft"}
            </Text>
          );

        default:
          return (
            <Text style={themedStyles.messageText}>
              Result: {message.toolCall.result}
            </Text>
          );
      }
    } catch (e) {
      return (
        <Text style={[themedStyles.messageText, themedStyles.errorText]}>
          Error parsing result: {message.toolCall.result}
        </Text>
      );
    }
  };

  switch (message.type) {
    case "user":
      return (
        <View
          style={[
            themedStyles.messageContainer,
            themedStyles.transcriptMessage,
          ]}
        >
          <Text style={themedStyles.messageRole}>User</Text>
          <Text style={themedStyles.messageText}>{message.messages[0]}</Text>
        </View>
      );

    case "bot":
      return (
        <View
          style={[
            themedStyles.messageContainer,
            themedStyles.transcriptMessage,
          ]}
        >
          <Text style={themedStyles.messageRole}>Assistant</Text>
          <Text style={themedStyles.messageText}>
            {message.messages.join(" ")}
          </Text>
        </View>
      );

    case "tool":
      const isError = message.toolCall?.result === "No result returned.";
      const inProgress = message.toolCall?.result === null;
      return (
        <View
          style={[
            themedStyles.messageContainer,
            isError
              ? themedStyles.errorMessage
              : themedStyles.functionResultMessage,
          ]}
        >
          {renderToolResult()}
        </View>
      );

    default:
      return null;
  }
};

export default function Page() {
  const { toggleCall, callStatus, conversation, send, setMuted, isMuted } =
    useVapi();
  const { getToken } = useAuth();
  const colorScheme = useColorScheme() ?? "light";
  const themedStyles = styles[colorScheme];
  const [inputText, setInputText] = useState("");
  const flatListRef = useRef<FlatList>(null);

  const condensedMessages = useMemo(() => {
    if (!conversation?.messages) return [];
    return condenseMessages(conversation.messages);
  }, [conversation?.messages]);

  const getButtonText = () => {
    switch (callStatus) {
      case CALL_STATUS.ACTIVE:
        return "Stop Conversation";
      case CALL_STATUS.LOADING:
        return "Start Conversation";
      case CALL_STATUS.INACTIVE:
      default:
        return "Start Conversation";
    }
  };

  const handleSend = () => {
    if (!inputText.trim()) return;

    send({
      type: "add-message",
      message: {
        role: "user",
        content: inputText.trim(),
      },
    });
    setInputText("");
  };

  const handleToggleCall = async () => {
    const token = await getToken({ template: "conversationtoken" });
    if (!token) {
      console.error("No token found");
      return;
    }
    toggleCall({
      serverUrlSecret: token,
    });
  };

  const renderItem = ({ item: message }: { item: CondensedMessage }) => (
    <MessageItem message={message} />
  );

  // scroll to bottom when keyboard is shown
  useEffect(() => {
    const keyboardShowListener = Keyboard.addListener("keyboardDidShow", () => {
      if (flatListRef.current) {
        flatListRef.current.scrollToEnd({ animated: true });
      }
    });
    return () => {
      keyboardShowListener.remove();
    };
  }, []);

  return (
    <SafeAreaView style={themedStyles.container} edges={[]}>
      <KeyboardAwareScrollView
        style={themedStyles.keyboardAware}
        contentContainerStyle={themedStyles.keyboardAwareContent}
        keyboardShouldPersistTaps="handled"
        ScrollViewComponent={View} // we don't actually want it to scroll (the flatlist will do that)
      >
        <View style={themedStyles.header}>
          <View style={themedStyles.headerButtons}>
            <Pressable
              onPress={handleToggleCall}
              disabled={callStatus === CALL_STATUS.LOADING}
              style={({ pressed }) => [
                themedStyles.button,
                pressed && themedStyles.buttonPressed,
                callStatus === CALL_STATUS.LOADING &&
                  themedStyles.buttonDisabled,
                callStatus === CALL_STATUS.ACTIVE && themedStyles.buttonActive,
              ]}
            >
              <Text style={themedStyles.buttonText}>{getButtonText()}</Text>
            </Pressable>

            <Pressable
              onPress={() => setMuted(!isMuted())}
              disabled={callStatus !== CALL_STATUS.ACTIVE}
              style={({ pressed }) => [
                themedStyles.muteButton,
                pressed && themedStyles.buttonPressed,
                callStatus !== CALL_STATUS.ACTIVE &&
                  themedStyles.muteButtonDisabled,
              ]}
            >
              <Ionicons
                name={
                  callStatus === CALL_STATUS.ACTIVE
                    ? isMuted()
                      ? "mic-off"
                      : "mic"
                    : "mic-off"
                }
                size={20}
                color={Colors[colorScheme].text}
              />
            </Pressable>
          </View>
        </View>

        <FlatList
          data={condensedMessages}
          renderItem={renderItem}
          keyExtractor={(_, index) => index.toString()}
          contentContainerStyle={[
            themedStyles.flatListContent,
            { flexGrow: 1, justifyContent: "flex-end" },
          ]}
          style={themedStyles.flatList}
          onContentSizeChange={() => {
            if (flatListRef.current) {
              flatListRef.current.scrollToEnd({ animated: true });
            }
          }}
          ref={flatListRef}
        />

        <View style={themedStyles.inputContainer}>
          <TextInput
            style={themedStyles.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Type a message..."
            placeholderTextColor={Colors[colorScheme].icon}
            onSubmitEditing={handleSend}
          />
          <Pressable
            onPress={handleSend}
            style={({ pressed }) => [
              themedStyles.sendButton,
              pressed && themedStyles.buttonPressed,
            ]}
          >
            <Text style={themedStyles.sendButtonText}>↑</Text>
          </Pressable>
        </View>
      </KeyboardAwareScrollView>
      <KeyboardToolbar />
    </SafeAreaView>
  );
}

const createThemedStyles = (theme: "light" | "dark") =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: Colors[theme].background,
    },
    keyboardAware: {
      flex: 1,
    },
    keyboardAwareContent: {
      flexGrow: 1,
    },
    header: {
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: Colors[theme].border,
      alignItems: "center",
    },
    scrollView: {
      flex: 1,
    },
    scrollViewContent: {
      padding: 16,
    },
    messageContainer: {
      marginBottom: 12,
      padding: 12,
      borderRadius: 8,
      borderWidth: 1,
    },
    transcriptMessage: {
      backgroundColor: Colors[theme].surfaceSubtle,
      borderColor: Colors[theme].border,
    },
    functionCallMessage: {
      backgroundColor: Colors[theme].surfaceInfo,
      borderColor: Colors[theme].tint,
      padding: 16,
    },
    functionResultMessage: {
      backgroundColor: Colors[theme].surfaceSuccess,
      borderColor: Colors[theme].borderSuccess,
      padding: 16,
    },
    messageRole: {
      color: Colors[theme].icon,
      fontSize: 12,
      marginBottom: 4,
      textTransform: "capitalize",
    },
    messageText: {
      color: Colors[theme].text,
      fontSize: 14,
    },
    inputContainer: {
      flexDirection: "row",
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: Platform.OS === "ios" ? 16 : 16,
    },
    input: {
      minHeight: 48,
      flex: 1,
      backgroundColor: Colors[theme].inputBackground,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: Colors[theme].inputBorder,
      paddingHorizontal: 16,
      paddingVertical: 8,
      marginRight: 8,
      color: Colors[theme].text,
    },
    sendButton: {
      backgroundColor: Colors[theme].buttonPrimary,
      width: 72,
      height: 48,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
    },
    sendButtonText: {
      color: Colors[theme].background,
      fontSize: 20,
    },
    button: {
      backgroundColor: Colors[theme].buttonPrimary,
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: Colors[theme].border,
    },
    buttonPressed: {
      backgroundColor: Colors[theme].buttonPrimaryPressed,
    },
    buttonDisabled: {
      opacity: 0.5,
    },
    buttonActive: {
      backgroundColor: Colors[theme].buttonSecondary,
    },
    buttonText: {
      color: Colors[theme].buttonPrimaryText,
      fontSize: 16,
      fontWeight: "500",
    },
    statusMessage: {
      backgroundColor: Colors[theme].surfaceSubtle,
      borderColor: Colors[theme].border,
    },
    errorMessage: {
      backgroundColor: Colors[theme].surfaceError,
      borderColor: Colors[theme].borderError,
      borderWidth: 1,
    },
    errorText: {
      color: Colors[theme].danger,
    },
    emailPreview: {
      padding: 8,
      backgroundColor: Colors[theme].background,
      borderRadius: 6,
    },
    emailField: {
      color: Colors[theme].text,
      fontSize: 14,
      marginBottom: 4,
    },
    emailLabel: {
      fontWeight: "500",
      color: Colors[theme].icon,
    },
    loadingContainer: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: 8,
      gap: 8,
    },
    loadingText: {
      opacity: 0.7,
    },
    flatList: {
      flex: 1,
    },
    flatListContent: {
      padding: 8,
    },
    headerButtons: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    muteButton: {
      backgroundColor: Colors[theme].buttonSecondary,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: Colors[theme].border,
    },
    muteButtonDisabled: {
      opacity: 0.5,
    },
    muteButtonText: {
      fontSize: 16,
      color: Colors[theme].buttonSecondaryText,
    },
  });

const styles = {
  light: createThemedStyles("light"),
  dark: createThemedStyles("dark"),
} as const;
