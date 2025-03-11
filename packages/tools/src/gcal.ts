import { calendar, type calendar_v3 } from "@googleapis/calendar";
import { OAuth2Client } from "google-auth-library";

export function calendarClientForToken(token: string): calendar_v3.Calendar {
  const auth = new OAuth2Client();
  auth.setCredentials({ access_token: token });
  return calendar({ version: "v3", auth });
}

export type AcceptInviteInput = {
  googleToken: string;
  eventId: string;
};

export type AcceptInviteOutput = void;

export async function acceptInvite(
  input: AcceptInviteInput
): Promise<AcceptInviteOutput> {
  const calendarClient = calendarClientForToken(input.googleToken);

  // eventId in gcal URLs is base64 encoded text with a " " in it - the first part is the event ID, the second part is the calendar ID-ish, I think?
  // base64 decode the eventId
  const eventIdParts = Buffer.from(input.eventId, "base64")
    .toString("utf-8")
    .split(" ");
  const eventId = eventIdParts[0];

  let event: calendar_v3.Schema$Event;
  const res = await calendarClient.events.get({
    calendarId: "primary",
    eventId: eventId,
  });
  if (res.status !== 200) {
    throw new Error(`Failed to get event: ${res.status} ${res.data}`);
  }
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
}
