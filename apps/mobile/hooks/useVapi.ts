import vapi from "@/lib/vapi.sdk";
import { OverrideAssistantDTO } from "@vapi-ai/react-native/dist/api";
import { Vapi } from "@vapi-ai/server-sdk";
import { useEffect, useState } from "react";

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

  const [activeTranscript, setActiveTranscript] =
    useState<Vapi.ClientMessageTranscript | null>(null);

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
      // console.log("[vapi] message", JSON.stringify(message));
      if (
        message.type === "transcript" &&
        message.transcriptType === "partial"
      ) {
        setActiveTranscript(message);
      } else if (message.type === "conversation-update") {
        setConversation(message);
      } else {
        setMessages((prev) => [...prev, message]);
        setActiveTranscript(null);
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
    activeTranscript,
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
