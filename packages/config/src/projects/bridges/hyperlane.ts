import {
    EthereumAddress,
    ProjectId,
    UnixTime,
    formatSeconds,
  } from '@l2beat/shared-pure'
  import { utils } from 'ethers'
  
  import { NUGGETS } from '../../common'
  import { ProjectDiscovery } from '../../discovery/ProjectDiscovery'
  import { RISK_VIEW } from './common'
  import { Bridge } from './types'
  
  const PROJECT_ID = ProjectId('hyperlane')
  const discovery = new ProjectDiscovery(PROJECT_ID.toString())

  
  export const hyperlane: Bridge = {
    type: 'bridge',
    id: PROJECT_ID,
    createdAt: new UnixTime(1733828344), // 2024-12-10T10:59:22Z
    display: {
      name: 'Hyperlane',
      slug: 'hyperlane',
      warning:
      'The security parameters of each Token Router and non-default ISM module must be individually assessed, and can be changed by their developers.',
      category: 'Token Bridge',
      links: {
        websites: ['https://hyperlane.xyz/'],
        apps: [''], // it's just a framework
        repositories: ['https://github.com/hyperlane-xyz'],
        documentation: ['https://docs.hyperlane.xyz/'],
        socialMedia: [
        ],
      },
      description:
        'Hyperlane is an interoperability protocol for cross-chain communication. It facilitates token bridging between chains through the Hyperchain message passing infrastructure.',
      detailedDescription:
        `It allows developers to create interchain token bridges by deploying Hyperlane Warp Route contracts and leveraging the Hyperlane Mailbox infrastructure deployed to each chain.
        Hyperlane deployments can be configured with a custom Interchain Security Module (ISM), which specifies the security model to use. If no custom ISM is configured, the default ISM module will be used.
        `,
    },
    config: {
      escrows: [],
    },
    riskView: {
      validatedBy: {
        value: 'Optimistically',
        description: `.`,
        sentiment: 'warning',
      },
      sourceUpgradeability: RISK_VIEW.UPGRADABLE_NO,
      destinationToken: RISK_VIEW.CANONICAL,
    },
    technology: {
      destination: [
        'Optimism',
        'Polygon',
        'Boba',
        'Arbitrum',
        'ZkSync Era',
        'Linea',
        'Base',
        // add more
      ],
      principleOfOperation: {
        name: 'Principle of operation',
        description: `.`,
        references: [
        ],
        risks: [
        ],
      },
      validation: {
        name: 'Validation via ISMs.',
        description:
          '.',
        risks: [
        ],
        references: [
        ],
      },
      destinationToken: {
        name: 'Destination tokens',
        description:
          '',
        references: [],
        risks: [],
      },
    },
    contracts: {
      addresses: [
      ],
      risks: [
      ],
    },
    permissions: [
    ],
    knowledgeNuggets: [
    ],
  }
  