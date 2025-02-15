import { type calendar_v3 } from "@googleapis/calendar";
import { createServerFn } from "@tanstack/start";
import { calendarClientForToken } from "./gcal";

export type AcceptInvite = {
  googleToken: string;
  eventId: string;
};

export const acceptInvite = createServerFn({ method: "POST" })
  .validator((input: unknown): AcceptInvite => {
    return input as AcceptInvite;
  })
  .handler(async ({ data: { googleToken, eventId } }): Promise<void> => {
    const calendarClient = calendarClientForToken(googleToken);

    // eventId in gcal URLs is base64 encoded text with a " " in it - the first part is the event ID, the second part is the calendar ID-ish, I think?
    // base64 decode the eventId
    const eventIdParts = Buffer.from(eventId, "base64")
      .toString("utf-8")
      .split(" ");
    eventId = eventIdParts[0];
    let event: calendar_v3.Schema$Event;
    const res = await calendarClient.events.get({
      calendarId: "primary",
      eventId: eventId,
    });
    event = res.data;

    // Update the event with responseStatus = "accepted"
    const response = await calendarClient.events.patch({
      calendarId: "primary",
      eventId: eventId,
      requestBody: {
        attendees: event!.attendees?.map(
          (attendee: calendar_v3.Schema$EventAttendee) => {
            if (attendee.self) {
              return {
                ...attendee,
                responseStatus: "accepted",
              };
            }
            return attendee;
          }
        ),
      },
    });
    if (response.status !== 200) {
      throw new Error(
        `Failed to accept invite: ${response.status} ${response.data}`
      );
    }
  });
