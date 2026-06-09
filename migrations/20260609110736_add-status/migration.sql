ALTER TABLE `documents` ADD `status` text DEFAULT 'done';
UPDATE `documents` SET `status` = 'done';
ALTER TABLE `documents` ALTER COLUMN `status` SET NOT NULL;--> statement-breakpoint
ALTER TABLE `documents` ADD `error` text;
