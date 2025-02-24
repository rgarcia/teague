CREATE TABLE `chats` (
	`id` varchar(128) NOT NULL,
	`title` text NOT NULL,
	`userId` varchar(128) NOT NULL,
	`visibility` varchar(32) NOT NULL DEFAULT 'private',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp DEFAULT (now()),
	CONSTRAINT `chats_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` varchar(128) NOT NULL,
	`title` text NOT NULL,
	`content` text,
	`kind` varchar(32) NOT NULL DEFAULT 'text',
	`userId` varchar(128) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp DEFAULT (now()),
	CONSTRAINT `documents_id_createdAt_pk` PRIMARY KEY(`id`,`createdAt`)
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` varchar(128) NOT NULL,
	`chatId` varchar(128) NOT NULL,
	`role` varchar(32) NOT NULL,
	`content` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp DEFAULT (now()),
	CONSTRAINT `messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `suggestions` (
	`id` varchar(128) NOT NULL,
	`documentId` varchar(128) NOT NULL,
	`documentCreatedAt` timestamp NOT NULL,
	`originalText` text NOT NULL,
	`suggestedText` text NOT NULL,
	`description` text,
	`isResolved` boolean NOT NULL DEFAULT false,
	`userId` varchar(128) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp DEFAULT (now()),
	CONSTRAINT `suggestions_id_pk` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` varchar(128) NOT NULL,
	`clerkId` varchar(128) NOT NULL,
	`email` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `votes` (
	`chatId` varchar(128) NOT NULL,
	`messageId` varchar(128) NOT NULL,
	`isUpvoted` boolean NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp DEFAULT (now()),
	CONSTRAINT `votes_chatId_messageId_pk` PRIMARY KEY(`chatId`,`messageId`)
);
--> statement-breakpoint
ALTER TABLE `chats` ADD CONSTRAINT `chats_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `documents` ADD CONSTRAINT `documents_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `messages` ADD CONSTRAINT `messages_chatId_chats_id_fk` FOREIGN KEY (`chatId`) REFERENCES `chats`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `suggestions` ADD CONSTRAINT `suggestions_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `suggestions` ADD CONSTRAINT `suggestions_doc_fk` FOREIGN KEY (`documentId`,`documentCreatedAt`) REFERENCES `documents`(`id`,`createdAt`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `votes` ADD CONSTRAINT `votes_chatId_chats_id_fk` FOREIGN KEY (`chatId`) REFERENCES `chats`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `votes` ADD CONSTRAINT `votes_messageId_messages_id_fk` FOREIGN KEY (`messageId`) REFERENCES `messages`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `clerk_id_idx` ON `users` (`clerkId`);