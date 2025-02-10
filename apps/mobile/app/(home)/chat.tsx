import {
  StyleSheet,
  Text,
  View,
  Pressable,
  useColorScheme,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useVapi, CALL_STATUS } from "@/hooks/useVapi";
import { Colors } from "@/constants/colors";
import { useRef, useState, useMemo } from "react";
import { Vapi } from "@vapi-ai/server-sdk";
import { useAuth } from "@clerk/clerk-expo";
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

const MessageItem = ({ message }: { message: CondensedMessage }) => {
  const colorScheme = useColorScheme() ?? "light";
  const themedStyles = styles[colorScheme];

  const renderToolResult = () => {
    if (!message.toolCall?.result) {
      return (
        <View style={themedStyles.loadingContainer}>
          <ActivityIndicator size="small" color={Colors[colorScheme].icon} />
          <Text style={[themedStyles.messageText, themedStyles.loadingText]}>
            Processing
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

        case "GetNextEmail": {
          if (!result.content) return <Text>No email found</Text>;
          const { from, subject } = result.content;
          return (
            <View style={themedStyles.emailPreview}>
              <Text style={themedStyles.emailField}>
                <Text style={themedStyles.emailLabel}>From:</Text> {from}
              </Text>
              <Text style={themedStyles.emailField}>
                <Text style={themedStyles.emailLabel}>Subject:</Text> {subject}
              </Text>
            </View>
          );
        }

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
      return (
        <View
          style={[
            themedStyles.messageContainer,
            isError
              ? themedStyles.errorMessage
              : message.toolCall?.result
              ? themedStyles.functionResultMessage
              : themedStyles.functionCallMessage,
          ]}
        >
          <Text style={[themedStyles.messageRole, { textTransform: "none" }]}>
            {message.toolCall?.name}
          </Text>
          {renderToolResult()}
        </View>
      );

    default:
      return null;
  }
};

export default function Index() {
  const { toggleCall, callStatus, conversation, send } = useVapi();
  const { getToken } = useAuth();
  const colorScheme = useColorScheme() ?? "light";
  const themedStyles = styles[colorScheme];
  const [inputText, setInputText] = useState("");
  const scrollViewRef = useRef<ScrollView>(null);

  const condensedMessages = useMemo(() => {
    if (!conversation?.messages) return [];
    return condenseMessages(conversation.messages);
  }, [conversation?.messages]);

  const getButtonText = () => {
    switch (callStatus) {
      case CALL_STATUS.ACTIVE:
        return "Stop Conversation";
      case CALL_STATUS.LOADING:
        return "Loading...";
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
    const token = await getToken();
    if (!token) {
      console.error("No token found");
      return;
    }
    toggleCall({
      serverUrlSecret: token,
    });
  };

  return (
    <SafeAreaView style={themedStyles.container} edges={[]}>
      <KeyboardAvoidingView
        style={themedStyles.keyboardAvoidingView}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={themedStyles.header}>
          <Pressable
            onPress={handleToggleCall}
            disabled={callStatus === CALL_STATUS.LOADING}
            style={({ pressed }) => [
              themedStyles.button,
              pressed && themedStyles.buttonPressed,
              callStatus === CALL_STATUS.LOADING && themedStyles.buttonDisabled,
              callStatus === CALL_STATUS.ACTIVE && themedStyles.buttonActive,
            ]}
          >
            <Text style={themedStyles.buttonText}>{getButtonText()}</Text>
          </Pressable>
        </View>

        <ScrollView
          ref={scrollViewRef}
          style={themedStyles.scrollView}
          contentContainerStyle={themedStyles.scrollViewContent}
          onContentSizeChange={() =>
            scrollViewRef.current?.scrollToEnd({ animated: true })
          }
        >
          {condensedMessages.map((message, index) => (
            <MessageItem key={index} message={message} />
          ))}
        </ScrollView>

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
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createThemedStyles = (theme: "light" | "dark") =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: Colors[theme].background,
    },
    keyboardAvoidingView: {
      flex: 1,
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
      paddingBottom: 24,
    },
    input: {
      minHeight: 48,
      flex: 1,
      backgroundColor: Colors[theme].surfaceSubtle,
      borderRadius: 16,
      paddingHorizontal: 16,
      paddingVertical: 8,
      marginRight: 8,
      color: Colors[theme].text,
    },
    sendButton: {
      backgroundColor: Colors[theme].tint,
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
      backgroundColor: Colors[theme].tint,
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 8,
    },
    buttonPressed: {
      opacity: 0.7,
    },
    buttonDisabled: {
      opacity: 0.5,
    },
    buttonActive: {
      backgroundColor: Colors[theme].danger,
    },
    buttonText: {
      color: Colors[theme].background,
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
      marginTop: 8,
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
  });

const styles = {
  light: createThemedStyles("light"),
  dark: createThemedStyles("dark"),
} as const;
