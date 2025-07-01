import { Pool, PoolClient } from 'pg'

interface DatabaseRow {
  address: string
  balance: number
  latest_block?: number
  total_balance?: number
}

export interface TokenBalance {
  address: string
  balance: number
  block: number
  token: string
  timestamp: number
}

export class DatabaseService {
  private pool: Pool

  constructor() {
    console.log('Initializing database connection...')
    console.log('DB_HOST:', process.env.DB_HOST || 'localhost')
    console.log('DB_PORT:', process.env.DB_PORT || '5432')
    console.log('DB_NAME:', process.env.DB_NAME || 'token_balances')
    console.log('DB_USER:', process.env.DB_USER || 'postgres')
    
    this.pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'token_balances',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      max: 20, // Maximum number of clients in the pool
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    })

    this.initDatabase()
  }

  private async initDatabase(): Promise<void> {
    try {
      console.log('Connecting to database...')
      const client = await this.pool.connect()
      console.log('Connected to database successfully')
      
      // Create table if it doesn't exist
      const createTableSQL = `
        CREATE TABLE IF NOT EXISTS token_balances (
          id SERIAL PRIMARY KEY,
          address VARCHAR(42) NOT NULL,
          balance DECIMAL(30,18) NOT NULL,
          block BIGINT NOT NULL,
          token VARCHAR(10) NOT NULL,
          timestamp BIGINT NOT NULL,
          UNIQUE(address, block, token)
        )
      `

      console.log('Creating table...')
      await client.query(createTableSQL)
      console.log('Table created successfully')

      // Create indexes for better performance
      const createIndexesSQL = [
        'CREATE INDEX IF NOT EXISTS idx_token_block ON token_balances(token, block)',
        'CREATE INDEX IF NOT EXISTS idx_address_token ON token_balances(address, token)',
        'CREATE INDEX IF NOT EXISTS idx_block ON token_balances(block)',
        'CREATE INDEX IF NOT EXISTS idx_token ON token_balances(token)'
      ]

      console.log('Creating indexes...')
      for (const indexSQL of createIndexesSQL) {
        try {
          await client.query(indexSQL)
        } catch (error) {
          // Index might already exist, ignore error
          console.log('Index creation note:', error)
        }
      }

      client.release()
      console.log('Database initialized successfully')
    } catch (error) {
      console.error('Error initializing database:', error)
      console.error('Please check your database connection settings in .env file')
      console.error('Make sure PostgreSQL is running and the database exists')
      throw error
    }
  }

  async saveTokenBalances(balances: TokenBalance[], block?: number, token?: string): Promise<void> {
    const client = await this.pool.connect()
    
    try {
      await client.query('BEGIN')

      if (balances.length === 0) {
        // Insert a dummy entry to mark this block as processed
        const dummyQuery = `
          INSERT INTO token_balances (address, balance, block, token, timestamp)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (address, block, token) DO NOTHING
        `
        await client.query(dummyQuery, ['empty_block', 0, block, token, Math.floor(Date.now() / 1000)])
      } else {
        // Use a more efficient batch insert
        const values = balances.map((balance, index) => {
          const offset = index * 5
          return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`
        }).join(', ')

        const flatValues = balances.flatMap(balance => [
          balance.address,
          balance.balance,
          balance.block,
          balance.token,
          balance.timestamp
        ])

        const query = `
          INSERT INTO token_balances (address, balance, block, token, timestamp)
          VALUES ${values}
          ON CONFLICT (address, block, token) 
          DO UPDATE SET 
            balance = EXCLUDED.balance,
            timestamp = EXCLUDED.timestamp
        `

        await client.query(query, flatValues)
      }
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  async getTokenBalances(token: string, block: number): Promise<Record<string, number>> {
    const client = await this.pool.connect()
    
    try {
      const query = `
        SELECT address, balance::numeric as balance
        FROM token_balances 
        WHERE token = $1 AND block = $2 AND balance > 0
        ORDER BY balance DESC
      `

      const result = await client.query(query, [token, block])
      
      const balances: Record<string, number> = {}
      result.rows.forEach((row: any) => {
        balances[row.address] = parseFloat(row.balance)
      })
      
      return balances
    } finally {
      client.release()
    }
  }

  async getLatestBlock(token: string): Promise<number | null> {
    const client = await this.pool.connect()
    
    try {
      const query = `
        SELECT MAX(block) as latest_block 
        FROM token_balances 
        WHERE token = $1
      `

      const result = await client.query(query, [token])
      return result.rows[0]?.latest_block || null
    } finally {
      client.release()
    }
  }

  async getCombinedBalances(tokens: string[], block: number): Promise<Array<{address: string, balance: string}>> {
    const client = await this.pool.connect()
    
    try {
      const query = `
        SELECT address, SUM(balance::numeric) as total_balance
        FROM token_balances 
        WHERE token = ANY($1) AND block = $2 AND balance > 0
        GROUP BY address
        HAVING SUM(balance::numeric) > 0
        ORDER BY total_balance DESC
      `

      const result = await client.query(query, [tokens, block])
      
      return result.rows.map((row: any) => ({
        address: row.address,
        balance: row.total_balance.toString()
      }))
    } finally {
      client.release()
    }
  }



  async checkBlockExists(token: string, block: number): Promise<boolean> {
    const client = await this.pool.connect()
    
    try {
      const query = `
        SELECT COUNT(*) as count
        FROM token_balances 
        WHERE token = $1 AND block = $2
      `

      const result = await client.query(query, [token, block])
      return parseInt(result.rows[0].count) > 0
    } finally {
      client.release()
    }
  }

  async close(): Promise<void> {
    await this.pool.end()
  }
} 