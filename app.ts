import dotenv from "dotenv"
import express, { Request, Response } from "express"
import { createPublicClient, http, parseAbi, formatEther, type Chain } from "viem"
import { DatabaseService } from "./database"

dotenv.config()
const app = express()
const port = process.env.API_PORT
app.use(express.json())

const db = new DatabaseService()

const rpc = process.env.RPC_URL ?? ''
const steerIsland = '0xDB78B4166580917c9604f8DdfBea5F49B493845c'
const goldivault = '0x66090e34c9192Ee9927f44f978246be3e5365D36'

const BerachainMainnet = {
  id: 80094,
  name: "Berachain",
  nativeCurrency: { name: "BERA", symbol: "BERA", decimals: 18 },
  rpcUrls: { default: { http: [rpc] }, public: { http: [rpc] } }
} as const satisfies Chain

const client = createPublicClient({
  chain: BerachainMainnet,
  transport: http()
})

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
    
    if (isNaN(block) || block < 4053186) {
      res.status(400).json({ error: "Invalid block number" })
      return
    }



    const result = await client.readContract({
      address: steerIsland,
      abi: parseAbi(['function getTotalAmounts() external view returns (uint256 total0, uint256 total1)']),
      functionName: 'getTotalAmounts',
      args: [],
      blockNumber: BigInt(block)
    })
    const resultSupply = await client.readContract({
      address: steerIsland,
      abi: parseAbi(['function totalSupply() external view returns (uint256)']),
      functionName: 'totalSupply',
      args: [],
      blockNumber: BigInt(block)
    })
    const ratio = parseFloat(formatEther(result[0] as unknown as bigint)) / parseFloat(formatEther(resultSupply as unknown as bigint))

    const balances = await db.getSteerBalancesWithRatio(block, ratio)
    
    if (Object.keys(balances).length === 0) {
      res.status(404).json({ error: "No data found for this block" })
      return
    }

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

    // Get YT balances
    const ytBalances = await db.getTokenBalances('yt', block)
    

    
    const result = await client.readContract({
      address: steerIsland,
      abi: parseAbi(['function getTotalAmounts() external view returns (uint256 total0, uint256 total1)']),
      functionName: 'getTotalAmounts',
      args: [],
      blockNumber: BigInt(block)
    })
    const resultSupply = await client.readContract({
      address: steerIsland,
      abi: parseAbi(['function totalSupply() external view returns (uint256)']),
      functionName: 'totalSupply',
      args: [],
      blockNumber: BigInt(block)
    })
    const ratio = parseFloat(formatEther(result[0] as unknown as bigint)) / parseFloat(formatEther(resultSupply as unknown as bigint))

    const steerBalances = await db.getSteerBalancesWithRatio(block, ratio)
    
    // Combine balances
    const combinedBalances: Record<string, number> = {}
    
    // Add YT balances
    for (const [address, balance] of Object.entries(ytBalances)) {
      combinedBalances[address] = balance
    }
    
    // Add Steer balances
    for (const [address, balance] of Object.entries(steerBalances)) {
      if (combinedBalances[address]) {
        combinedBalances[address] += balance
      } else {
        combinedBalances[address] = balance
      }
    }
    
    // Convert to array format
    const balances = Object.entries(combinedBalances)
      .filter(([_, balance]) => balance > 0)
      .map(([address, balance]) => ({
        address,
        balance: balance.toString()
      }))
      .sort((a, b) => parseFloat(b.balance) - parseFloat(a.balance))
    
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