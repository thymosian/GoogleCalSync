import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runMigrations() {
  const DATABASE_URL = process.env.DATABASE_URL;
  
  if (!DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  const sql = neon(DATABASE_URL);

  console.log('🔄 Starting database migrations...\n');

  try {
    // Split SQL statements by the statement breakpoint comment
    const splitStatements = (sqlContent: string): string[] => {
      return sqlContent
        .split('--> statement-breakpoint')
        .map(stmt => stmt.trim())
        .filter(stmt => stmt.length > 0);
    };

    // Read migration files
    const migrationsDir = join(__dirname, '..', 'migrations');
    const migration1 = readFileSync(join(migrationsDir, '0000_huge_magdalene.sql'), 'utf-8');
    const migration2 = readFileSync(join(migrationsDir, '0001_light_psylocke.sql'), 'utf-8');

    // Check which tables already exist
    const checkTables = await sql`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('users', 'chat_messages', 'events', 'tasks', 'conversation_contexts', 'meeting_drafts')
    `;
    const existingTables = checkTables.map((row: any) => row.table_name);
    
    console.log('📊 Existing tables:', existingTables.join(', ') || 'none\n');

    // Run first migration if base tables don't exist
    if (!existingTables.includes('users') || !existingTables.includes('chat_messages')) {
      console.log('📄 Running migration: 0000_huge_magdalene.sql');
      const statements1 = splitStatements(migration1);
      for (let i = 0; i < statements1.length; i++) {
        console.log(`  Executing statement ${i + 1}/${statements1.length}...`);
        try {
          await sql(statements1[i]);
        } catch (err: any) {
          // Skip "already exists" errors
          if (err.code === '42P07') {
            console.log(`  ⚠️  Skipped (already exists)`);
          } else {
            throw err;
          }
        }
      }
      console.log('✅ Migration 0000_huge_magdalene.sql completed\n');
    } else {
      console.log('⏭️  Skipping 0000_huge_magdalene.sql (tables already exist)\n');
    }

    // Run second migration if conversation_contexts doesn't exist
    if (!existingTables.includes('conversation_contexts')) {
      console.log('📄 Running migration: 0001_light_psylocke.sql');
      const statements2 = splitStatements(migration2);
      for (let i = 0; i < statements2.length; i++) {
        console.log(`  Executing statement ${i + 1}/${statements2.length}...`);
        try {
          await sql(statements2[i]);
        } catch (err: any) {
          // Skip "already exists" errors and column already exists
          if (err.code === '42P07' || err.code === '42701') {
            console.log(`  ⚠️  Skipped (already exists)`);
          } else {
            throw err;
          }
        }
      }
      console.log('✅ Migration 0001_light_psylocke.sql completed\n');
    } else {
      console.log('⏭️  Skipping 0001_light_psylocke.sql (conversation_contexts already exists)\n');
    }

    console.log('🎉 All migrations completed successfully!\n');
    console.log('Tables created:');
    console.log('  - users');
    console.log('  - chat_messages');
    console.log('  - events');
    console.log('  - tasks');
    console.log('  - conversation_contexts ✅');
    console.log('  - meeting_drafts\n');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigrations();
