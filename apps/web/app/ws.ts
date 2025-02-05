import { defineEventHandler, defineWebSocket } from "vinxi/http";

export default defineEventHandler({
  handler() {},
  websocket: defineWebSocket({
    // async upgrade(req) {
    //   const isAuthorized = await yourOwnAuthMethod(req); // e.g. check jwt
    //   // deny unauthorized connections
    //   if (!isAuthorized) {
    //     return new Response(null, { status: 401 });
    //   }
    // },
    open(peer) {
      peer.publish("test", `User ${peer} has connected!`);
      peer.send("You have connected successfully!");
      peer.subscribe("test");
    },
    async message(peer, msg) {
      const message = msg.text();
      console.log("msg", peer.id, message);
      peer.publish("test", message);
      peer.send("Hello to you!");
    },
    async close(peer, details) {
      peer.publish("test", `User ${peer} has disconnected!`);
      console.log("close", peer.id, details.reason);
    },
    async error(peer, error) {
      console.log("error", peer.id, error);
    },
  }),
});
