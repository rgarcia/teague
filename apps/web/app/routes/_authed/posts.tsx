import { Link, Outlet, createFileRoute } from "@tanstack/react-router";
import {
  type FetchEmailsOutput,
  type FetchEmailsInput,
  fetchEmailsFn,
} from "~/utils/gmail.serverfns";
import { fetchPosts } from "~/utils/posts.js";

export const Route = createFileRoute("/_authed/posts")({
  loader: async ({ context }) => {
    if (!context.googleToken) {
      throw new Error("Google OAuth token not found");
    }
    return {
      context: context,
      posts: await fetchPosts(),
      fetchEmails: (await fetchEmailsFn({
        data: {
          googleToken: context.googleToken,
          query: "from:julieduncangarcia@gmail.com",
          maxResults: 10,
        },
      })) as FetchEmailsOutput,
    };
  },
  component: PostsComponent,
});

function PostsComponent() {
  const loaderData = Route.useLoaderData();

  return (
    <div className="p-2 flex gap-2">
      <div className="flex flex-col gap-4">
        <h1>
          <code>{loaderData.context.googleToken}</code>
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
              {loaderData.fetchEmails.emails.map((email) => (
                <tr key={email.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {email.id}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {email.payload?.headers?.find(
                      (header) => header.name?.toLowerCase() === "subject"
                    )?.value || "No Subject"}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {email.snippet}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {email.payload?.headers?.find(
                      (header) => header.name?.toLowerCase() === "content-type"
                    )?.value || "No Content-Type"}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {email.payload?.parts ? (
                      <div>
                        <div>Count: {email.payload.parts.length}</div>
                        <div className="mt-1">
                          {email.payload.parts.map((part, index) => (
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
                      ? Buffer.from(email.payload.body.data, "base64").toString(
                          "utf-8"
                        )
                      : "No body data"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <ul className="list-disc pl-4">
          {[
            ...loaderData.posts,
            { id: "i-do-not-exist", title: "Non-existent Post" },
          ].map((post) => {
            return (
              <li key={post.id} className="whitespace-nowrap">
                <Link
                  to="/posts/$postId"
                  params={{
                    postId: post.id,
                  }}
                  className="block py-1 text-blue-800 hover:text-blue-600"
                  activeProps={{ className: "text-black font-bold" }}
                >
                  <div>{post.title.substring(0, 20)}</div>
                </Link>
              </li>
            );
          })}
        </ul>
        <hr />
        <Outlet />
      </div>
    </div>
  );
}
