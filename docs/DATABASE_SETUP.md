# 🗄️ Database Setup Guide

## ❌ Current Error

```
NeonDbError: relation "conversation_contexts" does not exist
```

**Cause:** The database tables haven't been created yet from the migration files.

---

## ✅ Solution: Run Database Migrations

### **Step 1: Run Migrations**

Open a new terminal (stop your dev server if needed) and run:

```bash
npm run db:migrate
```

**Expected Output:**
```
🔄 Starting database migrations...

📄 Running migration: 0000_huge_magdalene.sql
✅ Migration 0000_huge_magdalene.sql completed

📄 Running migration: 0001_light_psylocke.sql
✅ Migration 0001_light_psylocke.sql completed

🎉 All migrations completed successfully!

Tables created:
  - users
  - chat_messages
  - events
  - tasks
  - conversation_contexts ✅
  - meeting_drafts
```

### **Step 2: Restart Your Server**

```bash
npm run dev
```

### **Step 3: Test the Conversational Chat**

Now try the chat flow:

```
"Schedule a meeting with john@example.com tomorrow at 2pm"
```

Should work without errors! ✅

---

## 📋 What the Migrations Create

### **Migration 0000_huge_magdalene.sql**
Creates base tables:
- ✅ `users` - User accounts and OAuth tokens
- ✅ `chat_messages` - Chat history
- ✅ `events` - Calendar events
- ✅ `tasks` - Meeting action items

### **Migration 0001_light_psylocke.sql**
Creates conversational workflow tables:
- ✅ `conversation_contexts` - Conversation state and meeting data
- ✅ `meeting_drafts` - Draft meetings being created

**This is the missing table causing your error!**

---

## 🔍 Verify Migrations Were Applied

### **Check if table exists:**

You can verify the table was created by running:

```bash
# If you have psql installed:
psql $DATABASE_URL -c "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'conversation_contexts');"
```

Or using Neon's web console:
1. Go to your Neon dashboard
2. Open SQL Editor
3. Run: `SELECT * FROM information_schema.tables WHERE table_schema = 'public';`
4. Look for `conversation_contexts` in the results

---

## 🚨 Alternative: Manual SQL Execution

If the script doesn't work, you can run the SQL files manually:

### **Via Neon Web Console:**

1. Go to https://console.neon.tech
2. Select your project
3. Open SQL Editor
4. Copy and paste the contents of:
   - First: `migrations/0000_huge_magdalene.sql`
   - Then: `migrations/0001_light_psylocke.sql`
5. Execute each one

### **Via psql (if installed):**

```bash
psql $DATABASE_URL -f migrations/0000_huge_magdalene.sql
psql $DATABASE_URL -f migrations/0001_light_psylocke.sql
```

---

## 🎯 Quick Reference

| Command | Purpose |
|---------|---------|
| `npm run db:migrate` | Run all pending migrations |
| `npm run db:push` | Push schema changes (for development) |
| `npm run dev` | Start development server |

---

## ✅ Success Checklist

After running migrations:
- [ ] Migration script completes without errors
- [ ] Server starts without database errors
- [ ] Can send chat messages
- [ ] Conversational workflow works
- [ ] No "relation does not exist" errors

---

## 💡 What Happened?

The project has migration files (`migrations/*.sql`) but they were never applied to the database. This typically happens when:
- Database was created but migrations weren't run
- Using a fresh Neon database without initial setup
- Migrations were added after the database was created

**The fix:** Simply run the migrations once to create the tables! 🎉
