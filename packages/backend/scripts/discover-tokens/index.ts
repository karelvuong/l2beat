import { writeFileSync } from 'fs'
import { Logger, RateLimiter, getEnv } from '@l2beat/backend-tools'
import { chains, layer2s, layer3s, tokenList } from '@l2beat/config'
import {
  BlockIndexerClient,
  CoingeckoClient,
  HttpClient,
  HttpClient2,
  RetryHandler,
} from '@l2beat/shared'
import { assert, ChainConverter, ChainId } from '@l2beat/shared-pure'
import chalk from 'chalk'
import { providers, utils } from 'ethers'
import { chunk, groupBy } from 'lodash'
import { RateLimitedProvider } from '../../src/peripherals/rpcclient/RateLimitedProvider'
import {
  OUTPUT_PATH,
  PROCESSED_ESCROWS_PATH,
  getEscrowKey,
  loadExistingTokens,
  loadProcessedEscrows,
} from './utils'

const MIN_MARKET_CAP = 10_000_000
const MIN_MISSING_VALUE = 10_000

interface ChainConfig {
  rpcEnvKey: string
  etherscanUrl: string
  etherscanEnvKey: string
  callsPerMinute: number
}

const CHAIN_CONFIG: Record<string, ChainConfig> = {
  ethereum: {
    rpcEnvKey: 'ETHEREUM_RPC_URL',
    etherscanUrl: 'https://api.etherscan.io/api',
    etherscanEnvKey: 'ETHEREUM_ETHERSCAN_API_KEY',
    callsPerMinute: 120,
  },
  arbitrum: {
    rpcEnvKey: 'ARBITRUM_RPC_URL',
    etherscanUrl: 'https://api.arbiscan.io/api',
    etherscanEnvKey: 'ARBITRUM_ETHERSCAN_API_KEY',
    callsPerMinute: 120,
  },
  optimism: {
    rpcEnvKey: 'OPTIMISM_RPC_URL',
    etherscanUrl: 'https://api-optimistic.etherscan.io/api',
    etherscanEnvKey: 'OPTIMISM_ETHERSCAN_API_KEY',
    callsPerMinute: 120,
  },
  base: {
    rpcEnvKey: 'BASE_RPC_URL',
    etherscanUrl: 'https://api.basescan.org/api',
    etherscanEnvKey: 'BASE_ETHERSCAN_API_KEY',
    callsPerMinute: 120,
  },
}

