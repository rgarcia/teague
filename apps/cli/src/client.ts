// Types and state
type RecordingState = {
  mediaRecorder: MediaRecorder | null;
  socket: WebSocket | null;
  isRecording: boolean;
  hasPermissions: boolean;
};

const state: RecordingState = {
  mediaRecorder: null,
  socket: null,
  isRecording: false,
  hasPermissions: false,
};

// DOM elements
const statusDiv = document.getElementById("status") as HTMLDivElement;

// WebSocket connection management
function connectWebSocket() {
  if (state.socket?.readyState === WebSocket.OPEN) return;

  state.socket = new WebSocket(`ws://${window.location.host}/ws`);

  state.socket.onopen = () => updateStatus("Connected to server");
  state.socket.onmessage = handleWebSocketMessage;
  state.socket.onerror = handleWebSocketError;
  state.socket.onclose = handleWebSocketClose;
}

async function handleWebSocketMessage(event: MessageEvent) {
  try {
    const data = JSON.parse(event.data);
    console.log("Client received message:", data);

    // Handle server commands
    if (data.command) {
      switch (data.command.type) {
        case "start-recording":
          console.log("Client received start-recording command");
          await startRecording();
          break;
        case "stop-recording":
          console.log("Client received stop-recording command");
          await stopRecording();
          break;
      }
      return;
    }

    // Handle error messages
    if (data.error) {
      console.error("Client received error:", data.error);
      updateStatus(data.error);
    }
  } catch (error) {
    console.error("Error parsing message:", error);
  }
}

function handleWebSocketError(error: Event) {
  console.error("WebSocket error:", error);
  updateStatus("Error connecting to server");
}

function handleWebSocketClose() {
  updateStatus("Disconnected from server. Reconnecting...");
  // Try to reconnect after a short delay
  setTimeout(connectWebSocket, 1000);
}

// Status management
function updateStatus(message: string) {
  statusDiv.textContent = message;
}

// Microphone permission management
async function checkMicrophonePermission(): Promise<boolean> {
  if (!navigator.mediaDevices?.getUserMedia) {
    updateStatus("Your browser doesn't support microphone access");
    return false;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    state.hasPermissions = true;
    updateStatus("Ready for voice commands from CLI");
    return true;
  } catch (error) {
    handleMicrophoneError(error);
    return false;
  }
}

function handleMicrophoneError(error: unknown) {
  if (error instanceof Error) {
    if (
      error.name === "NotAllowedError" ||
      error.name === "PermissionDeniedError"
    ) {
      updateStatus(
        "Microphone access was denied. Please allow microphone access and reload the page."
      );
    } else {
      updateStatus(`Error accessing microphone: ${error.message}`);
    }
  } else {
    updateStatus("Unknown error accessing microphone");
  }
  console.error("Microphone permission error:", error);
}

// Recording management
async function startRecording() {
  if (state.isRecording) {
    console.log("Already recording, ignoring start command");
    return;
  }

  if (!state.hasPermissions) {
    console.log("No microphone permissions, requesting...");
    if (!(await checkMicrophonePermission())) {
      return;
    }
  }

  try {
    console.log("Starting recording...");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.mediaRecorder = new MediaRecorder(stream, {
      mimeType: "audio/webm;codecs=opus",
    });

    await ensureWebSocketConnection();
    if (!state.socket) throw new Error("WebSocket not connected");

    // Tell server to start a new recognition stream
    console.log("Sending client-start-stream message");
    state.socket.send(JSON.stringify({ type: "client-start-stream" }));
    setupMediaRecorder();

    state.isRecording = true;
    updateStatus("Recording...");
    console.log("Recording started successfully");
  } catch (error) {
    console.error("Error starting recording:", error);
    updateStatus("Error accessing microphone");
    state.isRecording = false;
  }
}

async function ensureWebSocketConnection(): Promise<void> {
  if (!state.socket || state.socket.readyState !== WebSocket.OPEN) {
    connectWebSocket();
    await new Promise<void>((resolve) => {
      const checkConnection = () => {
        if (state.socket?.readyState === WebSocket.OPEN) {
          resolve();
        } else {
          setTimeout(checkConnection, 100);
        }
      };
      checkConnection();
    });
  }
}

function setupMediaRecorder() {
  if (!state.mediaRecorder) return;
  console.log("Setting up MediaRecorder");

  state.mediaRecorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0 && state.socket?.readyState === WebSocket.OPEN) {
      console.log("Sending audio data, size:", event.data.size);
      state.socket.send(event.data);
    }
  });
  state.mediaRecorder.start(250);
  console.log("MediaRecorder started");
}

async function stopRecording() {
  if (!state.isRecording) return;

  if (state.mediaRecorder && state.mediaRecorder.state !== "inactive") {
    state.mediaRecorder.stop();
    state.mediaRecorder.stream.getTracks().forEach((track) => track.stop());
  }

  // Tell server to end the recognition stream
  if (state.socket?.readyState === WebSocket.OPEN) {
    state.socket.send(JSON.stringify({ type: "client-end-stream" }));
  }

  state.mediaRecorder = null;
  state.isRecording = false;
  updateStatus("Stopped recording");
}

// Initialize
function initialize() {
  connectWebSocket();
  checkMicrophonePermission();
}

initialize();
