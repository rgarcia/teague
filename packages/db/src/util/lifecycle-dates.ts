import { timestamp } from "drizzle-orm/mysql-core";

export const lifecycleDates = {
  createdAt: timestamp("createdAt", { fsp: 6 }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { fsp: 6 })
    .defaultNow()
    .$onUpdate(() => new Date()),
};
