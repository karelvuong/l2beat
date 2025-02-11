import { Logger, RateLimiter } from '@l2beat/backend-tools'
import { json } from '@l2beat/shared-pure'
import { RequestInit } from 'node-fetch'
import { RetryHandler, RetryHandlerVariant } from '../tools'
import { HttpClient2 } from './http/HttpClient2'

export interface ClientCoreDependencies {
  http: HttpClient2
  logger: Logger
  sourceName: string
  callsPerMinute: number
  retryStrategy: RetryHandlerVariant
}

export abstract class ClientCore {
  private rateLimiter: RateLimiter
  private retryHandler: RetryHandler
  private logger: Logger

  constructor(private readonly deps: ClientCoreDependencies) {
    this.logger = deps.logger.for(this).tag({ source: deps.sourceName })
    this.retryHandler = RetryHandler.create(deps.retryStrategy, this.logger)
    this.rateLimiter = new RateLimiter({ callsPerMinute: deps.callsPerMinute })
  }

  /**
   * This method will perform HTTP fetch, and validate the response.
   * Rate limiting and retry handling are built-in.
   *
   * @param url Address to which the request will be sent
   * @param init Params for the request. We are using `node-fetch` RequestInit type
   * @returns Parsed JSON object
   */
  async fetch(url: string, init: RequestInit): Promise<json> {
    try {
      return await this.rateLimiter.call(() => this._fetch(url, init))
    } catch {
      return await this.retryHandler.retry(() =>
        this.rateLimiter.call(() => this._fetch(url, init)),
      )
    }
  }

  private async _fetch(url: string, init: RequestInit): Promise<json> {
    this.logger.info('Fetching')
    const response = await this.deps.http.fetch(url, init)

    const validationInfo = this.validateResponse(response)

    if (!validationInfo.success) {
      throw new Error(validationInfo.message ?? 'Response validation failed')
    }

    return response
  }

  /** This method should return false when there are errors in the response, true otherwise */
  abstract validateResponse(response: json): {
    success: boolean
    message?: string
  }
}
