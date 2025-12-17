import { HourlyStat, RangeStat, TimingStat, CorrelationStat, FVGStat, SweepStat } from './types';

export const HOURLY_STATS: HourlyStat[] = [
  { hour: '12 AM', sample: 2483, bullishPct: 49.9, bearishPct: 46.8, neutralPct: 3.2, delta: 3.1 },
  { hour: '1 AM', sample: 2482, bullishPct: 50.4, bearishPct: 46.6, neutralPct: 3.0, delta: 3.8 },
  { hour: '2 AM', sample: 2482, bullishPct: 50.9, bearishPct: 46.9, neutralPct: 2.3, delta: 4.0 },
  { hour: '3 AM', sample: 2483, bullishPct: 51.5, bearishPct: 47.0, neutralPct: 1.5, delta: 4.5 },
  { hour: '4 AM', sample: 2483, bullishPct: 50.0, bearishPct: 48.7, neutralPct: 1.3, delta: 1.3 },
  { hour: '5 AM', sample: 2482, bullishPct: 50.3, bearishPct: 47.7, neutralPct: 2.0, delta: 2.6 },
  { hour: '6 AM', sample: 2486, bullishPct: 50.8, bearishPct: 47.1, neutralPct: 2.1, delta: 3.7 },
  { hour: '7 AM', sample: 2486, bullishPct: 52.5, bearishPct: 45.9, neutralPct: 1.6, delta: 6.6 },
  { hour: '8 AM', sample: 2485, bullishPct: 50.2, bearishPct: 48.3, neutralPct: 1.5, delta: 1.9 },
  { hour: '9 AM', sample: 2486, bullishPct: 52.6, bearishPct: 47.1, neutralPct: 0.3, delta: 5.5 },
  { hour: '10 AM', sample: 2484, bullishPct: 51.6, bearishPct: 48.0, neutralPct: 0.4, delta: 3.6 },
  { hour: '11 AM', sample: 2483, bullishPct: 55.7, bearishPct: 43.8, neutralPct: 0.5, delta: 11.9 },
  { hour: '12 PM', sample: 2483, bullishPct: 52.6, bearishPct: 46.5, neutralPct: 0.9, delta: 6.1 },
  { hour: '1 PM', sample: 2417, bullishPct: 53.3, bearishPct: 45.7, neutralPct: 1.0, delta: 7.6 },
  { hour: '2 PM', sample: 2411, bullishPct: 53.3, bearishPct: 45.8, neutralPct: 0.8, delta: 7.5 },
  { hour: '3 PM', sample: 2411, bullishPct: 50.4, bearishPct: 48.8, neutralPct: 0.8, delta: 1.6 },
  { hour: '4 PM', sample: 2411, bullishPct: 57.8, bearishPct: 41.1, neutralPct: 1.0, delta: 16.7 },
  { hour: '5 PM', sample: 529, bullishPct: 51.8, bearishPct: 41.4, neutralPct: 6.8, delta: 10.4 },
];

export const RANGE_STATS: RangeStat[] = [
  { hour: '12 AM', mean: 0.132, median: 0.094, stdDev: 0.121, rank: 'Low' },
  { hour: '1 AM', mean: 0.166, median: 0.127, stdDev: 0.215, rank: 'Low' },
  { hour: '2 AM', mean: 0.200, median: 0.165, stdDev: 0.142, rank: 'Low-Med' },
  { hour: '8 AM', mean: 0.364, median: 0.271, stdDev: 0.300, rank: 'High' },
  { hour: '9 AM', mean: 0.581, median: 0.532, stdDev: 0.295, rank: 'Very High' },
  { hour: '10 AM', mean: 0.627, median: 0.549, stdDev: 0.322, rank: 'Very High' },
  { hour: '11 AM', mean: 0.467, median: 0.401, stdDev: 0.256, rank: 'High' },
  { hour: '4 PM', mean: 0.296, median: 0.190, stdDev: 0.275, rank: 'Medium' },
];

