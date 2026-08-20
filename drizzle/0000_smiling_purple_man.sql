CREATE TABLE `activity_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`user_id` int,
	`entity_type` varchar(40) NOT NULL,
	`entity_id` int NOT NULL,
	`action` enum('created','updated','issued','sent_whatsapp','sent_email','paid','credited','deleted') NOT NULL,
	`detail` json,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `activity_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `customers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`name` varchar(200) NOT NULL,
	`ruc_base` varchar(20),
	`ruc_dv` varchar(1),
	`is_consumidor_final` boolean NOT NULL DEFAULT false,
	`whatsapp` varchar(20),
	`email` varchar(255),
	`address` varchar(300),
	`doc_locale` enum('es','en') NOT NULL DEFAULT 'es',
	`notes` text,
	`active` boolean NOT NULL DEFAULT true,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_by` int,
	CONSTRAINT `customers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `document_lines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`document_id` int NOT NULL,
	`product_id` int,
	`description` varchar(300) NOT NULL,
	`unit` varchar(30) NOT NULL DEFAULT 'unidad',
	`qty` bigint NOT NULL DEFAULT 1000,
	`unit_amount` bigint NOT NULL DEFAULT 0,
	`tax_rate` enum('10','5','exenta') NOT NULL DEFAULT '10',
	`line_total` bigint NOT NULL DEFAULT 0,
	`line_iva` bigint NOT NULL DEFAULT 0,
	`position` int NOT NULL DEFAULT 0,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `document_lines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`type` enum('quote','invoice_contado','invoice_credito','credit_note') NOT NULL,
	`status` enum('borrador','enviado','aceptado','rechazado','vencido','pendiente','parcial','pagada','vencida','anulada') NOT NULL DEFAULT 'borrador',
	`number` varchar(20),
	`timbrado_id` int,
	`customer_id` int NOT NULL,
	`doc_locale` enum('es','en') NOT NULL DEFAULT 'es',
	`currency` enum('PYG','USD') NOT NULL DEFAULT 'PYG',
	`exchange_rate` bigint,
	`issue_date` date,
	`due_date` date,
	`valid_until` date,
	`related_document_id` int,
	`public_token` varchar(64),
	`subtotal_10` bigint NOT NULL DEFAULT 0,
	`subtotal_5` bigint NOT NULL DEFAULT 0,
	`subtotal_exenta` bigint NOT NULL DEFAULT 0,
	`iva_10` bigint NOT NULL DEFAULT 0,
	`iva_5` bigint NOT NULL DEFAULT 0,
	`total` bigint NOT NULL DEFAULT 0,
	`pdf_snapshot` varchar(500),
	`issued_at` datetime,
	`issued_by` int,
	`notes` text,
	`created_by` int,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_by` int,
	CONSTRAINT `documents_id` PRIMARY KEY(`id`),
	CONSTRAINT `documents_tenant_number_uq` UNIQUE(`tenant_id`,`number`),
	CONSTRAINT `documents_public_token_uq` UNIQUE(`public_token`)
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`document_id` int NOT NULL,
	`amount` bigint NOT NULL,
	`currency` enum('PYG','USD') NOT NULL DEFAULT 'PYG',
	`method` enum('efectivo','transferencia','tarjeta','cheque','tigo_money','billetera_personal','zimple','qr') NOT NULL,
	`paid_at` datetime NOT NULL,
	`reference` varchar(120),
	`notes` text,
	`created_by` int,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_by` int,
	CONSTRAINT `payments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`name` varchar(200) NOT NULL,
	`description` text,
	`unit` varchar(30) NOT NULL DEFAULT 'unidad',
	`unit_amount` bigint NOT NULL DEFAULT 0,
	`currency` enum('PYG','USD') NOT NULL DEFAULT 'PYG',
	`tax_rate` enum('10','5','exenta') NOT NULL DEFAULT '10',
	`active` boolean NOT NULL DEFAULT true,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_by` int,
	CONSTRAINT `products_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tenants` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(160) NOT NULL,
	`ruc_base` varchar(20),
	`ruc_dv` varchar(1),
	`logo_url` varchar(500),
	`market_profile` enum('py') NOT NULL DEFAULT 'py',
	`default_currency` enum('PYG','USD') NOT NULL DEFAULT 'PYG',
	`address` varchar(300),
	`phone` varchar(20),
	`email` varchar(255),
	`status` enum('demo','active','suspended') NOT NULL DEFAULT 'demo',
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_by` int,
	CONSTRAINT `tenants_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `timbrados` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`number` varchar(20) NOT NULL,
	`valid_from` date NOT NULL,
	`valid_to` date NOT NULL,
	`establishment` varchar(3) NOT NULL DEFAULT '001',
	`expedition_point` varchar(3) NOT NULL DEFAULT '001',
	`range_start` int NOT NULL DEFAULT 1,
	`range_end` int NOT NULL,
	`next_sequence` int NOT NULL DEFAULT 1,
	`active` boolean NOT NULL DEFAULT true,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_by` int,
	CONSTRAINT `timbrados_id` PRIMARY KEY(`id`),
	CONSTRAINT `timbrados_tenant_point_uq` UNIQUE(`tenant_id`,`number`,`establishment`,`expedition_point`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`email` varchar(255) NOT NULL,
	`password_hash` varchar(255) NOT NULL,
	`name` varchar(160) NOT NULL,
	`role` enum('admin','employee','viewer') NOT NULL DEFAULT 'viewer',
	`ui_locale` enum('es','en') NOT NULL DEFAULT 'es',
	`must_change_password` boolean NOT NULL DEFAULT false,
	`active` boolean NOT NULL DEFAULT true,
	`last_login_at` datetime,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_by` int,
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_tenant_email_uq` UNIQUE(`tenant_id`,`email`)
);
--> statement-breakpoint
ALTER TABLE `activity_log` ADD CONSTRAINT `activity_log_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `activity_log` ADD CONSTRAINT `activity_log_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `customers` ADD CONSTRAINT `customers_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `document_lines` ADD CONSTRAINT `document_lines_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `document_lines` ADD CONSTRAINT `document_lines_document_id_documents_id_fk` FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `document_lines` ADD CONSTRAINT `document_lines_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `documents` ADD CONSTRAINT `documents_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `documents` ADD CONSTRAINT `documents_timbrado_id_timbrados_id_fk` FOREIGN KEY (`timbrado_id`) REFERENCES `timbrados`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `documents` ADD CONSTRAINT `documents_customer_id_customers_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `documents` ADD CONSTRAINT `documents_related_document_id_documents_id_fk` FOREIGN KEY (`related_document_id`) REFERENCES `documents`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `documents` ADD CONSTRAINT `documents_issued_by_users_id_fk` FOREIGN KEY (`issued_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `documents` ADD CONSTRAINT `documents_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payments` ADD CONSTRAINT `payments_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payments` ADD CONSTRAINT `payments_document_id_documents_id_fk` FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payments` ADD CONSTRAINT `payments_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `products` ADD CONSTRAINT `products_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `timbrados` ADD CONSTRAINT `timbrados_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `activity_log_tenant_entity_idx` ON `activity_log` (`tenant_id`,`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `activity_log_tenant_created_idx` ON `activity_log` (`tenant_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `customers_tenant_ruc_idx` ON `customers` (`tenant_id`,`ruc_base`);--> statement-breakpoint
CREATE INDEX `customers_tenant_name_idx` ON `customers` (`tenant_id`,`name`);--> statement-breakpoint
CREATE INDEX `document_lines_tenant_document_idx` ON `document_lines` (`tenant_id`,`document_id`);--> statement-breakpoint
CREATE INDEX `documents_tenant_type_status_idx` ON `documents` (`tenant_id`,`type`,`status`);--> statement-breakpoint
CREATE INDEX `documents_tenant_customer_idx` ON `documents` (`tenant_id`,`customer_id`);--> statement-breakpoint
CREATE INDEX `documents_tenant_due_idx` ON `documents` (`tenant_id`,`due_date`);--> statement-breakpoint
CREATE INDEX `documents_tenant_issue_idx` ON `documents` (`tenant_id`,`issue_date`);--> statement-breakpoint
CREATE INDEX `payments_tenant_document_idx` ON `payments` (`tenant_id`,`document_id`);--> statement-breakpoint
CREATE INDEX `payments_tenant_paid_at_idx` ON `payments` (`tenant_id`,`paid_at`);--> statement-breakpoint
CREATE INDEX `products_tenant_name_idx` ON `products` (`tenant_id`,`name`);--> statement-breakpoint
CREATE INDEX `tenants_status_idx` ON `tenants` (`status`);--> statement-breakpoint
CREATE INDEX `timbrados_tenant_active_idx` ON `timbrados` (`tenant_id`,`active`,`valid_to`);--> statement-breakpoint
CREATE INDEX `users_tenant_role_idx` ON `users` (`tenant_id`,`role`);