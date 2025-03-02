CREATE TABLE `mastra_evals` (
	`id` varchar(128) NOT NULL,
	`input` text NOT NULL,
	`output` text NOT NULL,
	`result` json NOT NULL,
	`agent_name` text NOT NULL,
	`metric_name` text NOT NULL,
	`instructions` text NOT NULL,
	`test_info` json,
	`global_run_id` text NOT NULL,
	`run_id` text NOT NULL,
	`createdAt` timestamp(6) NOT NULL DEFAULT (now()),
	CONSTRAINT `mastra_evals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mastra_messages` (
	`id` varchar(128) NOT NULL,
	`thread_id` varchar(128) NOT NULL,
	`content` text NOT NULL,
	`role` text NOT NULL,
	`type` text NOT NULL,
	`createdAt` timestamp(6) NOT NULL DEFAULT (now()),
	CONSTRAINT `mastra_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mastra_threads` (
	`id` varchar(128) NOT NULL,
	`resourceId` varchar(255) NOT NULL,
	`title` text NOT NULL,
	`metadata` text,
	`createdAt` timestamp(6) NOT NULL DEFAULT (now()),
	`updatedAt` timestamp(6) DEFAULT (now()),
	CONSTRAINT `mastra_threads_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mastra_traces` (
	`id` varchar(128) NOT NULL,
	`parentSpanId` text,
	`name` text NOT NULL,
	`traceId` text NOT NULL,
	`scope` text NOT NULL,
	`kind` int NOT NULL,
	`attributes` json,
	`status` json,
	`events` json,
	`links` json,
	`other` text,
	`startTime` bigint NOT NULL,
	`endTime` bigint NOT NULL,
	`createdAt` timestamp(6) NOT NULL DEFAULT (now()),
	`updatedAt` timestamp(6) DEFAULT (now()),
	CONSTRAINT `mastra_traces_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mastra_workflow_snapshot` (
	`id` varchar(128) NOT NULL,
	`workflow_name` varchar(255) NOT NULL,
	`run_id` varchar(255) NOT NULL,
	`snapshot` text NOT NULL,
	`createdAt` timestamp(6) NOT NULL DEFAULT (now()),
	`updatedAt` timestamp(6) DEFAULT (now()),
	CONSTRAINT `mastra_workflow_snapshot_id` PRIMARY KEY(`id`),
	CONSTRAINT `workflow_name_run_id_unique` UNIQUE(`workflow_name`,`run_id`)
);
--> statement-breakpoint
ALTER TABLE `chats` ADD `metadata` json;--> statement-breakpoint
ALTER TABLE `mastra_messages` ADD CONSTRAINT `mastra_messages_thread_id_mastra_threads_id_fk` FOREIGN KEY (`thread_id`) REFERENCES `mastra_threads`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `resource_id_idx` ON `mastra_threads` (`resourceId`);