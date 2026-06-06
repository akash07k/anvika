CREATE TABLE `app_state` (
	`owner` text PRIMARY KEY NOT NULL,
	`last_active_conversation_id` text,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `conversation` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`title` text NOT NULL,
	`messages` text NOT NULL,
	`reasoning_override` text,
	`model_id` text,
	`pinned_at` integer,
	`forked_from_id` text,
	`forked_from_message_id` text,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `conversation_owner_idx` ON `conversation` (`owner`);