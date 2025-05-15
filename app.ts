import dotenv from "dotenv"
import express, { Request, Response } from "express"
import {
  createPublicClient,
  http,
  parseAbiItem,
  formatEther,
  type Chain
} from "viem"

dotenv.config()
const app = express()
const port = process.env.API_PORT
app.use(express.json())

const BerachainMainnet = {
  id: 80094,
  name: "Berachain",
  nativeCurrency: {
    name: "BERA",
    symbol: "BERA",
    decimals: 18
  },
  rpcUrls: {
    default: {
      http: ["https://rpc.berachain.com/"],
    },
    public: {
      http: ["https://rpc.berachain.com/"],
    }
  }
} as const satisfies Chain

const client = createPublicClient({
  chain: BerachainMainnet,
  transport: http()
})

const sleep = async (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const holders: Record<string, number> = {}
let processing: boolean = false

const steerIsland = '0xDB78B4166580917c9604f8DdfBea5F49B493845c'
const beradrome = '0x5f36C4E43e591da0C7F761B09274AB460c391bA1'
const deployBlock = 4053186
const step = 10000

const getBalances = async (toBlock: number) => {
  for(let from = deployBlock; from <= toBlock; from += step) {
    const to = Math.min(from + step - 1, toBlock)
    const logs = await client.getLogs({
      address: steerIsland,
      event: parseAbiItem('event Transfer(address indexed from, address indexed to, uint256)'),
      fromBlock: BigInt(from),
      toBlock: BigInt(to)
    })
    console.log(`checked blocks ${from} to ${to} and found ${logs.length} logs`)

    for (const log of logs) {
      const fromAddress = (log.args?.[0] as string)?.toLowerCase()
      const toAddress = (log.args?.[1] as string)?.toLowerCase()
      const amountBigInt = log.args?.[2] as bigint
      const amount = parseFloat(formatEther(amountBigInt as unknown as bigint))
  
      if (amount == 0) continue
      if(fromAddress === beradrome.toLowerCase() || toAddress === beradrome.toLowerCase()) {
        continue
      }
  
      if (fromAddress !== '0x0000000000000000000000000000000000000000') {
        if(holders[fromAddress] == undefined) {
          console.log('shouldnt be happening lol', from , to)
        }
        else {
          const curr = holders[fromAddress]
          holders[fromAddress] = curr - amount
        }
      }
      if (toAddress !== '0x0000000000000000000000000000000000000000') {
        if(holders[toAddress] == undefined) {
          holders[toAddress] = amount
        }
        else {
          const curr = holders[toAddress]
          holders[toAddress] = curr + amount
        }
      }
    }

    await sleep(5)
  }
  
  console.log(holders)
  return holders
}

app.get("/oribgt-balances/:block", async (req: Request, res: Response): Promise<void> => {
  if(processing) {
    res.status(429).json({ error: "already processing request" })
    return
  }
  processing = true
  try {
    const block = parseFloat(req.params.block)
    const holders = await getBalances(block)
    const filteredHolders = Object.fromEntries(Object.entries(holders).filter(([_, balance]) => balance > 0))
    res.json({ holders: filteredHolders })
  }
  catch (e) {
    console.log('whoops: ', e)
    res.status(500).json({ error: "failed retreiving balances" })
  }
  finally {
    processing = false
  }
})

app.listen(port, () => console.log(`oribgt-balances-api running on http://localhost:${port}`))