export interface HourlyStat {
  hour: string;
  sample: number;
  bullishPct: number;
  bearishPct: number;
  neutralPct: number;
  delta: number;
}

export interface RangeStat {
  hour: string;
  mean: number;
  median: number;
  stdDev: number;
  rank: 'Low' | 'Low-Med' | 'Medium' | 'High' | 'Very High' | 'Very Low';
}

export interface TimingStat {
  hour: string;
  high0_15: number;
  high15_30: number;
  high30_45: number;
  high45_60: number;
  low0_15: number;
  low15_30: number;
  low30_45: number;
  low45_60: number;
}

export interface CorrelationStat {
  hour: string;
  bullContinuation: number;
  bearContinuation: number;
  sampleBull: string;
  avgContinuation: number;
}

export interface FVGStat {
  hour: string;
  bisiPct: number;
  sibiPct: number;
  bisiCount: number;
  sibiCount: number;
}

export interface SweepStat {
  hour: string;
  highSweep: number;
  lowSweep: number;
  highRetraceOpen: number;
  lowRetraceOpen: number;
  highRetrace50: number;
  lowRetrace50: number;
}
