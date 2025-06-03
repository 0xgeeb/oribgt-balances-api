import dotenv from "dotenv"
import express, { Request, Response } from "express"
import {
  createPublicClient,
  http,
  parseAbi,
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

const steerIsland = '0xDB78B4166580917c9604f8DdfBea5F49B493845c'
const beradrome = '0x5f36C4E43e591da0C7F761B09274AB460c391bA1'
const bgtVault = '0xeEE277a91F9F50cda5d188522C921820a848cD99'
const goldivault = '0x66090e34c9192Ee9927f44f978246be3e5365D36'
const yt = '0xB345a602c2e24051a57e2339a98c815a6e45059c'
const steerDeployBlock = 4053186
const ytDeployBlock = 3845931
const step = 10000

let steerHolders: Record<string, number> = {}
let steerProcessing: boolean = false
let ytHolders: Record<string, number> = {}
let ytProcessing: boolean = false
let infraredProcessing: boolean = false

const getYtBalances = async (toBlock: number) => {
  for(let from = ytDeployBlock; from <= toBlock; from += step) {
    const to = Math.min(from + step - 1, toBlock)
    const logs = await client.getLogs({
      address: yt,
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
      if(fromAddress === goldivault.toLowerCase() || toAddress === goldivault.toLowerCase()) {
        continue
      }
  
      if (fromAddress !== '0x0000000000000000000000000000000000000000') {
        if(ytHolders[fromAddress] == undefined) {
          // console.log('shouldnt be happening lol', from , to, fromAddress, toAddress)
          ytHolders[fromAddress] = 0 - amount
        }
        else {
          const curr = ytHolders[fromAddress]
          ytHolders[fromAddress] = curr - amount
        }
      }
      if (toAddress !== '0x0000000000000000000000000000000000000000') {
        if(ytHolders[toAddress] == undefined) {
          ytHolders[toAddress] = amount
        }
        else {
          const curr = ytHolders[toAddress]
          ytHolders[toAddress] = curr + amount
        }
      }
    }

    await sleep(5)
  }

  for(let from = ytDeployBlock; from <= toBlock; from += step) {
    const to = Math.min(from + step - 1, toBlock)
    const logs = await client.getLogs({
      address: goldivault,
      event: parseAbiItem('event YTBuy(address indexed from, uint256, uint256)'),
      fromBlock: BigInt(from),
      toBlock: BigInt(to)
    })
    console.log(`checked blocks ${from} to ${to} and found ${logs.length} logs`)

    for (const log of logs) {
      const user = (log.args?.[0] as string).toLowerCase()
      const amountBigInt = log.args?.[1] as bigint
      const amount = parseFloat(formatEther(amountBigInt as unknown as bigint))

      if(ytHolders[user] == undefined) {
        ytHolders[user] = amount
      }
      else {
        const curr = ytHolders[user]
        ytHolders[user] = curr + amount
      }      
    }

    await sleep(5)
  }
  
  console.log(ytHolders)
  return ytHolders
}

const getSteerBalances = async (toBlock: number) => {
  for(let from = steerDeployBlock; from <= toBlock; from += step) {
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
    }

    await sleep(5)
  }
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
  const realSteerHolders: Record<string, number> = {}
  for (const [address, amount] of Object.entries(steerHolders)) {
    realSteerHolders[address] = amount * ratio
  }
  
  console.log(steerHolders)
  console.log(realSteerHolders)
  return realSteerHolders
}

app.get(`/${goldivault}/:block`, async (req: Request, res: Response): Promise<void> => {
  const currentBlock = await client.getBlockNumber()
  if(parseFloat(req.params.block) > parseFloat(currentBlock.toString())) {
    res.status(404).json({ error: "block not found" })
    return
  }
  if(ytProcessing) {
    res.status(429).json({ error: "already processing request" })
    return
  }
  ytProcessing = true
  try {
    const block = parseFloat(req.params.block)
    ytHolders = {}
    const result = await getYtBalances(block)
    const filteredHolders = Object.fromEntries(Object.entries(result).filter(([_, balance]) => balance > 0))
    res.json({ holders: filteredHolders })
  }
  catch (e) {
    console.log('whoops: ', e)
    res.status(500).json({ error: "failed retreiving balances" })
  }
  finally {
    ytProcessing = false
  }
})

app.get(`/${steerIsland}/:block`, async (req: Request, res: Response): Promise<void> => {
  const currentBlock = await client.getBlockNumber()
  if(parseFloat(req.params.block) > parseFloat(currentBlock.toString())) {
    res.status(404).json({ error: "block not found" })
    return
  }
  if(steerProcessing) {
    res.status(429).json({ error: "already processing request" })
    return
  }
  steerProcessing = true
  try {
    const block = parseFloat(req.params.block)
    steerHolders = {}
    const result = await getSteerBalances(block)
    const filteredHolders = Object.fromEntries(Object.entries(result).filter(([_, balance]) => balance > 0))
    res.json({ holders: filteredHolders })
  }
  catch (e) {
    console.log('whoops: ', e)
    res.status(500).json({ error: "failed retreiving balances" })
  }
  finally {
    steerProcessing = false
  }
})

app.get('/infrared/:block', async (req: Request, res: Response): Promise<void> => {
  const currentBlock = await client.getBlockNumber()
  if(parseFloat(req.params.block) > parseFloat(currentBlock.toString())) {
    res.status(404).json({ error: "block not found" })
    return
  }
  if(infraredProcessing || steerProcessing || ytProcessing) {
    res.status(429).json({ error: "already processing request" })
    return
  }
  infraredProcessing = true
  try {
    const block = parseFloat(req.params.block)
    steerHolders = {}
    ytHolders = {}
    const steerResult = await getSteerBalances(block)
    const ytResult = await getYtBalances(block)
    const combinedHolders: Record<string, number> = {}
    for (const [address, balance] of Object.entries(steerResult)) {
      combinedHolders[address] = balance
    }
    for (const [address, balance] of Object.entries(ytResult)) {
      combinedHolders[address] = (combinedHolders[address] || 0) + balance
    }
    const filteredHolders = Object.entries(combinedHolders)
      .filter(([_, balance]) => balance > 0)
      .map(([address, balance]: [string, number]) => ({
        address,
        balance: balance.toString()
      }));
    const timestamp = Math.floor(Date.now() / 1000).toString()
    res.json({ data: filteredHolders, timestamp })
  }
  catch (e) {
    console.log('whoops: ', e)
    res.status(500).json({ error: "failed retrieving balances" })
  }
  finally {
    infraredProcessing = false
  }
})

app.listen(port, () => console.log(`oribgt-balances-api running on http://localhost:${port}`))