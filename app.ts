import dotenv from "dotenv"
import express, { Request, Response } from "express"
import { DatabaseService } from "./database"

dotenv.config()
const app = express()
const port = process.env.API_PORT
app.use(express.json())

const db = new DatabaseService()

const steerIsland = '0xDB78B4166580917c9604f8DdfBea5F49B493845c'
const goldivault = '0x66090e34c9192Ee9927f44f978246be3e5365D36'

app.get(`/${goldivault}/:block`, async (req: Request, res: Response): Promise<void> => {
  try {
    const block = parseInt(req.params.block)
    
    if (isNaN(block)) {
      res.status(400).json({ error: "Invalid block number" })
      return
    }

    const balances = await db.getTokenBalances('yt', block)


    res.json({ holders: balances })
  }
  catch (e) {
    console.log('Error retrieving YT balances: ', e)
    res.status(500).json({ error: "Failed retrieving balances" })
  }
})

app.get(`/${steerIsland}/:block`, async (req: Request, res: Response): Promise<void> => {
  try {
    const block = parseInt(req.params.block)
    
    if (isNaN(block)) {
      res.status(400).json({ error: "Invalid block number" })
      return
    }

    const balances = await db.getTokenBalances('steer', block)
  

    res.json({ holders: balances })
  }
  catch (e) {
    console.log('Error retrieving Steer balances: ', e)
    res.status(500).json({ error: "Failed retrieving balances" })
  }
})

app.get('/infrared/:block', async (req: Request, res: Response): Promise<void> => {
  try {
    const block = parseInt(req.params.block)
    
    if (isNaN(block)) {
      res.status(400).json({ error: "Invalid block number" })
      return
    }

    const balances = await db.getCombinedBalances(['yt', 'steer'], block)
    
    if (balances.length === 0) {
      res.status(404).json({ error: "No data found for this block" })
      return
    }

    const timestamp = Math.floor(Date.now() / 1000).toString()
    res.json({ data: balances, timestamp })
  }
  catch (e) {
    console.log('Error retrieving combined balances: ', e)
    res.status(500).json({ error: "Failed retrieving balances" })
  }
})

app.listen(port, () => console.log(`oribgt-balances-api running on http://localhost:${port}`))

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...')
  await db.close()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...')
  await db.close()
  process.exit(0)
})