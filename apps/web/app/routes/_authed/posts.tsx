import { Link, Outlet, createFileRoute } from "@tanstack/react-router";
import { fetchPosts } from "~/utils/posts.js";
import { gmail_v1, google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/_authed/posts")({
  loader: async ({ context }) => {
    return {
      context: context,
      posts: await fetchPosts(),
    };
  },
  component: PostsComponent,
});

function PostsComponent() {
  const loaderData = Route.useLoaderData();
  const [emailData, setEmailData] = useState<any>(null);

  useEffect(() => {
    const fetchEmail = async () => {
      try {
        const response = await fetch("/api/gmail/next-email", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            maxResults: 1,
            q: "in:inbox",
          }),
        });
        const data = await response.json();
        setEmailData(data);
      } catch (error) {
        console.error("Error fetching email:", error);
      }
    };

    fetchEmail();
  }, []);

  return (
    <div className="p-2 flex gap-2">
      <div className="flex flex-col gap-4">
        <h1>
          <code>{loaderData.context.googleToken}</code>
        </h1>

        {/* Email Data Display */}
        <div className="border p-4 rounded-lg">
          <h2 className="font-bold mb-2">Next Email:</h2>
          {emailData ? (
            <pre className="whitespace-pre-wrap">
              {JSON.stringify(emailData, null, 2)}
            </pre>
          ) : (
            <p>Loading email data...</p>
          )}
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