async function main() {
  const providers = new Map(
    Object.keys(CHAIN_CONFIG).map((chain) => [chain, getProvider(chain)]),
  )
  const etherscanClients = new Map(
    Object.keys(CHAIN_CONFIG).map((chain) => [
      chain,
      getEtherscanClient(chain),
    ]),
  )
  const coingeckoClient = getCoingeckoClient()
  const chainConverter = new ChainConverter(
    chains.map((c) => ({
      chainId: ChainId(c.chainId),
      name: c.name,
    })),
  )

  const escrowsByChain = groupBy(
    [...layer2s, ...layer3s]
      .flatMap((layer2) =>
        layer2.config.escrows.flatMap((e) => ({ ...e, projectId: layer2.id })),
      )
      .filter((e) => e.chain !== 'ethereum'),
    'chain',
  )

  const coingeckoTokens = await coingeckoClient.getCoinList({
    includePlatform: true,
  })

  const platformToChainName = new Map(
    chains.map((chain) => [chain.coingeckoPlatform, chain.name]),
  )

  const coingeckoTokensMap = new Map(
    coingeckoTokens.flatMap((token) =>
      Object.entries(token.platforms)
        .filter(
          ([platform, address]) => address && platformToChainName.has(platform),
        )
        .map(([platform, address]) => [
          `${platformToChainName.get(platform)}:${address?.toLowerCase()}`,
          {
            id: token.id,
            symbol: token.symbol,
          },
        ]),
    ),
  )

  const transferTopic = utils.id('Transfer(address,address,uint256)')
  const tokenContract = new utils.Interface([
    'function balanceOf(address) view returns (uint256)',
    'function decimals() view returns (uint8)',
  ])
  const existingTokens = loadExistingTokens()
  const processedEscrows = loadProcessedEscrows()
  const tokenListAddresses = new Set(
    tokenList.map(
      (t) => `${chainConverter.toName(t.chainId)}:${t.address?.toLowerCase()}`,
    ),
  )
  const allFoundTokens = new Map<
    string,
    {
      escrows: Map<string, { balance: number; project: string }>
      coingeckoId?: string
      symbol?: string
    }
  >(
    existingTokens.found.map((t) => [
      t.address?.toLowerCase(),
      {
        escrows: new Map(
          t.escrows.map((e) => [
            e.address,
            { balance: e.balance ?? 0, project: e.project },
          ]),
        ),
        coingeckoId: t.coingeckoId,
        symbol: t.symbol,
      },
    ]),
  )

  for (const [chain, chainEscrows] of Object.entries(escrowsByChain)) {
    if (!CHAIN_CONFIG[chain]) {
      console.log(chalk.red(`Skipping unsupported chain: ${chain}`))
      continue
    }

    const provider = providers.get(chain)
    assert(provider, `Provider for chain ${chain} not found`)
    const latestBlock = await provider.getBlockNumber()
    const etherscanClient = etherscanClients.get(chain)
    assert(etherscanClient, `Etherscan client for chain ${chain} not found`)

    for (const escrow of chainEscrows) {
      console.log(
        `Checking logs for escrow: ${escrow.address} - ${chainEscrows.findIndex((e) => e.address === escrow.address) + 1}/${chainEscrows.length} on ${escrow.chain}`,
      )

      const lastProcessedBlock =
        processedEscrows.processed?.[getEscrowKey(chain, escrow.address)] ??
        (await etherscanClient.getBlockNumberAtOrBefore(escrow.sinceTimestamp))
      const toTopic = utils.hexZeroPad(escrow.address, 32)

      const allLogs = await getAllLogs(
        provider,
        [transferTopic, null, toTopic],
        lastProcessedBlock,
        latestBlock,
      )

      console.log(
        `Processed blocks ${lastProcessedBlock}-${latestBlock}, found ${allLogs.length} logs for escrow ${escrow.address}`,
      )

      const tokensFromLogs = new Set(
        allLogs.map((l) => `${escrow.chain}:${l.address.toLowerCase()}`),
      )
      for (const tokenFromLog of tokensFromLogs) {
        if (
          coingeckoTokensMap.has(tokenFromLog) &&
          !tokenListAddresses.has(tokenFromLog)
        ) {
          if (!allFoundTokens.has(tokenFromLog)) {
            const tokenInfo = coingeckoTokensMap.get(tokenFromLog)
            allFoundTokens.set(tokenFromLog, {
              escrows: new Map(),
              coingeckoId: tokenInfo?.id,
              symbol: tokenInfo?.symbol,
            })
          }

          const rawAddress = tokenFromLog.split(':')[1]

          try {
            const [balance, decimals] = await Promise.all([
              provider.call({
                to: rawAddress,
                data: tokenContract.encodeFunctionData('balanceOf', [
                  escrow.address,
                ]),
              }),
              provider.call({
                to: rawAddress,
                data: tokenContract.encodeFunctionData('decimals'),
              }),
            ])
            const balanceValue = Number(
              utils.formatUnits(balance, Number(decimals)),
            )
            allFoundTokens.get(tokenFromLog)?.escrows.set(escrow.address, {
              balance: balanceValue,
              project: escrow.projectId,
            })
          } catch {
            console.warn(
              `Failed to get balance for token ${tokenFromLog} in escrow ${escrow.address}`,
            )
            allFoundTokens.get(tokenFromLog)?.escrows.set(escrow.address, {
              balance: 0,
              project: escrow.projectId,
            })
          }
        }
      }

      const dataToSave = Array.from(allFoundTokens.entries()).map(
        ([address, data]) => ({
          address,
          escrows: Array.from(data.escrows.entries()).map(([addr, data]) => ({
            address: addr,
            balance: data.balance,
            project: data.project,
          })),
          coingeckoId: data.coingeckoId,
          symbol: data.symbol,
        }),
      )
      processedEscrows.processed[getEscrowKey(chain, escrow.address)] =
        latestBlock

      writeFileSync(
        OUTPUT_PATH,
        JSON.stringify({ found: dataToSave }, null, 2) + '\n',
      )
      writeFileSync(
        PROCESSED_ESCROWS_PATH,
        JSON.stringify(processedEscrows, null, 2) + '\n',
      )

      console.log('Tokens not found in tokenList:', allFoundTokens.size)
    }
  }

  const chunks = chunk(
    Array.from(allFoundTokens.entries()).map(([address, data]) => ({
      address,
      coingeckoId: data.coingeckoId,
    })),
    100,
  )

  const tokenMarketData = new Map<
    string,
    { marketCap: number; price: number; circulatingSupply: number }
  >()

  // Get market data including circulating supply
  for (const chunk of chunks) {
    const coingeckoIds = chunk
      .map((t) => t.coingeckoId)
      .filter((id): id is string => id !== undefined)

    const marketData = (await coingeckoClient.query('/coins/markets', {
      vs_currency: 'usd',
      ids: coingeckoIds.join(','),
    })) as Array<{
      id: string
      circulating_supply: number
      market_cap: number
      current_price: number
    }>

    for (const data of marketData) {
      tokenMarketData.set(data.id, {
        marketCap: data.market_cap,
        price: data.current_price,
        circulatingSupply: data.circulating_supply,
      })
    }
  }

  console.log(
    `Filtering out tokens with market cap < ${MIN_MARKET_CAP} or missing value < ${MIN_MISSING_VALUE}...`,
  )
  const sortedTokens = Array.from(allFoundTokens.entries())
    .map(([address, data]) => {
      assert(data.coingeckoId, `Missing coingeckoId for token ${address}`)
      const marketData = tokenMarketData.get(data.coingeckoId)
      const tokenPrice = marketData?.price ?? 0
      const tokenMcap = marketData?.marketCap ?? 0
      const circulatingSupply = marketData?.circulatingSupply ?? 0

      const escrows = Array.from(data.escrows.entries()).map(([addr, data]) => {
        // Use the smaller value between escrow balance and circulating supply
        const adjustedBalance = Math.min(data.balance, circulatingSupply)
        return {
          address: addr,
          balance: adjustedBalance,
          value: Math.floor(adjustedBalance * tokenPrice),
          project: data.project,
        }
      })

      return {
        symbol: data.symbol,
        coingeckoId: data.coingeckoId,
        marketCap: Math.floor(tokenMcap),
        circulatingSupply,
        address,
        missingValue: escrows.reduce(
          (sum, escrow) => sum + (escrow.value ?? 0),
          0,
        ),
        escrows,
      }
    })
    .filter(
      (token) =>
        token.marketCap >= MIN_MARKET_CAP &&
        token.missingValue >= MIN_MISSING_VALUE,
    )
    .sort((a, b) => {
      const missingValueA = a.missingValue ?? 0
      const missingValueB = b.missingValue ?? 0
      return missingValueB - missingValueA
    })

  console.log(`Saving ${sortedTokens.length} tokens...`)

  writeFileSync(
    OUTPUT_PATH,
    JSON.stringify({ found: sortedTokens }, null, 2) + '\n',
  )
}

