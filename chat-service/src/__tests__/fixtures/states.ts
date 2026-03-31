import type { ClosingDeadlines, OfferContingencies } from '../../types'

export interface StateFixture {
  code: string
  name: string
  listingAddress: string
  agentEmail: string
  agentName: string
  offerPrice: number
  earnestMoney: number
  closingDate: string
  contingencies: OfferContingencies
  closingDeadlines: ClosingDeadlines
  optionFee?: number
  optionPeriodDays?: number
}

export const STATE_FIXTURES: StateFixture[] = [
  {
    code: 'CO',
    name: 'Colorado',
    listingAddress: '123 Pearl St, Boulder, CO 80302',
    agentEmail: 'agent.co@example.com',
    agentName: 'Sarah Colorado',
    offerPrice: 650_000,
    earnestMoney: 13_000,
    closingDate: '2026-05-15',
    contingencies: { inspection: true, inspectionPeriodDays: 10, appraisal: true, financing: true },
    closingDeadlines: {
      inspectionObjectionDeadline: '2026-04-11',
      inspectionResolutionDeadline: '2026-04-14',
      titleObjectionDeadline: '2026-04-21',
      appraisalDeadline: '2026-04-28',
      closingDate: '2026-05-15',
    },
  },
  {
    code: 'TX',
    name: 'Texas',
    listingAddress: '456 Congress Ave, Austin, TX 78701',
    agentEmail: 'agent.tx@example.com',
    agentName: 'Bob Texas',
    offerPrice: 550_000,
    earnestMoney: 5_500,
    closingDate: '2026-05-20',
    contingencies: { inspection: false, appraisal: true, financing: true },
    optionFee: 250,
    optionPeriodDays: 7,
    closingDeadlines: {
      optionPeriodDeadline: '2026-04-08',
      surveyDeadline: '2026-05-10',
      closingDate: '2026-05-20',
    },
  },
  {
    code: 'AZ',
    name: 'Arizona',
    listingAddress: '789 Camelback Rd, Phoenix, AZ 85018',
    agentEmail: 'agent.az@example.com',
    agentName: 'Carol Arizona',
    offerPrice: 480_000,
    earnestMoney: 5_000,
    closingDate: '2026-05-25',
    contingencies: { inspection: true, inspectionPeriodDays: 10, appraisal: true, financing: true },
    closingDeadlines: {
      inspectionPeriodDeadline: '2026-04-11',
      binsrResponseDeadline: '2026-04-16',
      closingDate: '2026-05-25',
    },
  },
  {
    code: 'NV',
    name: 'Nevada',
    listingAddress: '101 Desert Rose Blvd, Henderson, NV 89002',
    agentEmail: 'agent.nv@example.com',
    agentName: 'Dave Nevada',
    offerPrice: 420_000,
    earnestMoney: 5_000,
    closingDate: '2026-05-30',
    contingencies: { inspection: true, inspectionPeriodDays: 10, appraisal: true, financing: true },
    closingDeadlines: {
      dueDiligenceDeadline: '2026-04-11',
      closingDate: '2026-05-30',
    },
  },
  {
    code: 'UT',
    name: 'Utah',
    listingAddress: '202 Temple Sq Blvd, Salt Lake City, UT 84101',
    agentEmail: 'agent.ut@example.com',
    agentName: 'Eve Utah',
    offerPrice: 500_000,
    earnestMoney: 7_500,
    closingDate: '2026-05-22',
    contingencies: { inspection: true, inspectionPeriodDays: 14, appraisal: true, financing: true },
    closingDeadlines: {
      dueDiligenceDeadline: '2026-04-15',
      closingDate: '2026-05-22',
    },
  },
]
