import dotenv from "dotenv"
import {
  createPublicClient,
  http,
  parseAbi,
  parseAbiItem,
  formatEther,
  type Chain
} from "viem"
import { DatabaseService, TokenBalance } from "./database"

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

async function ingestYtBalances(fromBlock: number, toBlock: number) {
  console.log(`Ingesting YT balances from block ${fromBlock} to ${toBlock}`)
  
  const db = new DatabaseService()
  let ytHolders: Record<string, number> = {}

  // First, get all events in the range to build up the balance state
  const allEvents: Array<{block: number, from: string, to: string, amount: number, type: 'transfer' | 'ytbuy'}> = []

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
        block: blockNumber,
        from: fromAddress,
        to: toAddress,
        amount: amount,
        type: 'transfer'
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
        block: blockNumber,
        from: '',
        to: user,
        amount: amount,
        type: 'ytbuy'
      })
    }

    await sleep(5)
  }

  // Sort events by block number
  allEvents.sort((a, b) => a.block - b.block)

  // Now iterate through every block and apply events
  for (let currentBlock = fromBlock; currentBlock <= toBlock; currentBlock++) {
    // Apply all events that happened at this block
    const blockEvents = allEvents.filter(event => event.block === currentBlock)
    
    for (const event of blockEvents) {
      if (event.type === 'transfer') {
        if (event.from !== '0x0000000000000000000000000000000000000000') {
          if(ytHolders[event.from] == undefined) {
            ytHolders[event.from] = 0 - event.amount
          }
          else {
            const curr = ytHolders[event.from]
            ytHolders[event.from] = curr - event.amount
          }
        }
        if (event.to !== '0x0000000000000000000000000000000000000000') {
          if(ytHolders[event.to] == undefined) {
            ytHolders[event.to] = event.amount
          }
          else {
            const curr = ytHolders[event.to]
            ytHolders[event.to] = curr + event.amount
          }
        }
      } else if (event.type === 'ytbuy') {
        if(ytHolders[event.to] == undefined) {
          ytHolders[event.to] = event.amount
        }
        else {
          const curr = ytHolders[event.to]
          ytHolders[event.to] = curr + event.amount
        }
      }
    }

    // Save balances at this block (every block gets saved)
    const balances: TokenBalance[] = Object.entries(ytHolders)
      .map(([address, balance]) => ({
        address,
        balance,
        block: currentBlock,
        token: 'yt',
        timestamp: Math.floor(Date.now() / 1000)
      }))

    // Save the balance state for this block (always)
    console.log('saving entry for block #', currentBlock)
    await db.saveTokenBalances(balances, currentBlock, 'yt')
  }

  await db.close()
  console.log(`Completed YT ingestion for blocks ${fromBlock} to ${toBlock}`)
}

async function ingestSteerBalances(fromBlock: number, toBlock: number) {
  console.log(`Ingesting Steer balances from block ${fromBlock} to ${toBlock}`)
  
  const db = new DatabaseService()
  let steerHolders: Record<string, number> = {}

  // Process Transfer events
  for(let from = Math.max(fromBlock, steerDeployBlock); from <= toBlock; from += step) {
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
      const blockNumber = Number(log.blockNumber)
  
      if (amount == 0) continue
      if(fromAddress === beradrome.toLowerCase() || toAddress === beradrome.toLowerCase()) {
        continue
      }
      if(fromAddress === bgtVault.toLowerCase() || toAddress === bgtVault.toLowerCase()) {
        continue
      }
  
      if (fromAddress !== '0x0000000000000000000000000000000000000000') {
        if(steerHolders[fromAddress] == undefined) {
          console.log('shouldnt be happening lol', from , to)
        }
        else {
          const curr = steerHolders[fromAddress]
          steerHolders[fromAddress] = curr - amount
        }
      }
      if (toAddress !== '0x0000000000000000000000000000000000000000') {
        if(steerHolders[toAddress] == undefined) {
          steerHolders[toAddress] = amount
        }
        else {
          const curr = steerHolders[toAddress]
          steerHolders[toAddress] = curr + amount
        }
      }

      // Save balances at this block
      const balances: TokenBalance[] = Object.entries(steerHolders)
        .filter(([_, balance]) => balance > 0)
        .map(([address, balance]) => ({
          address,
          balance,
          block: blockNumber,
          token: 'steer',
          timestamp: Math.floor(Date.now() / 1000)
        }))

      if (balances.length > 0) {
        await db.saveTokenBalances(balances)
      }
    }

    await sleep(5)
  }

  // For Steer, we need to get the ratio at each block where we have data
  // This is more complex, so we'll get the ratio at the toBlock and apply it to all blocks
  const result = await client.readContract({
    address: steerIsland,
    abi: parseAbi(['function getTotalAmounts() external view returns (uint256 total0, uint256 total1)']),
    functionName: 'getTotalAmounts',
    args: [],
    blockNumber: BigInt(toBlock)
  })
  const resultSupply = await client.readContract({
    address: steerIsland,
    abi: parseAbi(['function totalSupply() external view returns (uint256)']),
    functionName: 'totalSupply',
    args: [],
    blockNumber: BigInt(toBlock)
  })
  const ratio = parseFloat(formatEther(result[0] as unknown as bigint)) / parseFloat(formatEther(resultSupply as unknown as bigint))
  
  // Update all Steer balances with the ratio
  const realSteerHolders: Record<string, number> = {}
  for (const [address, amount] of Object.entries(steerHolders)) {
    realSteerHolders[address] = amount * ratio
  }

  // Save final Steer balances with ratio applied
  const finalBalances: TokenBalance[] = Object.entries(realSteerHolders)
    .filter(([_, balance]) => balance > 0)
    .map(([address, balance]) => ({
      address,
      balance,
      block: toBlock,
      token: 'steer',
      timestamp: Math.floor(Date.now() / 1000)
    }))

  if (finalBalances.length > 0) {
    await db.saveTokenBalances(finalBalances)
  }

  await db.close()
  console.log(`Completed Steer ingestion for blocks ${fromBlock} to ${toBlock}`)
}

// Simple script - just change these values and run
const fromBlock = ytDeployBlock
const toBlock = 7000000

async function main() {
  console.log(`Starting ingestion from block ${fromBlock} to ${toBlock}`)
  
  try {
    await ingestYtBalances(fromBlock, toBlock)
    // await ingestSteerBalances(fromBlock, toBlock)
    console.log('Ingestion completed successfully')
  } catch (error) {
    console.error('Ingestion failed:', error)
    process.exit(1)
  }
}

main() 