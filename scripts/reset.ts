import pg from 'pg';
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
await c.query('drop schema public cascade; create schema public;');
await c.end();
console.log('schema dropped — run db:migrate');
