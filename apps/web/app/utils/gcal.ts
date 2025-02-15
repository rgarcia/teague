import { calendar, type calendar_v3 } from "@googleapis/calendar";
import { OAuth2Client } from "google-auth-library";

export function calendarClientForToken(token: string): calendar_v3.Calendar {
  const auth = new OAuth2Client();
  auth.setCredentials({ access_token: token });
  return calendar({ version: "v3", auth });
}
