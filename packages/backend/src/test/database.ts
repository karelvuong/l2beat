import { Logger, getEnv } from '@l2beat/backend-tools'

import { Database, createDatabase } from '@l2beat/database'
import { LegacyDatabase } from '@l2beat/database-legacy'
import { DatabaseConfig } from '../config/Config'

export function describeDatabase(
  name: string,
  suite: (legacyDb: LegacyDatabase, newDb: Database) => void,
) {
  const databases = getTestDatabase()

  describe(name, function () {
    before(async function () {
      if (!databases) {
        this.skip()
      } else {
        await databases.legacyDb.migrateToLatest()
      }
    })

    after(async () => {
      await databases?.legacyDb.closeConnection()
    })

    if (databases) {
      suite(databases.legacyDb, databases.newDb)
    } else {
      it.skip('Database tests skipped')
    }
  })
}

export function getTestDatabase(opts?: Partial<DatabaseConfig>) {
  const env = getEnv()
  const connection = env.optionalString('TEST_DB_URL')
  if (!connection) {
    if (process.env.CI !== undefined) {
      throw new Error('TEST_DB_URL is required in CI')
    }
    return
  }

  const legacyDb = new LegacyDatabase(
    {
      connection: {
        connectionString: connection,
      },
      connectionPoolSize: {
        min: 5,
        max: 20,
      },
      freshStart: false,
      enableQueryLogging: false,
      isReadonly: false,
      ...opts,
    },
    Logger.SILENT,
    'Backend/Test',
  )
  const newDb = createDatabase({
    connectionString: connection,
    application_name: 'Backend/Test',
  })

  return { newDb, legacyDb }
}
