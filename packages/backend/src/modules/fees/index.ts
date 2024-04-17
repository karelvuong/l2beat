import { createPublicClient, http } from 'viem'

import { EVMFeenalyzer } from './EVMFeenalyzer'
import { Feenalyzer } from './types'

// node -r esbuild-register src/modules/fees/index.ts

async function main() {
  const publicClient = createPublicClient({
    transport: http(
      'https://mainnet.infura.io/v3/812678bb4cf24e038a16f2549a678837',
    ),
  })
  const feenalyzers: Feenalyzer[] = [new EVMFeenalyzer(publicClient)]

  for (const f of feenalyzers) {
    const data = await f.getData(19674100)
    console.log(data)
  }
}

main().catch((e: unknown) => {
  console.error(e)
})
