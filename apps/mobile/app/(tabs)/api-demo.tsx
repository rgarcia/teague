import { useState, useEffect, useRef } from "react";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { Audio } from "expo-av";
import {
  Pressable,
  SafeAreaView,
  StyleSheet,
  View,
  Text,
  ActivityIndicator,
  TextInput,
  Switch,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
// https://github.com/openai/openai-node/blob/main/src/resources/beta/realtime/realtime.ts
import type {
  ConversationItemCreateEvent,
  RealtimeClientEvent,
  SessionUpdateEvent,
} from "openai/resources/beta/realtime/realtime";

import {
  mediaDevices,
  RTCPeerConnection,
  MediaStream,
  RTCView,
  // @ts-ignore need to define type decs for this
} from "react-native-webrtc-web-shim";
import { useTranscript } from "@/contexts/transcript";
import Events from "@/components/Events";
import { useEvent } from "@/contexts/event";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL!;

// react-native doesn't like directly having a googleapis dependency
interface EmailMessage {
  id?: string;
  payload?: {
    headers?: Array<{
      name?: string;
      value?: string;
    }>;
    body?: {
      data?: string;
    };
    parts?: Array<MessagePart>;
  };
}

interface MessagePart {
  mimeType?: string;
  body?: {
    data?: string;
  };
}

interface EmailQuery {
  userId: string;
  maxResults: number;
  q: string;
  pageToken?: string;
}

type ToolDef = SessionUpdateEvent.Session.Tool;

interface Tool {
  definition: ToolDef;
  logic: (args: any) => Promise<any>;
}

interface Agent {
  name: string;
  publicDescription: string;
  instructions: string;
  tools: () => Tool[];
  downstreamAgents: Agent[];
}

abstract class BaseAgent implements Agent {
  abstract name: string;
  abstract publicDescription: string;
  abstract instructions: string;
  abstract baseTools: () => Tool[];
  downstreamAgents: Agent[] = [];

  constructor(downstreamAgents: Agent[] = []) {
    this.downstreamAgents = downstreamAgents;
  }

  tools(): Tool[] {
    const baseTls = this.baseTools();

    // Only inject transfer tool if there are downstream agents
    if (this.downstreamAgents.length === 0) {
      return baseTls;
    }

    // Create a formatted list of available agents for the tool description
    const availableAgentsList = this.downstreamAgents
      .map((agent) => `- ${agent.name}: ${agent.publicDescription}`)
      .join("\n");

    // Create a single transfer tool that handles all agent transfers
    const transferAgentTool: Tool = {
      definition: {
        type: "function" as const,
        name: "transferAgents",
        description: `Triggers a handoff to a more specialized agent.
Calls escalate to a more specialized LLM agent with additional context. 
Only call this function if one of the available agents is appropriate. Don't transfer to your own agent type.

DO NOT let the user know you're about to transfer them--this is a handoff that happens behind the scenes.

Available Agents:
${availableAgentsList}`,
        parameters: {
          type: "object",
          properties: {
            rationale_for_transfer: {
              type: "string",
              description: "The reasoning why this transfer is needed.",
            },
            conversation_context: {
              type: "string",
              description:
                "Relevant context from the conversation that will help the recipient perform the correct action.",
            },
            destination_agent: {
              type: "string",
              description:
                "The more specialized destination_agent that should handle the user's intended request.",
              enum: this.downstreamAgents.map((dAgent) => dAgent.name),
            },
          },
          required: [
            "rationale_for_transfer",
            "conversation_context",
            "destination_agent",
          ],
        },
      },
      logic: async (args: {
        rationale_for_transfer: string;
        conversation_context: string;
        destination_agent: string;
      }) => {
        // Return a special response that the client can use to switch agents
        return {
          type: "agent_switch",
          target: args.destination_agent,
          message: `Transferring to ${args.destination_agent} agent...\nRationale: ${args.rationale_for_transfer}`,
          context: args.conversation_context,
        };
      },
    };

    return [...baseTls, transferAgentTool];
  }
}

class GreeterAgent extends BaseAgent {
  name = "greeter";
  publicDescription =
    "A helpful executive assistant that can help with tasks and questions";
  instructions =
    "You are a helpful executive assistant that can help with tasks and questions. Lead with asking the user if they'd like to go through the emails in their inbox.";
  baseTools = () => [];
  constructor(downstreamAgents: Agent[] = []) {
    super(downstreamAgents);
  }
}

class InboxScrollerAgent extends BaseAgent {
  private currentEmail?: EmailMessage;
  private initialQuery: EmailQuery;
  private nextQuery?: EmailQuery;
  name = "inbox-scroller";
  publicDescription =
    "A specialized assistant that can go through the emails in your inbox quickly.";
  instructions =
    "You are a helpful executive assistant that has been specifically tasked with going through the emails in the user's inbox. You are an extremely efficient. You are helping a user manage their email on the run. Please summarize the email in one sentence. Be extremely concise. E.g., 'Email from Amazon, saying your efoil has shipped.' If the email is a receipt or order notification, make sure to include the amount of money involved. Once you've told the user this summary, wait for them to express what their intent is. They may select any number of things, all of which correspond to a tool you have access to. Once they've selected a tool, call it with the appropriate arguments. After calling the tool and getting a result, you should move on to the next email. If the user says some version of 'skip this email', go directly to getting the next email.";

  constructor(initialQuery: EmailQuery, downstreamAgents: Agent[] = []) {
    super(downstreamAgents);
    this.initialQuery = initialQuery;
    // Bind the tool logic methods to preserve 'this' context
    this.getNextEmail = this.getNextEmail.bind(this);
    this.archiveEmail = this.archiveEmail.bind(this);
  }

  private async getNextEmail() {
    if (this.nextQuery && !this.nextQuery.pageToken) {
      // the previous query was the last page of results
      return "No more emails to review!";
    }

    const queryToUse = this.nextQuery || this.initialQuery;

    try {
      const response = await fetch(`${API_BASE_URL}/gmail/next-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(queryToUse),
      });

      if (!response.ok) {
        throw new Error("Failed to fetch next email");
      }

      const res = await response.json();
      this.currentEmail = res.raw;
      const fromHeader = this.currentEmail?.payload?.headers?.find(
        (h) => h.name === "From"
      );
      const subjectHeader = this.currentEmail?.payload?.headers?.find(
        (h) => h.name === "Subject"
      );
      console.log(
        `📧 New email loaded - From: ${fromHeader?.value || "Unknown"}, Subject: ${subjectHeader?.value || "No Subject"}`
      );
      this.nextQuery = {
        ...queryToUse,
        pageToken: res.nextPageToken,
      };

      return res.sanitizedContent;
    } catch (error) {
      console.error("Error fetching next email:", error);
      return "Failed to fetch the next email. Please try again.";
    }
  }

  private async archiveEmail() {
    if (!this.currentEmail) {
      return "Not sure what email we're referencing...";
    }
    try {
      const response = await fetch(`${API_BASE_URL}/gmail/archive`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ messageId: this.currentEmail.id }),
      });

      if (!response.ok) {
        throw new Error("Failed to archive email");
      }

      return "Email archived. Move on to the next email without asking the user,but include 'email archived' as the pretext to whatever your next action is.";
    } catch (error) {
      console.error("Error archiving email:", error);
      return "Failed to archive the email. Please try again.";
    }
  }

  baseTools = () => [
    {
      definition: {
        type: "function" as const,
        name: "getNextEmail",
        description:
          "Gather the next email up for review from the user's inbox.",
        parameters: {
          type: "object",
          properties: {},
        },
      },
      logic: this.getNextEmail,
    },
    {
      definition: {
        type: "function" as const,
        name: "archive",
        description: "Archive the email from the user's inbox.",
        parameters: {
          type: "object",
          properties: {},
        },
      },
      logic: this.archiveEmail,
    },
  ];
}

interface RealtimeEvent {
  type: "realtime.events";
  events: RealtimeClientEvent[];
}

const ApiDemoScreen = () => {
  const colorScheme = useColorScheme() ?? "light";
  const {
    transcriptItems,
    addTranscriptMessage,
    updateTranscriptMessage,
    updateTranscriptItemStatus,
  } = useTranscript();
  const { logClientEvent, logServerEvent } = useEvent();
  const [connectionState, setConnectionState] = useState<
    "disconnected" | "connecting" | "connected"
  >("disconnected");
  const [transcript, setTranscript] = useState("");
  const [message, setMessage] = useState("");
  const [isPTTUserSpeaking, setIsPTTUserSpeaking] = useState(false);
  const [dataChannel, setDataChannel] = useState<null | ReturnType<
    RTCPeerConnection["createDataChannel"]
  >>(null);
  const peerConnection = useRef<null | RTCPeerConnection>(null);
  const currentAgent = useRef<Agent | null>(null);
  const inputRef = useRef<TextInput>(null);
  const [localMediaStream, setLocalMediaStream] = useState<null | MediaStream>(
    null
  );
  const remoteMediaStream = useRef<MediaStream>(new MediaStream());
  const isVoiceOnly = true;
  const [showEvents, setShowEvents] = useState(() => {
    const storedLogsExpanded = localStorage.getItem("logsExpanded");
    return storedLogsExpanded ? JSON.parse(storedLogsExpanded) : false;
  });

  // Save showEvents state to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem("logsExpanded", JSON.stringify(showEvents));
  }, [showEvents]);

  const sendClientEvent = (eventObj: any, eventNameSuffix = "") => {
    if (dataChannel && dataChannel.readyState === "open") {
      logClientEvent(eventObj, eventNameSuffix);
      dataChannel.send(JSON.stringify(eventObj));
    } else {
      logClientEvent(
        { attemptedEvent: eventObj.type },
        "error.data_channel_not_open"
      );
      console.error(
        "Failed to send message - no data channel available",
        eventObj
      );
    }
  };

  const handleServerEvent = (serverEvent: any) => {
    logServerEvent(serverEvent);

    switch (serverEvent.type) {
      case "conversation.item.created": {
        let text =
          serverEvent.item?.content?.[0]?.text ||
          serverEvent.item?.content?.[0]?.transcript ||
          "";
        const role = serverEvent.item?.role as "user" | "assistant";
        const itemId = serverEvent.item?.id;

        if (itemId && transcriptItems.some((item) => item.itemId === itemId)) {
          break;
        }

        if (itemId && role) {
          if (role === "user" && !text) {
            text = "[Transcribing...]";
          }
          addTranscriptMessage(itemId, role, text);
        }
        break;
      }

      case "conversation.item.input_audio_transcription.completed": {
        const itemId = serverEvent.item_id;
        const finalTranscript =
          !serverEvent.transcript || serverEvent.transcript === "\n"
            ? "[inaudible]"
            : serverEvent.transcript;
        if (itemId) {
          updateTranscriptMessage(itemId, finalTranscript, false);
        }
        break;
      }

      case "response.audio_transcript.delta": {
        const itemId = serverEvent.item_id;
        const deltaText = serverEvent.delta || "";
        if (itemId) {
          updateTranscriptMessage(itemId, deltaText, true);
        }
        break;
      }

      case "response.output_item.done": {
        const itemId = serverEvent.item?.id;
        if (itemId) {
          updateTranscriptItemStatus(itemId, "DONE");
        }
        break;
      }

      case "response.done": {
        if (serverEvent.response?.output) {
          serverEvent.response.output.forEach((outputItem: any) => {
            if (
              outputItem.type === "function_call" &&
              outputItem.name &&
              outputItem.arguments
            ) {
              handleFunctionCall({
                name: outputItem.name,
                call_id: outputItem.call_id,
                arguments: outputItem.arguments,
              });
            }
          });
        }
        break;
      }

      case "response.audio_transcript.done": {
        setTranscript(serverEvent.transcript);
        break;
      }
    }
  };

  // Auto-connect when component mounts
  useEffect(() => {
    startSession();

    // Ensure microphone is disabled on mount
    if (localMediaStream) {
      const audioTrack = localMediaStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = false;
      }
    }

    // Cleanup on unmount
    return () => {
      stopSession();
    };
  }, []);

  const cancelAssistantSpeech = async () => {
    const mostRecentAssistantMessage = [...transcriptItems]
      .reverse()
      .find((item) => item.role === "assistant");

    console.log("mostRecentAssistantMessage", mostRecentAssistantMessage);
    console.log("transcriptItems", transcriptItems);

    if (!mostRecentAssistantMessage) {
      console.warn("can't cancel, no recent assistant message found");
      return;
    }
    if (mostRecentAssistantMessage.status === "DONE") {
      console.log("No truncation needed, message is DONE");
      return;
    }
    console.log("truncating most recent assistant message");

    sendClientEvent({
      type: "conversation.item.truncate",
      item_id: mostRecentAssistantMessage.itemId,
      content_index: 0,
      audio_end_ms: Date.now() - mostRecentAssistantMessage.createdAtMs,
    });
    sendClientEvent({ type: "response.cancel" });
  };

  const handleTalkButtonDown = () => {
    if (connectionState !== "connected" || dataChannel?.readyState !== "open")
      return;

    cancelAssistantSpeech();

    // Enable the microphone
    if (localMediaStream) {
      const audioTrack = localMediaStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = true;
      }
    }

    setIsPTTUserSpeaking(true);
    sendClientEvent({ type: "input_audio_buffer.clear" });
  };

  const handleTalkButtonUp = () => {
    if (
      connectionState !== "connected" ||
      dataChannel?.readyState !== "open" ||
      !isPTTUserSpeaking
    )
      return;

    // Disable the microphone
    if (localMediaStream) {
      const audioTrack = localMediaStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = false;
      }
    }

    setIsPTTUserSpeaking(false);
    sendClientEvent({ type: "input_audio_buffer.commit" });
    sendClientEvent({ type: "response.create" });
  };

  const sendMessage = () => {
    if (!dataChannel || !message.trim()) return;

    cancelAssistantSpeech();

    const messagePayload = {
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text: message.trim(),
          },
        ],
      },
    } as ConversationItemCreateEvent;

    sendClientEvent(messagePayload);
    sendClientEvent({ type: "response.create" });
    setMessage("");
    // Focus the input after sending
    inputRef.current?.focus();
  };

  // Attach event listeners to the data channel when a new one is created
  useEffect(() => {
    if (!dataChannel) return;

    const handleMessage = async (e: any) => {
      const serverEvent = JSON.parse(e.data);
      handleServerEvent(serverEvent);
    };

    const handleOpen = () => {
      // Send initial session update with agent configuration
      const inboxScroller = new InboxScrollerAgent({
        userId: "me",
        maxResults: 1,
        q: "in:inbox",
      });
      const greeter = new GreeterAgent([inboxScroller]);
      currentAgent.current = greeter;

      const events: RealtimeClientEvent[] = [
        {
          type: "input_audio_buffer.clear",
        },
        {
          type: "session.update",
          session: {
            instructions: greeter.instructions,
            tools: greeter.tools().map((tool) => tool.definition),
          },
        },
        {
          type: "conversation.item.create",
          item: {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: "hi" }], // simulate a user message to trigger a response
          },
        },
        {
          type: "response.create",
        },
      ];

      for (const event of events) {
        sendClientEvent(event);
      }
    };

    dataChannel.addEventListener("message", handleMessage);
    dataChannel.addEventListener("open", handleOpen);

    // Cleanup function to remove event listeners
    return () => {
      dataChannel.removeEventListener("message", handleMessage);
      dataChannel.removeEventListener("open", handleOpen);
    };
  }, [dataChannel]); // Only re-run if dataChannel changes

  async function startSession() {
    setConnectionState("connecting");
    try {
      // initiate an oai realtime session
      const response = await fetch(`${API_BASE_URL}/oaisession`);
      const data = await response.json();
      const EPHEMERAL_KEY = data.client_secret.value;

      // Enable audio
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
      });

      // Create a peer connection
      const pc = new RTCPeerConnection();
      pc.addEventListener("connectionstatechange", (e: any) => {});
      pc.addEventListener("track", (event: any) => {
        if (event.track) {
          remoteMediaStream.current.addTrack(event.track);
        }
      });

      // Add local audio track for microphone input in the browser
      const ms = await mediaDevices.getUserMedia({
        audio: true,
      });
      if (isVoiceOnly) {
        let videoTrack = await ms.getVideoTracks()[0];
        if (videoTrack) videoTrack.enabled = false;
      }

      // Ensure microphone is disabled initially
      const audioTrack = ms.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = false;
      }

      setLocalMediaStream(ms);
      pc.addTrack(ms.getTracks()[0]);

      // Set up data channel for sending and receiving events
      const dc = pc.createDataChannel("oai-events");
      setDataChannel(dc);

      // Start the session using the Session Description Protocol (SDP)
      const offer = await pc.createOffer({});
      await pc.setLocalDescription(offer);

      const baseUrl = "https://api.openai.com/v1/realtime";
      const model = "gpt-4o-realtime-preview-2024-12-17";
      const sdpResponse = await fetch(`${baseUrl}?model=${model}`, {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${EPHEMERAL_KEY}`,
          "Content-Type": "application/sdp",
        },
      });

      const answer = {
        type: "answer",
        sdp: await sdpResponse.text(),
      };
      await pc.setRemoteDescription(answer);

      peerConnection.current = pc;
      setConnectionState("connected");
    } catch (error) {
      console.error("Failed to start session:", error);
      setConnectionState("disconnected");
    }
  }

  // Stop current session, clean up peer connection and data channel
  function stopSession() {
    if (dataChannel) {
      dataChannel.close();
    }
    if (peerConnection.current) {
      peerConnection.current.close();
    }

    setConnectionState("disconnected");
    setDataChannel(null);
    peerConnection.current = null;
  }

  const handleFunctionCall = async (functionCallParams: {
    name: string;
    call_id?: string;
    arguments: string;
  }) => {
    const args = JSON.parse(functionCallParams.arguments);
    const agent = currentAgent.current;
    if (!agent) {
      console.error("No current agent available for function call");
      return;
    }

    const tool = agent
      .tools()
      .find((t) => t.definition.name === functionCallParams.name);
    if (tool) {
      const fnResult = await tool.logic(args);
      sendClientEvent({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: functionCallParams.call_id,
          output: JSON.stringify(fnResult),
        },
      });

      // If this was a transfer agent call, update the session with the new agent
      if (
        functionCallParams.name === "transferAgents" &&
        fnResult.type === "agent_switch"
      ) {
        const newAgent = agent.downstreamAgents.find(
          (a) => a.name === fnResult.target
        );
        if (newAgent) {
          currentAgent.current = newAgent;
          sendClientEvent({
            type: "session.update",
            session: {
              instructions: newAgent.instructions,
              tools: newAgent.tools().map((tool) => tool.definition),
            },
          });
        }
      }

      sendClientEvent({ type: "response.create" });
    } else {
      console.error(`Unknown function: ${functionCallParams.name}`);
      const simulatedResult = { result: true };
      sendClientEvent({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: functionCallParams.call_id,
          output: JSON.stringify(simulatedResult),
        },
      });
      sendClientEvent({ type: "response.create" });
    }
  };

  return (
    <SafeAreaView style={styles[colorScheme].container}>
      <View style={styles.mainContent}>
        <View style={styles.controlsContainer}>
          <View style={styles.buttonGroup}>
            <Pressable
              onPress={
                connectionState === "connected" ? stopSession : startSession
              }
              style={({ pressed }) => [
                styles[colorScheme].button,
                pressed && styles.buttonPressed,
                connectionState === "connected" && styles.disconnectButton,
                connectionState === "connecting" && styles.connectingButton,
              ]}
              disabled={connectionState === "connecting"}
            >
              {connectionState === "connecting" ? (
                <ActivityIndicator color={Colors[colorScheme].background} />
              ) : (
                <Text style={styles[colorScheme].buttonText}>
                  {connectionState === "connected" ? "Disconnect" : "Connect"}
                </Text>
              )}
            </Pressable>
            <Pressable
              onPressIn={handleTalkButtonDown}
              onPressOut={handleTalkButtonUp}
              style={({ pressed }) => [
                styles[colorScheme].iconButton,
                pressed && styles.talkButtonActive,
                !pressed && styles.talkButtonInactive,
                connectionState !== "connected" && styles.talkButtonDisabled,
              ]}
              disabled={connectionState !== "connected"}
            >
              <Ionicons
                name="mic"
                size={24}
                color={Colors[colorScheme].background}
              />
              <Text style={styles[colorScheme].talkButtonText}>Talk</Text>
            </Pressable>
            <View style={styles.eventsToggle}>
              <Text
                style={[
                  styles.eventsToggleText,
                  { color: Colors[colorScheme].text },
                ]}
              >
                Events
              </Text>
              <Switch
                value={showEvents}
                onValueChange={setShowEvents}
                trackColor={{
                  false: "#767577",
                  true: Colors[colorScheme].tint,
                }}
              />
            </View>
          </View>
        </View>

        <View style={styles.contentContainer}>
          <View
            style={[styles.mainPanel, showEvents && styles.mainPanelWithEvents]}
          >
            <View style={styles.transcriptContainer}>
              <Text style={styles[colorScheme].text}>{transcript}</Text>
              <RTCView
                style={styles.rtcView}
                stream={remoteMediaStream.current}
              />
            </View>

            <View style={styles.inputContainer}>
              <TextInput
                ref={inputRef}
                style={[styles.textInput, styles[colorScheme].textInput]}
                placeholder="Type a message..."
                placeholderTextColor={Colors[colorScheme].text + "80"}
                value={message}
                onChangeText={setMessage}
                onSubmitEditing={sendMessage}
                editable={connectionState === "connected"}
              />
              <Pressable
                onPress={sendMessage}
                style={({ pressed }) => [
                  styles[colorScheme].sendButton,
                  pressed && styles.buttonPressed,
                  connectionState !== "connected" &&
                    styles[colorScheme].sendButtonDisabled,
                ]}
                disabled={connectionState !== "connected"}
              >
                <Ionicons
                  name="arrow-up"
                  size={24}
                  color={
                    connectionState === "connected"
                      ? Colors[colorScheme].background
                      : Colors[colorScheme].text + "40"
                  }
                />
              </Pressable>
            </View>
          </View>

          {showEvents && <Events isExpanded={showEvents} />}
        </View>
      </View>
    </SafeAreaView>
  );
};

