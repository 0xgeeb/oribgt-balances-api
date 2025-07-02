import dotenv from "dotenv"
import {
  createPublicClient,
  http,
  parseAbi,
  parseAbiItem,
  formatEther,
  type Chain
} from "viem"
import { DatabaseService, TransferEvent } from "./database"

dotenv.config()
const rpc = process.env.RPC_URL ?? ''

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
      http: [rpc],
    },
    public: {
      http: [rpc],
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

const steerIsland = '0xDB78B4166580917c9604f8DdfBea5F49B493845c'
const beradrome = '0x5f36C4E43e591da0C7F761B09274AB460c391bA1'
const bgtVault = '0xeEE277a91F9F50cda5d188522C921820a848cD99'
const goldivault = '0x66090e34c9192Ee9927f44f978246be3e5365D36'
const yt = '0xB345a602c2e24051a57e2339a98c815a6e45059c'
const steerDeployBlock = 4053186
const ytDeployBlock = 3845931
const step = 30000

async function ingestYtEvents(fromBlock: number, toBlock: number) {
  console.log(`Ingesting YT events from block ${fromBlock} to ${toBlock}`)
  
  const db = new DatabaseService()
  const allEvents: TransferEvent[] = []

  // Collect Transfer events
  for(let from = Math.max(fromBlock, ytDeployBlock); from <= toBlock; from += step) {
    const to = Math.min(from + step - 1, toBlock)
    const logs = await client.getLogs({
      address: yt,
      event: parseAbiItem('event Transfer(address indexed from, address indexed to, uint256)'),
      fromBlock: BigInt(from),
      toBlock: BigInt(to)
    })
    console.log(`checked blocks ${from} to ${to} and found ${logs.length} transfer logs`)

    for (const log of logs) {
      const fromAddress = (log.args?.[0] as string)?.toLowerCase()
      const toAddress = (log.args?.[1] as string)?.toLowerCase()
      const amountBigInt = log.args?.[2] as bigint
      const amount = parseFloat(formatEther(amountBigInt as unknown as bigint))
      const blockNumber = Number(log.blockNumber)
  
      if (amount == 0) continue
      if(fromAddress === goldivault.toLowerCase() || toAddress === goldivault.toLowerCase()) {
        continue
      }
  
      allEvents.push({
        from: fromAddress,
        to: toAddress,
        amount: amount,
        block: blockNumber,
        token: 'yt',
        timestamp: Math.floor(Date.now() / 1000)
      })
    }

    await sleep(5)
  }

  // Collect YTBuy events
  for(let from = Math.max(fromBlock, ytDeployBlock); from <= toBlock; from += step) {
    const to = Math.min(from + step - 1, toBlock)
    const logs = await client.getLogs({
      address: goldivault,
      event: parseAbiItem('event YTBuy(address indexed from, uint256, uint256)'),
      fromBlock: BigInt(from),
      toBlock: BigInt(to)
    })
    console.log(`checked blocks ${from} to ${to} and found ${logs.length} ytbuy logs`)

    for (const log of logs) {
      const user = (log.args?.[0] as string).toLowerCase()
      const amountBigInt = log.args?.[1] as bigint
      const amount = parseFloat(formatEther(amountBigInt as unknown as bigint))
      const blockNumber = Number(log.blockNumber)

      allEvents.push({
        from: '0x0000000000000000000000000000000000000000', // mint from zero address
        to: user,
        amount: amount,
        block: blockNumber,
        token: 'yt',
        timestamp: Math.floor(Date.now() / 1000)
      })
    }

    await sleep(5)
  }

  // Save all events to database
  if (allEvents.length > 0) {
    await db.saveTransferEvents(allEvents)
    console.log(`Saved ${allEvents.length} YT events to database`)
  }

  await db.close()
  console.log(`Completed YT event ingestion for blocks ${fromBlock} to ${toBlock}`)
}

async function ingestSteerEvents(fromBlock: number, toBlock: number) {
  console.log(`Ingesting Steer events from block ${fromBlock} to ${toBlock}`)
  
  const db = new DatabaseService()
  const allEvents: TransferEvent[] = []

  // Collect Transfer events
  for(let from = Math.max(fromBlock, steerDeployBlock); from <= toBlock; from += step) {
    const to = Math.min(from + step - 1, toBlock)
    const logs = await client.getLogs({
      address: steerIsland,
      event: parseAbiItem('event Transfer(address indexed from, address indexed to, uint256)'),
      fromBlock: BigInt(from),
      toBlock: BigInt(to)
    })
    console.log(`checked blocks ${from} to ${to} and found ${logs.length} transfer logs`)

    for (const log of logs) {
      const fromAddress = (log.args?.[0] as string)?.toLowerCase()
      const toAddress = (log.args?.[1] as string)?.toLowerCase()
      const amountBigInt = log.args?.[2] as bigint
      const amount = parseFloat(formatEther(amountBigInt as unknown as bigint))
      const blockNumber = Number(log.blockNumber)
  
      if (amount == 0) continue
      if(fromAddress === beradrome.toLowerCase() || toAddress === beradrome.toLowerCase()) {
        continue
      }
      if(fromAddress === bgtVault.toLowerCase() || toAddress === bgtVault.toLowerCase()) {
        continue
      }
  
      allEvents.push({
        from: fromAddress,
        to: toAddress,
        amount: amount,
        block: blockNumber,
        token: 'steer',
        timestamp: Math.floor(Date.now() / 1000)
      })
    }

    await sleep(5)
  }

  // Save all events to database
  if (allEvents.length > 0) {
    await db.saveTransferEvents(allEvents)
    console.log(`Saved ${allEvents.length} Steer events to database`)
  }

  await db.close()
  console.log(`Completed Steer event ingestion for blocks ${fromBlock} to ${toBlock}`)
}

const toBlock = 7000000

async function main() {
  console.log(`Starting event ingestion from block ${ytDeployBlock} to ${toBlock}`)
  
  try {
    await ingestYtEvents(ytDeployBlock, toBlock)
    await ingestSteerEvents(steerDeployBlock, toBlock)
    console.log('Event ingestion completed successfully')
  } catch (error) {
    console.error('Ingestion failed:', error)
    process.exit(1)
  }
}

main() 