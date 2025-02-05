import { useState, useEffect, useRef } from "react";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { Audio } from "expo-av";
import { Pressable, SafeAreaView, StyleSheet, View, Text } from "react-native";
import {
  mediaDevices,
  RTCPeerConnection,
  MediaStream,
  RTCView,
  // @ts-ignore need to define type decs for this
} from "react-native-webrtc-web-shim";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL!;
const WS_BASE_URL = process.env.EXPO_PUBLIC_WS_BASE_URL!;

const ApiDemoScreen = () => {
  const colorScheme = useColorScheme();
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [messages, setMessages] = useState<string[]>([]);

  const [isSessionActive, setIsSessionActive] = useState(false);
  const [events, setEvents] = useState<any[]>([]);
  const [transcript, setTranscript] = useState("");
  const [dataChannel, setDataChannel] = useState<null | ReturnType<
    RTCPeerConnection["createDataChannel"]
  >>(null);
  const peerConnection = useRef<null | RTCPeerConnection>(null);
  const [localMediaStream, setLocalMediaStream] = useState<null | MediaStream>(
    null
  );
  const remoteMediaStream = useRef<MediaStream>(new MediaStream());
  const isVoiceOnly = true;

  async function startSession() {
    // initiate an oai realtime session
    const response = await fetch(`${API_BASE_URL}/oaisession`);
    const data = await response.json();
    console.log("oaisession response", data);
    const EPHEMERAL_KEY = data.client_secret.value;
    console.log("token response", EPHEMERAL_KEY);

    // Enable audio
    await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });

    // Create a peer connection
    const pc = new RTCPeerConnection();
    // Set up some event listeners
    pc.addEventListener("connectionstatechange", (e: any) => {
      console.log("connectionstatechange", e);
    });
    pc.addEventListener("track", (event: any) => {
      if (event.track) remoteMediaStream.current.addTrack(event.track);
    });

    // Add local audio track for microphone input in the browser
    const ms = await mediaDevices.getUserMedia({
      audio: true,
    });
    if (isVoiceOnly) {
      let videoTrack = await ms.getVideoTracks()[0];
      if (videoTrack) videoTrack.enabled = false;
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
  }

  // Stop current session, clean up peer connection and data channel
  function stopSession() {
    if (dataChannel) {
      dataChannel.close();
    }
    if (peerConnection.current) {
      peerConnection.current.close();
    }

    setIsSessionActive(false);
    setDataChannel(null);
    peerConnection.current = null;
  }

  // Attach event listeners to the data channel when a new one is created
  useEffect(() => {
    function configureTools() {
      console.log("Configuring the client side tools");
      const event = {
        type: "session.update",
        session: {
          modalities: ["text", "audio"],
          instructions:
            "You are a helpful assistant. You have access to certain tools that allow you to check the user device battery level and change the display brightness. Use these tolls if the user asks about them. Otherwise, just answer the question.",
          // // Provide the tools. Note they match the keys in the `clientTools` object above.
          // tools: clientToolsSchema,
        },
      };
      dataChannel.send(JSON.stringify(event));
    }

    if (dataChannel) {
      // Append new server events to the list
      // TODO: load types from OpenAI SDK.
      dataChannel.addEventListener("message", async (e: any) => {
        const data = JSON.parse(e.data);
        console.log("dataChannel message", data);
        setEvents((prev) => [data, ...prev]);
        // Get transcript.
        if (data.type === "response.audio_transcript.done") {
          setTranscript(data.transcript);
        }
        // // Handle function calls
        // if (data.type === "response.function_call_arguments.done") {
        //   // TODO: improve types.
        //   const functionName: keyof typeof clientTools = data.name;
        //   const tool: any = clientTools[functionName];
        //   if (tool !== undefined) {
        //     console.log(
        //       `Calling local function ${data.name} with ${data.arguments}`
        //     );
        //     const args = JSON.parse(data.arguments);
        //     const result = await tool(args);
        //     console.log("result", result);
        //     // Let OpenAI know that the function has been called and share it's output
        //     const event = {
        //       type: "conversation.item.create",
        //       item: {
        //         type: "function_call_output",
        //         call_id: data.call_id, // call_id from the function_call message
        //         output: JSON.stringify(result), // result of the function
        //       },
        //     };
        //     dataChannel.send(JSON.stringify(event));
        //     // Force a response to the user
        //     dataChannel.send(
        //       JSON.stringify({
        //         type: "response.create",
        //       })
        //     );
        //   }
        // }
      });

      // Set session active when the data channel is opened
      dataChannel.addEventListener("open", () => {
        setIsSessionActive(true);
        setEvents([]);
        // // Configure the client side tools
        // configureTools();
      });
    }
  }, [dataChannel]);

  useEffect(() => {
    const ws = new WebSocket(WS_BASE_URL);

    ws.onopen = () => {
      console.log("WebSocket connection opened");
      setIsConnected(true);
    };

    ws.onmessage = (event) => {
      console.log("Message from server:", event.data);
      setMessages((prevMessages) => [...prevMessages, event.data]);
    };

    ws.onerror = (error) => {
      console.log("WebSocket error:", error);
      setIsConnected(false);
    };

    ws.onclose = (event) => {
      console.log("WebSocket connection closed:", event.code, event.reason);
      setIsConnected(false);
    };

    return () => {
      ws.close();
    };
  }, []);

  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: Colors[colorScheme ?? "light"].background,
      }}
    >
      <SafeAreaView style={styles.container}>
        <View>
          {!isSessionActive ? (
            <Pressable
              onPress={startSession}
              disabled={isSessionActive}
              style={({ pressed }) => [
                {
                  backgroundColor: isSessionActive ? "#ccc" : "#2196F3",
                  padding: 10,
                  borderRadius: 5,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              <Text style={{ color: "white", textAlign: "center" }}>Start</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={stopSession}
              disabled={!isSessionActive}
              style={({ pressed }) => [
                {
                  backgroundColor: !isSessionActive ? "#ccc" : "#2196F3",
                  padding: 10,
                  borderRadius: 5,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              <Text style={{ color: "white", textAlign: "center" }}>Stop</Text>
            </Pressable>
          )}
          <RTCView stream={remoteMediaStream.current} />
        </View>
        <Text style={styles.text}>{transcript}</Text>
      </SafeAreaView>

      {/* <Text
        style={{
          marginTop: 20,
          color: Colors[colorScheme ?? "light"].text,
        }}
      >
        {isConnected ? "Connected to WebSocket" : "Not connected to WebSocket"}
      </Text>

      <View style={{ marginTop: 20, padding: 10 }}>
        {messages.length > 0 ? (
          messages.map((message, index) => (
            <Text
              key={index}
              style={{
                color: Colors[colorScheme ?? "light"].text,
                marginBottom: 5,
              }}
            >
              Server: {message}
            </Text>
          ))
        ) : (
          <Text
            style={{
              color: Colors[colorScheme ?? "light"].text,
              opacity: 0.6,
            }}
          >
            No messages from server yet
          </Text>
        )}
      </View> */}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    alignItems: "stretch",
    justifyContent: "center",
  },
  text: { textAlign: "center", fontSize: 44 },
});

export default ApiDemoScreen;
