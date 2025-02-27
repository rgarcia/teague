ALTER TABLE `suggestions` DROP FOREIGN KEY `suggestions_doc_fk`;
--> statement-breakpoint
ALTER TABLE `chats` MODIFY COLUMN `createdAt` timestamp(6) NOT NULL DEFAULT (now());--> statement-breakpoint
ALTER TABLE `chats` MODIFY COLUMN `updatedAt` timestamp(6) DEFAULT (now());--> statement-breakpoint
ALTER TABLE `documents` MODIFY COLUMN `createdAt` timestamp(6) NOT NULL DEFAULT (now());--> statement-breakpoint
ALTER TABLE `documents` MODIFY COLUMN `updatedAt` timestamp(6) DEFAULT (now());--> statement-breakpoint
ALTER TABLE `messages` MODIFY COLUMN `createdAt` timestamp(6) NOT NULL DEFAULT (now());--> statement-breakpoint
ALTER TABLE `messages` MODIFY COLUMN `updatedAt` timestamp(6) DEFAULT (now());--> statement-breakpoint
ALTER TABLE `suggestions` MODIFY COLUMN `createdAt` timestamp(6) NOT NULL DEFAULT (now());--> statement-breakpoint
ALTER TABLE `suggestions` MODIFY COLUMN `updatedAt` timestamp(6) DEFAULT (now());--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `createdAt` timestamp(6) NOT NULL DEFAULT (now());--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `updatedAt` timestamp(6) DEFAULT (now());--> statement-breakpoint
ALTER TABLE `votes` MODIFY COLUMN `createdAt` timestamp(6) NOT NULL DEFAULT (now());--> statement-breakpoint
ALTER TABLE `votes` MODIFY COLUMN `updatedAt` timestamp(6) DEFAULT (now());