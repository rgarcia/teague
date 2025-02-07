export interface TranscriptItem {
  itemId: string;
  type: "MESSAGE" | "BREADCRUMB";
  role?: "user" | "assistant";
  title?: string;
  data?: Record<string, any>;
  expanded: boolean;
  timestamp: string;
  createdAtMs: number;
  status: "IN_PROGRESS" | "DONE";
  isHidden: boolean;
}

export interface LoggedEvent {
  id: number | string;
  direction: "client" | "server";
  expanded: boolean;
  timestamp: string;
  eventName: string;
  eventData: Record<string, any>; // can have arbitrary objects logged
}
