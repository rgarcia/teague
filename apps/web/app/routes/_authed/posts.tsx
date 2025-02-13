import { Link, Outlet, createFileRoute } from "@tanstack/react-router";
import { fetchPosts } from "~/utils/posts.js";

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

  return (
    <div className="p-2 flex gap-2">
      <div className="flex flex-col gap-4">
        <h1>
          <code>{loaderData.context.googleToken}</code>
        </h1>

        {/* Email Data Display */}
        <div className="border p-4 rounded-lg">
          <h2 className="font-bold mb-2">Next Email:</h2>
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
