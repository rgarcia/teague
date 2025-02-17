import { createServerFn } from "@tanstack/start";
import { acceptInvite, AcceptInviteInput, AcceptInviteOutput } from "./gcal";

export const acceptInviteFn = createServerFn({ method: "POST" })
  .validator((input: unknown): AcceptInviteInput => {
    return input as AcceptInviteInput;
  })
  .handler(
    async ({ data: { googleToken, eventId } }): Promise<AcceptInviteOutput> => {
      await acceptInvite({ googleToken, eventId });
    }
  );
