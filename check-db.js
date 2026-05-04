const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function main() {
  const result = await pool.query(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'BackpressureState'
    ORDER BY ordinal_position
  `);
  
  console.log('BackpressureState columns:');
  result.rows.forEach(row => console.log(`  - ${row.column_name}`));
  
  const orderResult = await pool.query(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'Order'
    ORDER BY ordinal_position
  `);
  
  console.log('\nOrder columns:');
  orderResult.rows.forEach(row => console.log(`  - ${row.column_name}`));
  
  await pool.end();
}

main().catch(console.error);
