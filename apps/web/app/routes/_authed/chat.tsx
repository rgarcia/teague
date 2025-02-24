import { createFileRoute } from "@tanstack/react-router";
import { AssistantRuntimeProvider, ThreadList, ThreadMessage, unstable_useRemoteThreadListRuntime as useRemoteThreadListRuntime, useThreadListItem} from "@assistant-ui/react";
import { useChatRuntime } from "@assistant-ui/react-ai-sdk";
// import { ThreadList } from "@/components/assistant-ui/thread-list";
import { Thread } from "@/components/assistant-ui/thread";
import { SignedIn } from "@clerk/tanstack-start";
import { ToolUIs } from "~/components/TollUIs";
import { useEffect, useRef } from "react";
import { observable } from "@legendapp/state";
import { useObservable } from "@legendapp/state/react";
import { RemoteThreadListResponse, RemoteThreadInitializeResponse,  } from "node_modules/@assistant-ui/react/dist/runtimes/remote-thread-list/types";

export const Route = createFileRoute("/_authed/chat")({
  component: ChatComponent,
});

const useRuntimeCallbacks = observable({
  initialize: (threadId: string) => {
    console.log("initialize", threadId);
  },
});


// return a regular runtime here
// this hook will be mounted once per thread
const useMyRuntime = () => {
  const runtime = useChatRuntime({
    api: "/api/chat",
  });
  const runtimeCallbacks = useObservable(useRuntimeCallbacks);

  // when the thread is initialized (user sent the first message),
  // initialize the thread
  const threadId = useThreadListItem(i => i.id);
  console.log("TODO threadId", threadId);
  useEffect(() => {
    console.log(runtime.thread.unstable_on);
    return runtime.thread.unstable_on("initialize", () => {
      console.log("initialize", threadId);
      runtimeCallbacks.initialize(threadId);
    });
  }, [threadId]);
  return runtime;
}


// const RuntimeProvider = () => {
//   const runtime = useRemoteThreadListRuntime({
//     runtimeHook: useMyRuntime,
//     adapter: {
//       async list(): Promise<RemoteThreadListResponse> {
//         console.log("TODO list");
//         return { threads: [] };
//       },
//       async rename(remoteId: string, newTitle: string): Promise<void> {
//         console.log("TODO rename", remoteId, newTitle);
//         // TODO: Implement rename
//       },
//       async archive(remoteId: string): Promise<void> {
//         console.log("TODO archive", remoteId);
//         // TODO: Implement archive
//       },
//       async unarchive(remoteId: string): Promise<void> {
//         console.log("TODO unarchive", remoteId);
//         // TODO: Implement unarchive
//       },
//       async delete(remoteId: string): Promise<void> {
//         console.log("TODO delete", remoteId);
//         // TODO: Implement delete
//       },
//       async initialize(threadId: string): Promise<RemoteThreadInitializeResponse> {
//         console.log("TODO initialize", threadId);
//         return { remoteId: threadId, externalId: threadId };
//       },
//       async generateTitle(remoteId: string, unstable_messages: readonly ThreadMessage[]): Promise<ReadableStream> {
//         console.log("TODO generateTitle", remoteId, unstable_messages);
//         return new ReadableStream();
//       },
//     }
//   });
// };


function ChatComponent() {
  // const runtime = useChatRuntime({
  //   api: "/api/chat",
  // });
  const runtime = useRemoteThreadListRuntime({
    runtimeHook: useMyRuntime,
    adapter: {
      async list(): Promise<RemoteThreadListResponse> {
        console.log("TODO list");
        return { threads: []};
      },
      async rename(remoteId: string, newTitle: string): Promise<void> {
        console.log("TODO rename", remoteId, newTitle);
        // TODO: Implement rename
      },
      async archive(remoteId: string): Promise<void> {
        console.log("TODO archive", remoteId);
        // TODO: Implement archive
      },
      async unarchive(remoteId: string): Promise<void> {
        console.log("TODO unarchive", remoteId);
        // TODO: Implement unarchive
      },
      async delete(remoteId: string): Promise<void> {
        console.log("TODO delete", remoteId);
        // TODO: Implement delete
      },
      async initialize(threadId: string): Promise<RemoteThreadInitializeResponse> {
        console.log("TODO initialize", threadId);
        return { remoteId: threadId, externalId: threadId };
      },
      async generateTitle(remoteId: string, unstable_messages: readonly ThreadMessage[]): Promise<ReadableStream> {
        console.log("TODO generateTitle", remoteId, unstable_messages);
        return new ReadableStream();
      },
    }
  });
  const renderCount = ++useRef(0).current;

  return (
    <SignedIn>
      <h1>Render Count: {renderCount}</h1>
      {/* <div className="grid h-dvh grid-cols-[200px_1fr] gap-x-2 px-4 py-72"> */}
      {/* <ThreadList /> */}
      <AssistantRuntimeProvider runtime={runtime}>
        <div className="h-dvh flex flex-col p-12">
          <div className="flex gap-2 mb-4">
            <ThreadList />
            <ToolUIs />
          </div>
          <div className="flex-1 overflow-auto">
            <Thread />
          </div>
        </div>
      </AssistantRuntimeProvider>
    </SignedIn>
  );
}
