import { timestamp } from "drizzle-orm/mysql-core";

export const lifecycleDates = {
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .$onUpdate(() => new Date()),
};
