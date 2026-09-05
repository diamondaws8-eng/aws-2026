const { Pool } = require('pg')
require('dotenv').config({ path: '.env.local' })

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

pool.query('SELECT id, name, email, role FROM "user"')
  .then(res => {
    console.log(JSON.stringify(res.rows, null, 2))
    pool.end()
  })
  .catch(err => {
    console.error(err)
    pool.end()
  })