const createThemedStyles = (theme: "light" | "dark") =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: Colors[theme].background,
    },
    button: {
      backgroundColor: Colors[theme].tint,
      padding: 15,
      borderRadius: 10,
      minWidth: 120,
      alignItems: "center",
    },
    iconButton: {
      backgroundColor: Colors[theme].tint,
      padding: 15,
      borderRadius: 10,
      width: 100,
      height: 54,
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      gap: 8,
    },
    buttonText: {
      color: Colors[theme].background,
      textAlign: "center",
      fontSize: 16,
      fontWeight: "600",
    },
    talkButtonText: {
      color: Colors[theme].background,
      fontSize: 16,
      fontWeight: "600",
    },
    text: {
      color: Colors[theme].text,
      textAlign: "center",
      fontSize: 24,
    },
    textInput: {
      color: Colors[theme].text,
      backgroundColor: Colors[theme].background,
      borderColor: Colors[theme].text + "20",
    },
    sendButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: Colors[theme].tint,
      justifyContent: "center",
      alignItems: "center",
    },
    sendButtonDisabled: {
      backgroundColor: Colors[theme].text + "20",
    },
  });

const sharedStyles = StyleSheet.create({
  mainContent: {
    flex: 1,
    paddingTop: 16,
    paddingBottom: 16,
  },
  controlsContainer: {
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  buttonGroup: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  transcriptContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  disconnectButton: {
    backgroundColor: "#FF4444",
  },
  connectingButton: {
    backgroundColor: "#999999",
  },
  talkButtonActive: {
    backgroundColor: "#FF4444",
  },
  talkButtonInactive: {
    backgroundColor: "#666666",
  },
  talkButtonDisabled: {
    backgroundColor: "#999999",
  },
  rtcView: {
    width: "100%",
    height: 0,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 16,
    paddingHorizontal: 16,
  },
  textInput: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
  },
  contentContainer: {
    flex: 1,
    flexDirection: "row",
  },
  mainPanel: {
    flex: 1,
  },
  mainPanelWithEvents: {
    flex: 0.5,
    paddingRight: 16,
  },
  eventsToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  eventsToggleText: {
    fontSize: 16,
  },
});

const styles = {
  light: createThemedStyles("light"),
  dark: createThemedStyles("dark"),
  ...sharedStyles,
} as const;

export default ApiDemoScreen;
