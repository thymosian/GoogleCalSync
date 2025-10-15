CREATE TABLE "conversation_contexts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"current_mode" varchar DEFAULT 'casual' NOT NULL,
	"meeting_data" json,
	"compression_level" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "meeting_drafts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"conversation_id" varchar,
	"title" varchar,
	"meeting_type" varchar,
	"start_time" timestamp,
	"end_time" timestamp,
	"location" varchar,
	"attendees" json,
	"agenda" text,
	"status" varchar DEFAULT 'draft',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "conversation_id" varchar;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "intent" varchar;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "confidence" numeric(3, 2);--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "extracted_fields" json;--> statement-breakpoint
ALTER TABLE "conversation_contexts" ADD CONSTRAINT "conversation_contexts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_drafts" ADD CONSTRAINT "meeting_drafts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_drafts" ADD CONSTRAINT "meeting_drafts_conversation_id_conversation_contexts_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation_contexts"("id") ON DELETE no action ON UPDATE no action;