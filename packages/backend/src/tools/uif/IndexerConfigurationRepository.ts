import { Logger } from '@l2beat/backend-tools'

import { LegacyDatabase } from '@l2beat/database-legacy'
import { Knex } from 'knex'
import {
  BaseRepository,
  CheckConvention,
} from '../../peripherals/database/BaseRepository'

export interface IndexerConfigurationRow {
  id: string
  indexer_id: string
  properties: string
  current_height: number | null
  min_height: number
  max_height: number | null
}

export interface IndexerConfigurationRecord {
  id: string
  indexerId: string
  properties: string
  currentHeight: number | null
  minHeight: number
  maxHeight: number | null
}

const BATCH_SIZE = 5_000

export class IndexerConfigurationRepository extends BaseRepository {
  constructor(database: LegacyDatabase, logger: Logger) {
    super(database, logger)
    this.autoWrap<CheckConvention<IndexerConfigurationRepository>>(this)
  }

  async addOrUpdateMany(configurations: IndexerConfigurationRecord[]) {
    const rows = configurations.map((record) => toRow(record))
    const upsertOptimizationQuery = getUpsertOptimization(Object.keys(rows[0]))

    await this.runInTransaction(async (trx) => {
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const knex = await this.knex(trx)

        await knex('indexer_configurations')
          .insert(rows.slice(i, i + BATCH_SIZE))
          .onConflict(['id'])
          .merge()
          .whereRaw(upsertOptimizationQuery)
      }
    })

    return rows.length
  }

  async getSavedConfigurations(
    indexerId: string,
  ): Promise<IndexerConfigurationRecord[]> {
    const knex = await this.knex()

    const rows = await knex('indexer_configurations').where(
      'indexer_id',
      indexerId,
    )
    return rows.map(toRecord)
  }

  async getSavedConfigurationsByIds(
    configurationIds: string[],
  ): Promise<IndexerConfigurationRecord[]> {
    const knex = await this.knex()

    const rows = await knex('indexer_configurations').whereIn(
      'id',
      configurationIds,
    )
    return rows.map(toRecord)
  }

  async updateSavedConfigurations(
    indexerId: string,
    configurationIds: string[],
    currentHeight: number | null,
    trx?: Knex.Transaction,
  ) {
    const knex = await this.knex(trx)

    return knex('indexer_configurations')
      .where('indexer_id', indexerId)
      .whereIn('id', configurationIds)
      .update({ current_height: currentHeight })
  }

  async deleteConfigurationsExcluding(
    indexerId: string,
    configurationIds: string[],
  ) {
    const knex = await this.knex()

    return knex('indexer_configurations')
      .where('indexer_id', indexerId)
      .whereNotIn('id', configurationIds)
      .delete()
  }

  // #region methods used only in tests

  async getAll(): Promise<IndexerConfigurationRecord[]> {
    const knex = await this.knex()
    const rows = await knex('indexer_configurations')
    return rows.map(toRecord)
  }

  async deleteAll() {
    const knex = await this.knex()
    return knex('indexer_configurations').delete()
  }

  // #endregion
}

function toRow(record: IndexerConfigurationRecord): IndexerConfigurationRow {
  return {
    id: record.id,
    indexer_id: record.indexerId,
    properties: record.properties,
    current_height: record.currentHeight,
    min_height: record.minHeight,
    max_height: record.maxHeight,
  }
}

function toRecord(row: IndexerConfigurationRow): IndexerConfigurationRecord {
  return {
    id: row.id,
    indexerId: row.indexer_id,
    properties: row.properties,
    currentHeight: row.current_height,
    minHeight: row.min_height,
    maxHeight: row.max_height,
  }
}

// Without this piece of code, on every upsert operation the table size grows
// vacuuming the table does not help, this should be investigated further
function getUpsertOptimization(columns: string[]) {
  return columns
    .filter((column) => column !== 'id')
    .map((column) => `indexer_configurations.${column} <> EXCLUDED.${column}`)
    .join(' OR ')
}
