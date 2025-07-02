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

class AutoUpdater {
  private db: DatabaseService
  private isRunning: boolean = false
  private checkInterval: number = 60000 // Check every minute
  private batchSize: number = 1000 // Process blocks in batches

  constructor() {
    this.db = new DatabaseService()
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('Auto updater is already running')
      return
    }

    this.isRunning = true
    console.log('Starting auto updater...')

    while (this.isRunning) {
      try {
        await this.processNewBlocks()
        await sleep(this.checkInterval)
      } catch (error) {
        console.error('Error in auto updater:', error)
        await sleep(this.checkInterval)
      }
    }
  }

  async stop(): Promise<void> {
    this.isRunning = false
    console.log('Stopping auto updater...')
  }

  private async processNewBlocks(): Promise<void> {
    const currentBlock = await client.getBlockNumber()
    const currentBlockNumber = Number(currentBlock)

    // Get latest processed blocks for each token
    const ytLatest = await this.db.getLatestBlock('yt')
    const steerLatest = await this.db.getLatestBlock('steer')

    // Determine the starting block for each token
    const ytStartBlock = ytLatest ? ytLatest + 1 : ytDeployBlock
    const steerStartBlock = steerLatest ? steerLatest + 1 : steerDeployBlock

    // Process YT if there are new blocks
    if (ytStartBlock <= currentBlockNumber) {
      const ytEndBlock = Math.min(ytStartBlock + this.batchSize - 1, currentBlockNumber)
      console.log(`Processing YT blocks ${ytStartBlock} to ${ytEndBlock}`)
      await this.ingestYtEvents(ytStartBlock, ytEndBlock)
    }

    // Process Steer if there are new blocks
    if (steerStartBlock <= currentBlockNumber) {
      const steerEndBlock = Math.min(steerStartBlock + this.batchSize - 1, currentBlockNumber)
      console.log(`Processing Steer blocks ${steerStartBlock} to ${steerEndBlock}`)
      await this.ingestSteerEvents(steerStartBlock, steerEndBlock)
    }

    console.log(`Auto update check completed. Current block: ${currentBlockNumber}`)
  }

  private async ingestYtEvents(fromBlock: number, toBlock: number): Promise<void> {
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
      await this.db.saveTransferEvents(allEvents)
      console.log(`Saved ${allEvents.length} YT events to database`)
    }
  }

  private async ingestSteerEvents(fromBlock: number, toBlock: number): Promise<void> {
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
      await this.db.saveTransferEvents(allEvents)
      console.log(`Saved ${allEvents.length} Steer events to database`)
    }
  }

  async close(): Promise<void> {
    await this.stop()
    await this.db.close()
  }
}

// Main execution
async function main() {
  const updater = new AutoUpdater()
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('Received SIGINT, shutting down...')
    await updater.close()
    process.exit(0)
  })

  process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, shutting down...')
    await updater.close()
    process.exit(0)
  })

  try {
    await updater.start()
  } catch (error) {
    console.error('Auto updater failed:', error)
    await updater.close()
    process.exit(1)
  }
}

main() 