export const TIMING_STATS: TimingStat[] = [
  { hour: '9 AM', high0_15: 14.6, high15_30: 6.6, high30_45: 37.7, high45_60: 41.2, low0_15: 15.4, low15_30: 7.0, low30_45: 38.8, low45_60: 38.8 },
  { hour: '10 AM', high0_15: 37.7, high15_30: 14.6, high30_45: 17.6, high45_60: 30.1, low0_15: 43.2, low15_30: 15.4, low30_45: 15.8, low45_60: 25.6 },
  { hour: '11 AM', high0_15: 32.9, high15_30: 18.2, high30_45: 18.4, high45_60: 30.5, low0_15: 42.8, low15_30: 16.2, low30_45: 16.4, low45_60: 24.7 },
  { hour: '4 PM', high0_15: 60.7, high15_30: 3.0, high30_45: 13.9, high45_60: 22.5, low0_15: 73.1, low15_30: 3.4, low30_45: 10.4, low45_60: 13.2 },
];

export const CORRELATION_STATS: CorrelationStat[] = [
  { hour: '9 AM', bullContinuation: 59.0, bearContinuation: 53.3, sampleBull: '1,235 / 1,196', avgContinuation: 56.2 },
  { hour: '10 AM', bullContinuation: 73.8, bearContinuation: 71.2, sampleBull: '1,255 / 1,196', avgContinuation: 72.5 },
  { hour: '11 AM', bullContinuation: 74.2, bearContinuation: 66.7, sampleBull: '1,360 / 1,088', avgContinuation: 70.5 },
  { hour: '12 PM', bullContinuation: 73.0, bearContinuation: 67.1, sampleBull: '1,240 / 1,201', avgContinuation: 70.1 },
  { hour: '4 PM', bullContinuation: 85.9, bearContinuation: 76.0, sampleBull: '1,303 / 1,052', avgContinuation: 81.0 },
  { hour: '5 PM', bullContinuation: 100.0, bearContinuation: 100.0, sampleBull: '274 / 219', avgContinuation: 100.0 },
];

export const FVG_STATS: FVGStat[] = [
  { hour: '9 AM', bisiPct: 51.1, sibiPct: 48.9, bisiCount: 1247, sibiCount: 1193 },
  { hour: '10 AM', bisiPct: 51.4, sibiPct: 48.6, bisiCount: 1254, sibiCount: 1186 },
  { hour: '11 AM', bisiPct: 54.2, sibiPct: 45.8, bisiCount: 1315, sibiCount: 1111 },
  { hour: '4 PM', bisiPct: 54.6, sibiPct: 45.4, bisiCount: 1230, sibiCount: 1024 },
];

export const SWEEP_STATS_10YR: SweepStat[] = [
  { hour: '06-07', highSweep: 51.0, lowSweep: 42.6, highRetraceOpen: 55.6, lowRetraceOpen: 58.3, highRetrace50: 63.6, lowRetrace50: 71.9 },
  { hour: '07-08', highSweep: 53.4, lowSweep: 49.5, highRetraceOpen: 59.5, lowRetraceOpen: 62.9, highRetrace50: 71.3, lowRetrace50: 73.2 },
  { hour: '08-09', highSweep: 60.3, lowSweep: 60.1, highRetraceOpen: 70.9, lowRetraceOpen: 71.0, highRetrace50: 79.7, lowRetrace50: 82.4 },
  { hour: '09-10', highSweep: 63.8, lowSweep: 58.6, highRetraceOpen: 71.8, lowRetraceOpen: 72.3, highRetrace50: 80.5, lowRetrace50: 81.6 },
  { hour: '10-11', highSweep: 49.7, lowSweep: 43.3, highRetraceOpen: 47.1, lowRetraceOpen: 49.1, highRetrace50: 55.4, lowRetrace50: 61.5 },
];
