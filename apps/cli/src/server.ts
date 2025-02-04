import { SpeechClient, protos } from "@google-cloud/speech";
import type { ServerWebSocket } from "bun";
import { EventEmitter } from "events";
import { appendFileSync } from "fs";
import { join } from "path";

// Initialize Speech-to-Text client
const speechClient = new SpeechClient();

// Define event types
export interface TranscriptionEvents {
  "final-transcription": (transcription: string) => void;
  error: (error: Error) => void;
}

export interface TranscriptionServerOptions {
  port?: number;
  logFile?: string;
}

export class TranscriptionServer extends EventEmitter {
  private server: ReturnType<typeof Bun.serve> | null = null;
  private outdir: string = "./dist";
  private logFile: string | null = null;
  private port: number;
  private activeClient: ServerWebSocket<SpeechWebSocketData> | null = null;

  constructor(options: TranscriptionServerOptions = {}) {
    super();
    const { port = 3000, logFile = null } = options;
    this.port = port;
    if (logFile) {
      this.logFile = join(process.cwd(), logFile);
    }
  }

  // Send a command to the active client
  public sendCommand(command: { type: "start-recording" | "stop-recording" }) {
    this.log(`Sending command: ${command.type}`);
    if (this.activeClient) {
      this.activeClient.send(JSON.stringify({ command }));
    }
  }

  private log(message: string) {
    if (this.logFile) {
      appendFileSync(this.logFile, message + "\n");
    }
  }

  private createRecognitionConfig(): protos.google.cloud.speech.v1.IStreamingRecognitionConfig {
    return {
      config: {
        encoding:
          protos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding
            .WEBM_OPUS,
        sampleRateHertz: 48000,
        languageCode: "en-US",
        enableAutomaticPunctuation: true,
      },
      interimResults: true,
    };
  }

  private createRecognitionStream(ws: ServerWebSocket<SpeechWebSocketData>) {
    const stream = speechClient
      .streamingRecognize(this.createRecognitionConfig())
      .on("error", (error: Error) => {
        this.log(`Speech recognition error: ${error.message}`);
        ws.send(JSON.stringify({ error: "Speech recognition error" }));
        ws.data.recognizeStream = undefined;
        this.emit("error", error);
        // Send stop-recording command on error
        this.sendCommand({ type: "stop-recording" });
      })
      .on("data", (response: StreamingRecognizeResponse) => {
        const result = response.results?.[0] as SpeechRecognitionResult;
        const transcription = result?.alternatives?.[0]?.transcript || "";
        const isFinal = result?.isFinal;

        if (isFinal) {
          this.log(`Final: ${transcription}`);
          this.emit("final-transcription", transcription);
        } else {
          this.log(`Interim: ${transcription}`);
        }
      })
      .on("end", () => {
        ws.data.recognizeStream = undefined;
      });

    return stream;
  }

  private async handleWebSocketMessage(
    ws: ServerWebSocket<SpeechWebSocketData>,
    message: string | Buffer
  ) {
    try {
      // Handle control messages
      if (typeof message === "string") {
        try {
          const control = JSON.parse(message);
          this.log(`Received control message: ${JSON.stringify(control)}`);

          if (control.type === "client-start-stream") {
            this.log("Creating new recognition stream");
            // Clean up existing stream if any
            if (ws.data.recognizeStream) {
              try {
                ws.data.recognizeStream.end();
              } catch (e) {
                this.log(`Error ending previous stream: ${e}`);
              }
              ws.data.recognizeStream = undefined;
            }

            // Create new stream
            ws.data.recognizeStream = this.createRecognitionStream(ws);
            this.log("Recognition stream created");
            return;
          }

          if (control.type === "client-end-stream") {
            this.log("Ending recognition stream");
            if (ws.data.recognizeStream) {
              ws.data.recognizeStream.end();
            }
            return;
          }
        } catch (e) {
          // Not a JSON message, ignore
          this.log(`Received non-JSON string message: ${message}`);
        }
      }

      // Handle audio data
      if (ws.data.recognizeStream && message instanceof Buffer) {
        const stream = ws.data.recognizeStream;
        // @ts-ignore - writable exists but isn't in the type definition
        if (!stream.destroyed && stream.writable) {
          this.log(`Received audio data of size: ${message.length}`);
          stream.write(message);
        } else {
          this.log("Stream not writable or destroyed, discarding audio data");
        }
      } else if (message instanceof Buffer) {
        this.log("Received audio data but no recognition stream exists");
      }
    } catch (error) {
      this.log(`Error processing message: ${error}`);
      ws.send(JSON.stringify({ error: "Error processing audio" }));
      if (ws.data.recognizeStream) {
        try {
          ws.data.recognizeStream.end();
        } catch (e) {
          this.log(`Error ending stream: ${e}`);
        }
        ws.data.recognizeStream = undefined;
      }
      if (error instanceof Error) {
        this.emit("error", error);
      }
    }
  }

  async start() {
    // Set up static file serving
    await Bun.build({
      root: "./src",
      sourcemap: "inline",
      entrypoints: ["./src/index.html"],
      outdir: this.outdir,
      minify: true,
    });

    this.server = Bun.serve<SpeechWebSocketData>({
      port: this.port,
      fetch: async (req, server) => {
        const url = new URL(req.url);

        // Handle WebSocket upgrade
        if (url.pathname === "/ws") {
          const success = server.upgrade(req, { data: {} });
          if (success) return undefined;
          return new Response("WebSocket upgrade failed", { status: 400 });
        }

        // Serve static files
        if (url.pathname === "/" || url.pathname === "") {
          url.pathname = "/index.html";
        }

        const filePath = this.outdir + url.pathname;
        const file = Bun.file(filePath);
        return (await file.exists())
          ? new Response(file)
          : new Response(`${url.pathname} not found`, { status: 404 });
      },
      error() {
        return new Response(null, { status: 404 });
      },
      websocket: {
        open: (ws) => {
          this.log("New client connected");

          // If there's an existing client, close it
          if (this.activeClient) {
            this.log("Closing existing client connection");
            this.activeClient.send(
              JSON.stringify({
                error: "New client connected. This connection will be closed.",
              })
            );
            this.activeClient.close();
          }

          // Set the new client as active
          this.activeClient = ws;
        },
        message: (ws, message) => this.handleWebSocketMessage(ws, message),
        close: (ws) => {
          this.log("Client disconnected");
          if (this.activeClient === ws) {
            this.activeClient = null;
          }
          if (ws.data.recognizeStream) {
            try {
              ws.data.recognizeStream.end();
            } catch (error) {
              this.log(`Error ending stream: ${error}`);
            }
            ws.data.recognizeStream = undefined;
          }
        },
      },
    });

    return this.server;
  }

  stop() {
    if (this.server) {
      this.server.stop();
      this.server = null;
    }
    if (this.activeClient) {
      this.activeClient.close();
      this.activeClient = null;
    }
  }
}

// Types
type SpeechWebSocketData = {
  recognizeStream?: ReturnType<typeof speechClient.streamingRecognize>;
};

type StreamingRecognizeResponse =
  protos.google.cloud.speech.v1.IStreamingRecognizeResponse;
type SpeechRecognitionResult =
  protos.google.cloud.speech.v1.IStreamingRecognitionResult;

// For backwards compatibility, create and export a default server instance
export const defaultServer = new TranscriptionServer();

// If this file is run directly, start the default server
if (import.meta.main) {
  await defaultServer.start();
}
