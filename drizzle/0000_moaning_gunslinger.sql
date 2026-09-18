CREATE TABLE `friendships` (
	`a` text NOT NULL,
	`b` text NOT NULL,
	`requester` text NOT NULL,
	`accepted` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`a`, `b`),
	FOREIGN KEY (`a`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`b`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `friendships_b` ON `friendships` (`b`);--> statement-breakpoint
CREATE TABLE `games` (
	`id` text PRIMARY KEY NOT NULL,
	`room` text,
	`day` text,
	`answer` text NOT NULL,
	`started` integer NOT NULL,
	FOREIGN KEY (`room`) REFERENCES `rooms`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `games_day` ON `games` (`day`);--> statement-breakpoint
CREATE TABLE `members` (
	`room` text NOT NULL,
	`user` text NOT NULL,
	PRIMARY KEY(`room`, `user`),
	FOREIGN KEY (`room`) REFERENCES `rooms`(`code`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `members_user` ON `members` (`user`);--> statement-breakpoint
CREATE TABLE `players` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`code` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `players_code_unique` ON `players` (`code`);--> statement-breakpoint
CREATE TABLE `progress` (
	`game` text NOT NULL,
	`user` text NOT NULL,
	`rows` text DEFAULT '[]' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'playing' NOT NULL,
	`started` integer NOT NULL,
	`finished` integer,
	PRIMARY KEY(`game`, `user`),
	FOREIGN KEY (`game`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `progress_user_status` ON `progress` (`user`,`status`);--> statement-breakpoint
CREATE TABLE `rooms` (
	`code` text PRIMARY KEY NOT NULL,
	`host` text NOT NULL,
	`status` text DEFAULT 'waiting' NOT NULL,
	`round` integer DEFAULT 0 NOT NULL,
	`game_id` text,
	`created` integer NOT NULL,
	FOREIGN KEY (`host`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `rooms_host_created` ON `rooms` (`host`,`created`);