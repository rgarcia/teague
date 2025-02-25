import { Outlet, createFileRoute } from "@tanstack/react-router";
import { type FetchEmailsInput } from "~/utils/gmail";
import { useObservableSyncedQuery } from "@legendapp/state/sync-plugins/tanstack-react-query";
import { fetchPosts } from "~/utils/posts.js";
import { Observable } from "@legendapp/state";
import { fetchEmailsQueryOptions } from "~/utils/gmail.serverfns";
import { gmail_v1 } from "@googleapis/gmail";
import { For } from "@legendapp/state/react";
import { useRef } from "react";

const defaultFetchEmailsInput = (context: {
  googleToken: string | undefined;
}): FetchEmailsInput => ({
  googleToken: context.googleToken!,
  query: "from:julieduncangarcia@gmail.com",
  maxResults: 10,
});

export const Route = createFileRoute("/_authed/posts")({
  loader: async ({ context }) => {
    if (!context.googleToken) {
      throw new Error("Google OAuth token not found");
    }
    const fetchEmails = await context.queryClient.ensureQueryData(
      fetchEmailsQueryOptions(defaultFetchEmailsInput(context))
    );

    return {
      context: context,
      posts: await fetchPosts(),
      fetchEmails,
    };
  },
  component: PostsComponent,
});

function PostsComponent() {
  const context = Route.useRouteContext();
  const store$ = useObservableSyncedQuery({
    query: fetchEmailsQueryOptions(defaultFetchEmailsInput(context)),
  });
  const renderCount = ++useRef(0).current;

  return (
    <div className="p-2 flex gap-2">
      <div className="flex flex-col gap-4">
        <h1>Render Count: {renderCount}</h1>
        <h1>
          <code>{context.googleToken}</code>
        </h1>

        {/* Emails Table */}
        <div className="border rounded-lg overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Subject
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Snippet
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Content-Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Parts
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Summary
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Raw Body
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              <For each={store$.emails} item={EmailItem} />
            </tbody>
          </table>
        </div>
        <hr />
        <Outlet />
      </div>
    </div>
  );
}

function EmailItem({
  item$: email$,
}: {
  item$: Observable<gmail_v1.Schema$Message>;
}) {
  const email = email$.get();
  return (
    <tr>
      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
        {email.id}
      </td>
      <td className="px-6 py-4 text-sm text-gray-500">
        {email.payload?.headers?.find(
          (header) => header.name?.toLowerCase() === "subject"
        )?.value || "No Subject"}
      </td>
      <td className="px-6 py-4 text-sm text-gray-500">
        {email.snippet || "No snippet"}
      </td>
      <td className="px-6 py-4 text-sm text-gray-500">
        {email.payload?.headers?.find(
          (header) => header.name?.toLowerCase() === "content-type"
        )?.value || "No Content-Type"}
      </td>
      <td className="px-6 py-4 text-sm text-gray-500">
        {email.payload?.parts ? (
          <div>
            <div>Count: {email.payload?.parts?.length}</div>
            <div className="mt-1">
              {email.payload?.parts?.map((part, index) => (
                <div key={index} className="text-xs">
                  {part.mimeType} ({part.parts?.length}:{" "}
                  {part.parts?.map((p) => p.mimeType).join(", ")})
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <div>Count: 0</div>
            <div className="text-xs mt-1">
              {email.payload?.mimeType || "No MIME type"}
            </div>
          </div>
        )}
      </td>
      {/* <td className="px-6 py-4 text-sm text-gray-500">
                    <div className="max-h-40 max-w-md overflow-auto whitespace-pre-wrap">
                      {summary}
                    </div>
                  </td> */}
      <td className="px-6 py-4 text-sm text-gray-500 font-mono">
        {email.payload?.body?.data
          ? Buffer.from(email.payload?.body?.data ?? "", "base64").toString(
              "utf-8"
            )
          : "No body data"}
      </td>
    </tr>
  );
}
