CREATE TABLE `blobs` (
	`id` text PRIMARY KEY,
	`hash` text NOT NULL UNIQUE,
	`mime_type` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` integer DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY,
	`title` text NOT NULL,
	`original_file` text NOT NULL,
	`content` blob NOT NULL,
	`created_at` integer DEFAULT (datetime('now')) NOT NULL,
	`updated_at` integer DEFAULT (datetime('now')) NOT NULL
);
