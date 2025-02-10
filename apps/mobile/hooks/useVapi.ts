import vapi from "@/lib/vapi.sdk";
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

  const start = async () => {
    console.log("[vapi] starting the call");
    setCallStatus(CALL_STATUS.LOADING);
    // setCallStatus(CALL_STATUS.LOADING);
    const response = vapi.start("48b68590-564a-44b2-94d4-7a7a649e7c53", {
      serverUrlSecret: "TODO",
    });
    // default to muted on call start
    vapi.once("call-start", () => {
      vapi.setMuted(true);
    });
    // const response = vapi.start({

    //   endCallFunctionEnabled: true,
    //   model: {
    //     provider: 'openai',
    //     functions: [
    //       {
    //         name: 'get_current_weather',
    //         description: 'Get the current weather in a given location',
    //         parameters: { type: 'object', properties: { location: { type: 'string', description: 'The location to get the weather for' } }, required: ['location'] },
    //       },
    //     ],
    //     model: 'gpt-3.5-turbo',
    //     // "fallbackModels": ["gpt-4-1106-preview", "gpt-4-0125-preview"],
    //     messages: [
    //       {
    //         content: 'you are an assistant',
    //         role: 'assistant',
    //       },
    //     ],
    //   },
    // });

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

  const toggleCall = async () => {
    if (callStatus === CALL_STATUS.ACTIVE) {
      stop();
    } else {
      await start();
    }
  };

  const setMuted = (value: boolean) => {
    console.log("[vapi] setting mute", value);
    vapi.setMuted(value);
  };
  const isMuted = vapi.isMuted;

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
