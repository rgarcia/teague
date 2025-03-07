import vapi from "@/lib/vapi.sdk";
import { CreateAssistantDTO } from "@/lib/vapi/api";
import { Vapi } from "@vapi-ai/server-sdk";
import {
  BotMessage,
  ClientMessageConversationUpdateMessagesItem,
  UserMessage,
} from "@vapi-ai/server-sdk/api";
import { useEffect, useState } from "react";

type OverrideAssistantDTO = CreateAssistantDTO & {
  serverUrlSecret?: string;
};

type Message = Vapi.ClientMessageMessage;

export enum CALL_STATUS {
  INACTIVE = "inactive",
  ACTIVE = "active",
  LOADING = "loading",
}

export function useVapi() {
  const [callStatus, setCallStatus] = useState<CALL_STATUS>(
    CALL_STATUS.INACTIVE
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversation, setConversation] =
    useState<Vapi.ClientMessageConversationUpdate | null>(null);

  // const [activeTranscript, setActiveTranscript] =
  //   useState<Vapi.ClientMessageTranscript | null>(null);

  useEffect(() => {
    const onCallStartHandler = () => {
      console.log("[vapi] call-start");
      setCallStatus(CALL_STATUS.ACTIVE);
    };

    const onCallEnd = () => {
      console.log("[vapi] call-end");
      setCallStatus(CALL_STATUS.INACTIVE);
    };

    const onMessageUpdate = (message: Message) => {
      logMessage(message);
      if (
        message.type === "transcript" &&
        message.transcriptType === "partial"
      ) {
        // setActiveTranscript(message);
      } else if (message.type === "conversation-update") {
        console.log("DEBUG SETTING ACTIVE CONVERSATION");
        setConversation(message);
      } else {
        setMessages((prev) => {
          console.log("DEBUG SETTING ACTIVE MESSAGES", message);
          return [...prev, message];
        });
        // setActiveTranscript(null);
        console.log("DEBUG DONE");
      }
    };

    const onError = (e: any) => {
      console.error("[vapi] error", e);
      setCallStatus(CALL_STATUS.INACTIVE);
    };

    vapi.on("call-start", onCallStartHandler);
    vapi.on("call-end", onCallEnd);
    vapi.on("message", onMessageUpdate);
    vapi.on("error", onError);

    return () => {
      vapi.off("call-start", onCallStartHandler);
      vapi.off("call-end", onCallEnd);
      vapi.off("message", onMessageUpdate);
      vapi.off("error", onError);
    };
  }, []);

  const start = async (assistantOverrides?: OverrideAssistantDTO) => {
    console.log("[vapi] starting the call");
    setCallStatus(CALL_STATUS.LOADING);
    // setCallStatus(CALL_STATUS.LOADING);
    const response = vapi.start(
      process.env.EXPO_PUBLIC_VAPI_ASSISTANT_ID!,
      assistantOverrides
    );
    response
      .then((_res) => {
        setCallStatus(CALL_STATUS.ACTIVE);
      })
      .catch((e) => {
        console.error("got an error while starting the call", e);
        setCallStatus(CALL_STATUS.INACTIVE);
      });
  };

  const stop = () => {
    console.log("[vapi] stopping the call");
    setCallStatus(CALL_STATUS.LOADING);
    vapi.stop();
  };

  const toggleCall = async (assistantOverrides?: OverrideAssistantDTO) => {
    if (callStatus === CALL_STATUS.ACTIVE) {
      stop();
    } else {
      await start(assistantOverrides);
    }
  };

  const setMuted = (value: boolean) => {
    console.log("[vapi] setting mute", value);
    vapi.setMuted(value);
  };
  const isMuted = () => {
    return vapi.isMuted();
  };

  const send = (msg: any) => {
    console.log("[vapi] sending", JSON.stringify(msg));
    return vapi.send(msg);
  };

  return {
    callStatus,
    // activeTranscript,
    messages,
    conversation,
    start,
    stop,
    setMuted,
    isMuted,
    toggleCall,
    send,
  };
}

function logMessage(message: Message) {
  switch (message.type) {
    case "conversation-update":
      {
        let out = `vapi message type=${message.type}`;
        // @ts-ignore it's not in the type for some reason
        const conversation = message.conversation as any[];
        conversation.map((c: any) => {
          if ((c.role === "assistant" || c.role === "user") && c.content) {
            out += `\n   conversation: ${c.role}: ${c.content}`;
          } else {
            out += `\n   conversation: ${c.role}: ${JSON.stringify(c).slice(
              0,
              40
            )}...`;
          }
        });
        message.messages?.map(
          (m: ClientMessageConversationUpdateMessagesItem) => {
            if (m.role === "bot" || m.role === "user") {
              let msg = m as UserMessage | BotMessage;
              out += `\n   message: ${m.role}: ${msg.message}`;
            } else {
              out += `\n   message: ${m.role}: ${JSON.stringify(m).slice(
                0,
                40
              )}...`;
            }
          }
        );
        console.log(out);
      }
      break;
    case "model-output":
      {
        let out = `vapi message type=${message.type}`;
        if (typeof message.output === "string") {
          out += `\n   model-output: ${message.output}`;
        } else {
          out += `\n   model-output: ${JSON.stringify(message.output)}`;
        }
        console.log(out);
      }
      break;
    // case "transcript":
    //   {
    //     let out = `vapi message type=${message.type}`;
    //     out += ` role=${message.role} transcript=${
    //       message.transcript
    //     } other=${objectKeys(message, ["role", "transcript"])}`;
    //     console.log(out);
    //   }
    //   break;
    case "speech-update":
      {
        let out = `vapi message type=${message.type}`;
        out += ` role=${message.role} speech-update=${
          message.status
        } other=${objectKeys(message, ["role", "status"])}`;
        console.log(out);
      }
      break;
    case "voice-input":
      {
        let out = `vapi message type=${message.type}`;
        out += ` input=${message.input} other=${objectKeys(message, [
          "input",
        ])}`;
        console.log(out);
      }
      break;
    default:
    // console.log(
    //   `[vapi] message type=${message.type}`,
    //   JSON.stringify(message).slice(0, 40) + "..."
    // );
  }
}

function objectKeys(obj: any, except: string[] = []) {
  return Object.keys(obj)
    .filter((k) => !except.includes(k))
    .join(", ");
}