main().then(() => {
  console.log('done')
})

function getProvider(chain: string) {
  const env = getEnv()
  const config = CHAIN_CONFIG[chain]
  if (!config) {
    throw new Error(`Unsupported chain: ${chain}`)
  }

  const rpcUrl = env.string([config.rpcEnvKey])
  const rateLimitedProvider = new RateLimitedProvider(
    new providers.JsonRpcProvider(rpcUrl),
    4000,
  )
  return rateLimitedProvider
}

function getCoingeckoClient() {
  const env = getEnv()
  const coingeckoApiKey = env.optionalString('COINGECKO_API_KEY')
  const http = new HttpClient2()
  const rateLimiter = RateLimiter.COINGECKO(coingeckoApiKey)
  const coingeckoClient = new CoingeckoClient({
    http,
    rateLimiter,
    apiKey: coingeckoApiKey,
    retryHandler: RetryHandler.SCRIPT,
    logger: Logger.WARN,
  })
  return coingeckoClient
}

function getEtherscanClient(chain: string) {
  const env = getEnv()
  const config = CHAIN_CONFIG[chain]
  if (!config) {
    throw new Error(`Unsupported chain: ${chain}`)
  }

  return new BlockIndexerClient(
    new HttpClient(),
    new RateLimiter({ callsPerMinute: config.callsPerMinute }),
    {
      type: 'etherscan',
      chain,
      url: config.etherscanUrl,
      apiKey: env.string(config.etherscanEnvKey),
    },
  )
}

async function getAllLogs(
  provider: RateLimitedProvider,
  topics: (string | null)[],
  fromBlock: number,
  toBlock: number,
): Promise<providers.Log[]> {
  if (fromBlock === toBlock) {
    return await provider.getLogs({
      topics,
      fromBlock,
      toBlock,
    })
  }
  try {
    return await provider.getLogs({
      topics,
      fromBlock,
      toBlock,
    })
  } catch (e) {
    if (
      e instanceof Error &&
      (e.message.includes('Log response size exceeded') ||
        e.message.includes('query exceeds max block range 100000') ||
        e.message.includes('eth_getLogs is limited to a 10,000 range'))
    ) {
      const midPoint = fromBlock + Math.floor((toBlock - fromBlock) / 2)
      const [a, b] = await Promise.all([
        getAllLogs(provider, topics, fromBlock, midPoint),
        getAllLogs(provider, topics, midPoint + 1, toBlock),
      ])
      return a.concat(b)
    } else {
      throw e
    }
  }
}
