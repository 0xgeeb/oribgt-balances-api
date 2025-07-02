import { Pool, PoolClient } from 'pg'

export interface TransferEvent {
  id?: number
  from: string
  to: string
  amount: number
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
      
      // Create table for transfer events
      const createTransferTableSQL = `
        CREATE TABLE IF NOT EXISTS transfer_events (
          id SERIAL PRIMARY KEY,
          from_address VARCHAR(42) NOT NULL,
          to_address VARCHAR(42) NOT NULL,
          amount DECIMAL(30,18) NOT NULL,
          block BIGINT NOT NULL,
          token VARCHAR(10) NOT NULL,
          timestamp BIGINT NOT NULL
        )
      `

      // Create table for tracking latest processed blocks
      const createLatestBlocksTableSQL = `
        CREATE TABLE IF NOT EXISTS latest_blocks (
          id SERIAL PRIMARY KEY,
          token VARCHAR(10) NOT NULL UNIQUE,
          latest_block BIGINT NOT NULL,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `

      console.log('Creating tables...')
      await client.query(createTransferTableSQL)
      await client.query(createLatestBlocksTableSQL)
      console.log('Tables created successfully')

      // Create indexes for better performance
      const createIndexesSQL = [
        'CREATE INDEX IF NOT EXISTS idx_token_block ON transfer_events(token, block)',
        'CREATE INDEX IF NOT EXISTS idx_block ON transfer_events(block)',
        'CREATE INDEX IF NOT EXISTS idx_token ON transfer_events(token)',
        'CREATE INDEX IF NOT EXISTS idx_from_address ON transfer_events(from_address)',
        'CREATE INDEX IF NOT EXISTS idx_to_address ON transfer_events(to_address)'
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

  async saveTransferEvents(events: TransferEvent[]): Promise<void> {
    if (events.length === 0) return

    const client = await this.pool.connect()
    
    try {
      await client.query('BEGIN')

      // Use a more efficient batch insert
      const values = events.map((event, index) => {
        const offset = index * 6
        return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6})`
      }).join(', ')

      const flatValues = events.flatMap(event => [
        event.from,
        event.to,
        event.amount,
        event.block,
        event.token,
        event.timestamp
      ])

      const query = `
        INSERT INTO transfer_events (from_address, to_address, amount, block, token, timestamp)
        VALUES ${values}
        ON CONFLICT DO NOTHING
      `

      await client.query(query, flatValues)
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  async updateLatestBlock(token: string, block: number): Promise<void> {
    const client = await this.pool.connect()
    
    try {
      const query = `
        INSERT INTO latest_blocks (token, latest_block)
        VALUES ($1, $2)
        ON CONFLICT (token) 
        DO UPDATE SET 
          latest_block = GREATEST(latest_blocks.latest_block, $2),
          updated_at = CURRENT_TIMESTAMP
      `

      await client.query(query, [token, block])
    } finally {
      client.release()
    }
  }

  async getTokenBalances(token: string, block: number): Promise<Record<string, number>> {
    const client = await this.pool.connect()
    
    try {
      // Get all transfer events up to the specified block
      const query = `
        SELECT from_address, to_address, amount::numeric as amount
        FROM transfer_events 
        WHERE token = $1 AND block <= $2
        ORDER BY block ASC
      `

      const result = await client.query(query, [token, block])
      
      // Reconstruct balances from events
      const balances: Record<string, number> = {}
      
      result.rows.forEach((row: any) => {
        const fromAddress = row.from_address.toLowerCase()
        const toAddress = row.to_address.toLowerCase()
        const amount = parseFloat(row.amount)

        // Handle from address (subtract amount)
        if (fromAddress !== '0x0000000000000000000000000000000000000000') {
          if (balances[fromAddress] === undefined) {
            balances[fromAddress] = 0
          }
          balances[fromAddress] -= amount
        }

        // Handle to address (add amount)
        if (toAddress !== '0x0000000000000000000000000000000000000000') {
          if (balances[toAddress] === undefined) {
            balances[toAddress] = 0
          }
          balances[toAddress] += amount
        }
      })

      // Filter out zero and negative balances
      // const positiveBalances: Record<string, number> = {}
      // for (const [address, balance] of Object.entries(balances)) {
      //   if (balance > 0) {
      //     positiveBalances[address] = balance
      //   }
      // }
      
      // return positiveBalances
      return balances
    } finally {
      client.release()
    }
  }


  async getSteerBalancesWithRatio(block: number, ratio: number): Promise<Record<string, number>> {
    const client = await this.pool.connect()
    
    try {
      // Get all transfer events up to the specified block
      const query = `
        SELECT from_address, to_address, amount::numeric as amount
        FROM transfer_events 
        WHERE token = 'steer' AND block <= $1
        ORDER BY block ASC
      `

      const result = await client.query(query, [block])
      
      // Reconstruct balances from events
      const balances: Record<string, number> = {}
      
      result.rows.forEach((row: any) => {
        const fromAddress = row.from_address.toLowerCase()
        const toAddress = row.to_address.toLowerCase()
        const amount = parseFloat(row.amount)

        // Handle from address (subtract amount)
        if (fromAddress !== '0x0000000000000000000000000000000000000000') {
          if (balances[fromAddress] === undefined) {
            balances[fromAddress] = 0
          }
          balances[fromAddress] -= amount
        }

        // Handle to address (add amount)
        if (toAddress !== '0x0000000000000000000000000000000000000000') {
          if (balances[toAddress] === undefined) {
            balances[toAddress] = 0
          }
          balances[toAddress] += amount
        }
      })

      // Apply ratio to get real balances
      const realBalances: Record<string, number> = {}
      for (const [address, balance] of Object.entries(balances)) {
        if (balance > 0) {
          realBalances[address] = balance * ratio
        }
      }
      
      return realBalances
    } finally {
      client.release()
    }
  }

  async getLatestBlock(token: string): Promise<number | null> {
    const client = await this.pool.connect()
    
    try {
      const query = `
        SELECT latest_block
        FROM latest_blocks 
        WHERE token = $1
      `

      const result = await client.query(query, [token])
      
      if (result.rows.length === 0) {
        return null
      }
      
      return parseInt(result.rows[0].latest_block)
    } finally {
      client.release()
    }
  }

  async close(): Promise<void> {
    await this.pool.end()
  }
} 