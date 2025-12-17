import React, { useState } from 'react';
import { Card, SectionHeader, Badge, InsightBox, DataTable, TableRow, TableCell } from './components/UI';
import { HOURLY_STATS, RANGE_STATS, TIMING_STATS, CORRELATION_STATS, FVG_STATS, SWEEP_STATS_10YR } from './data';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, ComposedChart } from 'recharts';

enum Tab {
  OVERVIEW = 'Overview',
  HOURLY = 'Hourly Stats',
  CORRELATION = '15-Min Correlation',
  FVG = 'FVG Analysis',
  SWEEP = 'Sweep Analysis',
}

const Navbar: React.FC<{ activeTab: Tab; onTabChange: (tab: Tab) => void }> = ({ activeTab, onTabChange }) => (
  <nav className="bg-slate-950/80 backdrop-blur-md text-white sticky top-0 z-50 border-b border-slate-800">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between h-16">
        <div className="flex items-center">
          <div className="flex-shrink-0 font-mono font-bold text-xl text-white tracking-wider">
            PROF<span className="text-green-500">GREENSTATS</span>
          </div>
          <div className="hidden md:block">
            <div className="ml-10 flex items-baseline space-x-2">
              {Object.values(Tab).map((tab) => (
                <button
                  key={tab}
                  onClick={() => onTabChange(tab)}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                    activeTab === tab
                      ? 'bg-slate-800 text-green-400 border border-slate-700 shadow-sm'
                      : 'text-slate-400 hover:bg-slate-900 hover:text-white'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
    {/* Mobile menu */}
    <div className="md:hidden border-t border-slate-800 bg-slate-950 overflow-x-auto whitespace-nowrap scrollbar-hide">
       <div className="px-2 pt-2 pb-3 space-x-2 flex">
        {Object.values(Tab).map((tab) => (
            <button
              key={tab}
              onClick={() => onTabChange(tab)}
              className={`block px-3 py-2 rounded-md text-base font-medium ${
                activeTab === tab ? 'bg-slate-800 text-green-400' : 'text-slate-400 hover:bg-slate-900 hover:text-white'
              }`}
            >
              {tab}
            </button>
          ))}
       </div>
    </div>
  </nav>
);

const OverviewView: React.FC = () => (
  <div className="space-y-8 animate-fade-in">
    <SectionHeader title="Analysis Overview" subtitle="Statistical Analysis of Hourly Price Behavior on Nasdaq Futures (NQ)" />
    
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Card title="Scope & Methodology">
        <p className="text-slate-400 mb-4 leading-relaxed">
          This analysis examines over 10 years of NQ (Nasdaq 100 E-mini futures) 1-minute data, resampled to 3-minute bars. 
          The trading day is defined from 18:00 ET (previous day) through 17:00 ET (current day).
        </p>
        <div className="space-y-3">
            <div className="flex items-start">
                <div className="bg-slate-800 p-1.5 rounded mr-3 mt-1"><svg className="w-4 h-4 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg></div>
                <div>
                    <span className="font-semibold text-slate-200 block">Instrument</span>
                    <span className="text-slate-500 text-sm">NQ (Nasdaq 100 E-mini Futures)</span>
                </div>
            </div>
             <div className="flex items-start">
                <div className="bg-slate-800 p-1.5 rounded mr-3 mt-1"><svg className="w-4 h-4 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg></div>
                <div>
                    <span className="font-semibold text-slate-200 block">Date Range</span>
                    <span className="text-slate-500 text-sm">2013 - 2025</span>
                </div>
            </div>
             <div className="flex items-start">
                <div className="bg-slate-800 p-1.5 rounded mr-3 mt-1"><svg className="w-4 h-4 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg></div>
                <div>
                    <span className="font-semibold text-slate-200 block">Sample Size</span>
                    <span className="text-slate-500 text-sm">~2,400-2,500 observations per hour</span>
                </div>
            </div>
        </div>
      </Card>

      <Card title="Key Definitions">
        <dl className="space-y-4">
          <div>
            <dt className="text-sm font-bold text-slate-200">BISI (Buy-Side Imbalance)</dt>
            <dd className="text-sm text-slate-400">A bullish Fair Value Gap where Candle 3's low &gt; Candle 1's high.</dd>
          </div>
          <div>
            <dt className="text-sm font-bold text-slate-200">SIBI (Sell-Side Imbalance)</dt>
            <dd className="text-sm text-slate-400">A bearish Fair Value Gap where Candle 3's high &lt; Candle 1's low.</dd>
          </div>
          <div>
            <dt className="text-sm font-bold text-slate-200">FPFVG (First Presented FVG)</dt>
            <dd className="text-sm text-slate-400">The very first FVG (BISI or SIBI) that forms within the hourly candle.</dd>
          </div>
          <div>
            <dt className="text-sm font-bold text-slate-200">Sweep</dt>
            <dd className="text-sm text-slate-400">Price breaking above a previous high or below a previous low.</dd>
          </div>
        </dl>
      </Card>
    </div>

    <Card title="Executive Summary">
        <ul className="list-disc pl-5 space-y-2 text-slate-300">
            <li><strong>4 PM (16:00)</strong> is a critical pivot hour with <strong>85.9%</strong> bullish continuation from the first 15 minutes.</li>
            <li><strong>9 AM (09:00)</strong> shows the weakest predictive correlation due to RTH open volatility.</li>
            <li><strong>11 AM</strong> exhibits the strongest innate bullish bias (+11.9% Bull-Bear Delta).</li>
            <li>Price trades through the <strong>FPFVG</strong> in <strong>96-99%</strong> of hours, suggesting it acts as a magnet before a potential reversal or continuation.</li>
            <li>Sweep strategies perform best during the <strong>08:00 - 10:00 EST</strong> window (London-US overlap).</li>
        </ul>
    </Card>
  </div>
);

const HourlyView: React.FC = () => (
  <div className="space-y-8 animate-fade-in">
    <SectionHeader title="Hourly Direction & Range" subtitle="Base rates for direction and volatility analysis per hour." />

    <InsightBox title="Key Findings">
        <p>• <strong>11 AM</strong> shows the strongest bullish bias (55.7% Bullish vs 43.8% Bearish).</p>
        <p>• <strong>4 PM</strong> is exceptionally directional with a +16.7% Bullish delta.</p>
        <p>• Volatility peaks at <strong>9 AM & 10 AM</strong>.</p>
    </InsightBox>

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
         <Card title="Bullish vs Bearish Delta">
             <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={HOURLY_STATS}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" />
                    <XAxis dataKey="hour" fontSize={10} interval={0} angle={-45} textAnchor="end" height={50} tick={{fill: '#94a3b8'}} />
                    <YAxis tick={{fill: '#94a3b8'}} />
                    <Tooltip contentStyle={{backgroundColor: '#1e293b', borderColor: '#334155', color: '#f1f5f9'}} />
                    <Bar dataKey="delta" fill="#3b82f6" name="Bull Bias %" />
                    </BarChart>
                </ResponsiveContainer>
             </div>
         </Card>
         <Card title="Volatility (Std Dev %)">
             <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={RANGE_STATS}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" />
                    <XAxis dataKey="hour" fontSize={10} tick={{fill: '#94a3b8'}} />
                    <YAxis tick={{fill: '#94a3b8'}} />
                    <Tooltip contentStyle={{backgroundColor: '#1e293b', borderColor: '#334155', color: '#f1f5f9'}} />
                    <Bar dataKey="mean" fill="#64748b" name="Mean Range %" />
                    <Line type="monotone" dataKey="stdDev" stroke="#ef4444" name="Volatility" strokeWidth={2} />
                    </ComposedChart>
                </ResponsiveContainer>
             </div>
         </Card>
    </div>

    <Card title="Hourly Statistics Detail">
      <DataTable headers={['Hour', 'Sample', 'Bullish %', 'Bearish %', 'Neutral %', 'Bull-Bear Δ']}>
        {HOURLY_STATS.map((row, i) => (
          <TableRow key={i} index={i}>
            <TableCell className="font-mono font-medium">{row.hour}</TableCell>
            <TableCell>{row.sample.toLocaleString()}</TableCell>
            <TableCell><span className="text-emerald-400 font-medium">{row.bullishPct}%</span></TableCell>
            <TableCell><span className="text-rose-400 font-medium">{row.bearishPct}%</span></TableCell>
            <TableCell>{row.neutralPct}%</TableCell>
            <TableCell>
                <Badge type={row.delta > 5 ? 'success' : row.delta > 0 ? 'info' : 'neutral'}>
                    +{row.delta}%
                </Badge>
            </TableCell>
          </TableRow>
        ))}
      </DataTable>
    </Card>

    <div className="mt-8">
        <h3 className="text-xl font-bold text-slate-100 mb-4">High/Low Formation Timing</h3>
        <DataTable headers={['Hour', 'High 0-15m', 'High 15-30m', 'High 30-45m', 'High 45-60m', 'Low 0-15m', 'Low 45-60m']}>
            {TIMING_STATS.map((row, i) => (
                <TableRow key={i} index={i}>
                    <TableCell className="font-bold">{row.hour}</TableCell>
                    <TableCell className={row.high0_15 > 30 ? 'bg-blue-900/30 font-semibold text-blue-200' : ''}>{row.high0_15}%</TableCell>
                    <TableCell>{row.high15_30}%</TableCell>
                    <TableCell>{row.high30_45}%</TableCell>
                    <TableCell>{row.high45_60}%</TableCell>
                    <TableCell className={row.low0_15 > 30 ? 'bg-blue-900/30 font-semibold text-blue-200' : ''}>{row.low0_15}%</TableCell>
                    <TableCell>{row.low45_60}%</TableCell>
                </TableRow>
            ))}
        </DataTable>
        <p className="text-xs text-slate-500 mt-2">* Selected hours shown. 9 AM High/Low forms late (after RTH open). 4 PM forms very early.</p>
    </div>
  </div>
);

const CorrelationView: React.FC = () => (
  <div className="space-y-8 animate-fade-in">
    <SectionHeader title="First 15-Min Correlation" subtitle="Probability that the hourly candle closes in the same direction as the first 15 minutes." />

    <InsightBox title="Trading Strategy Implication">
        <p>• <strong>4 PM</strong> is the "Golden Hour" for continuation strategies. If the first 15m is Bullish, the hour closes Bullish <strong>85.9%</strong> of the time.</p>
        <p>• <strong>9 AM</strong> is dangerous for continuation. It has the lowest correlation (56.2%), meaning early moves are often fake-outs.</p>
    </InsightBox>

    <Card title="Continuation Probability">
       <DataTable headers={['Hour', 'Bull Continuation', 'Bear Continuation', 'Sample (Bull/Bear)', 'Avg Continuation']}>
          {CORRELATION_STATS.map((row, i) => (
              <TableRow key={i} index={i}>
                  <TableCell className="font-bold">{row.hour}</TableCell>
                  <TableCell>
                      <div className="flex items-center">
                        <div className="w-16 bg-slate-700 rounded-full h-2 mr-2 overflow-hidden">
                            <div className="bg-emerald-500 h-2" style={{ width: `${row.bullContinuation}%` }}></div>
                        </div>
                        {row.bullContinuation}%
                      </div>
                  </TableCell>
                   <TableCell>
                      <div className="flex items-center">
                        <div className="w-16 bg-slate-700 rounded-full h-2 mr-2 overflow-hidden">
                            <div className="bg-rose-500 h-2" style={{ width: `${row.bearContinuation}%` }}></div>
                        </div>
                        {row.bearContinuation}%
                      </div>
                  </TableCell>
                  <TableCell>{row.sampleBull}</TableCell>
                  <TableCell className="font-bold">{row.avgContinuation}%</TableCell>
              </TableRow>
          ))}
       </DataTable>
    </Card>
  </div>
);

const FVGView: React.FC = () => (
  <div className="space-y-8 animate-fade-in">
    <SectionHeader title="FPFVG Analysis" subtitle="Predictive value of the First Presented Fair Value Gap." />

    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <Card className="md:col-span-2">
            <h3 className="font-bold text-lg mb-2 text-slate-100">The Setup</h3>
            <p className="text-slate-400 mb-4">
                The <strong>FPFVG</strong> (First Presented Fair Value Gap) sets the tone.
                The data shows that price almost always trades <em>through</em> the FVG (96-99%), but the 
                direction of the FVG correctly predicts the hourly close <strong>60-80%</strong> of the time.
            </p>
            <div className="grid grid-cols-2 gap-4">
                 <div className="bg-emerald-950/40 p-4 rounded border border-emerald-900">
                    <span className="block font-bold text-emerald-400">BISI Bias</span>
                    <span className="text-sm text-emerald-300/80">When a Bullish FVG forms first, probability favors a bullish close.</span>
                 </div>
                 <div className="bg-rose-950/40 p-4 rounded border border-rose-900">
                    <span className="block font-bold text-rose-400">SIBI Bias</span>
                    <span className="text-sm text-rose-300/80">When a Bearish FVG forms first, probability favors a bearish close.</span>
                 </div>
            </div>
        </Card>
        <Card title="4 PM Anomaly">
            <div className="text-center py-4">
                <div className="text-4xl font-bold text-primary-500 mb-2">80.4%</div>
                <div className="text-sm text-slate-500 uppercase tracking-wide">Accuracy</div>
                <p className="mt-4 text-sm text-slate-400">
                    At 4 PM, if a BISI forms, the hour closes Bullish 80.4% of the time.
                </p>
            </div>
        </Card>
    </div>

    <Card title="FVG Distribution (BISI vs SIBI)">
        <DataTable headers={['Hour', 'BISI % (Bull FVG)', 'SIBI % (Bear FVG)', 'BISI Count', 'SIBI Count']}>
            {FVG_STATS.map((row, i) => (
                <TableRow key={i} index={i}>
                    <TableCell className="font-bold">{row.hour}</TableCell>
                    <TableCell><span className="text-emerald-400 font-medium">{row.bisiPct}%</span></TableCell>
                    <TableCell><span className="text-rose-400 font-medium">{row.sibiPct}%</span></TableCell>
                    <TableCell>{row.bisiCount.toLocaleString()}</TableCell>
                    <TableCell>{row.sibiCount.toLocaleString()}</TableCell>
                </TableRow>
            ))}
        </DataTable>
    </Card>
  </div>
);

const SweepView: React.FC = () => (
  <div className="space-y-8 animate-fade-in">
    <SectionHeader title="Hourly Sweep Analysis" subtitle="Retracement probabilities after breaking hourly highs/lows." />

    <InsightBox title="Peak Performance Window">
        <p>• <strong>08:00 - 10:00 EST</strong> shows the highest sweep and retracement rates.</p>
        <p>• Retracements to the 50% level occur <strong>80%+</strong> of the time during this window.</p>
        <p>• Tuesdays and Mondays are the best performing days (87%+ sweep rate).</p>
    </InsightBox>

    <Card title="10-Year Sweep Statistics (Selected Hours)">
        <DataTable headers={['Hour', 'High Sweep %', 'Low Sweep %', 'High -> Prev Open', 'Low -> Prev Open', 'High -> 50%', 'Low -> 50%']}>
             {SWEEP_STATS_10YR.map((row, i) => (
                <TableRow key={i} index={i}>
                    <TableCell className="font-mono font-bold">{row.hour}</TableCell>
                    <TableCell>{row.highSweep}%</TableCell>
                    <TableCell>{row.lowSweep}%</TableCell>
                    <TableCell className="bg-slate-800/50">{row.highRetraceOpen}%</TableCell>
                    <TableCell className="bg-slate-800/50">{row.lowRetraceOpen}%</TableCell>
                    <TableCell className={row.highRetrace50 > 75 ? 'bg-emerald-900/30 font-bold text-emerald-400' : ''}>{row.highRetrace50}%</TableCell>
                    <TableCell className={row.lowRetrace50 > 75 ? 'bg-emerald-900/30 font-bold text-emerald-400' : ''}>{row.lowRetrace50}%</TableCell>
                </TableRow>
            ))}
        </DataTable>
    </Card>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card title="Context: Reference Levels">
            <ul className="space-y-3">
                <li className="flex justify-between items-center border-b border-slate-800 pb-2">
                    <span className="text-slate-400">Above London High</span>
                    <Badge type="success">Strong High Bias (+33%)</Badge>
                </li>
                 <li className="flex justify-between items-center border-b border-slate-800 pb-2">
                    <span className="text-slate-400">Above Prev Day High</span>
                    <Badge type="success">Strong High Bias (+24.5%)</Badge>
                </li>
                 <li className="flex justify-between items-center border-b border-slate-800 pb-2">
                    <span className="text-slate-400">Below London Low</span>
                    <Badge type="danger">Strong Low Bias (-23.4%)</Badge>
                </li>
            </ul>
        </Card>
        <Card title="Full Retracement (Reversals)">
            <p className="text-sm text-slate-500 mb-4">Complete reversals where a high sweep retraces all the way to the previous low (or vice versa).</p>
            <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-3 bg-slate-800 rounded">
                    <div className="text-2xl font-bold text-slate-200">19.1%</div>
                    <div className="text-xs text-slate-500">High Sweep Reversal</div>
                </div>
                <div className="p-3 bg-slate-800 rounded">
                    <div className="text-2xl font-bold text-slate-200">21.6%</div>
                    <div className="text-xs text-slate-500">Low Sweep Reversal</div>
                </div>
                <div className="p-3 bg-blue-900/20 rounded border border-blue-900/50">
                    <div className="text-2xl font-bold text-blue-400">4.9:1</div>
                    <div className="text-xs text-blue-500">Risk/Reward</div>
                </div>
            </div>
        </Card>
    </div>
  </div>
);

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>(Tab.OVERVIEW);

  return (
    <div className="min-h-screen bg-slate-950">
      <Navbar activeTab={activeTab} onTabChange={setActiveTab} />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === Tab.OVERVIEW && <OverviewView />}
        {activeTab === Tab.HOURLY && <HourlyView />}
        {activeTab === Tab.CORRELATION && <CorrelationView />}
        {activeTab === Tab.FVG && <FVGView />}
        {activeTab === Tab.SWEEP && <SweepView />}
      </main>

      <footer className="bg-slate-950 border-t border-slate-900 mt-12 py-8">
          <div className="max-w-7xl mx-auto px-4 text-center text-slate-600 text-sm">
            <p>&copy; 2025 ProfGreenStats. Data sourced from 15-year 1-minute historical bars.</p>
          </div>
      </footer>
    </div>
  );
};

export default App;
