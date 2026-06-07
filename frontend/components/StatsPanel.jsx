'use client';

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

function ms(val) {
  if (!val) return '—';
  if (val < 1000) return `${val}ms`;
  if (val < 60000) return `${(val / 1000).toFixed(1)}s`;
  return `${(val / 60000).toFixed(1)}m`;
}

export default function StatsPanel({ stats }) {
  if (!stats) {
    return (
      <div className="grid grid-cols-2 gap-3">
        {[0,1,2,3].map(i => (
          <div key={i} className="h-24 rounded-xl animate-pulse" style={{ background: '#1A1035' }} />
        ))}
      </div>
    );
  }

  const { summary, chart } = stats;
  const successRate = summary.total > 0 ? Math.round((summary.deployed / summary.total) * 100) : 0;

  const pieData = [
    { name: 'Deployed', value: summary.deployed, color: '#34D399' },
    { name: 'Failed',   value: summary.failed,   color: '#F87171' },
    { name: 'Active',   value: summary.active,   color: '#FBBF24' },
  ].filter(d => d.value > 0);

  const last14 = [...Array(14)].map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    const day = d.toISOString().split('T')[0];
    const found = chart.find(c => c.day === day);
    return found ?? { day, total: 0, deployed: 0, failed: 0 };
  });

  const fmtDay = (d) => {
    const date = new Date(d + 'T00:00:00');
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="grid grid-cols-4 gap-3">
      {/* Metric cards */}
      {[
        { label: 'Total Runs',      value: summary.total,            color: '#8B5CF6', sub: `${summary.today} today` },
        { label: 'Success Rate',    value: `${successRate}%`,        color: '#34D399', sub: `${summary.deployed} deployed` },
        { label: 'Failed',          value: summary.failed,           color: '#F87171', sub: 'all time' },
        { label: 'Avg Deploy Time', value: ms(summary.avg_duration_ms), color: '#60A5FA', sub: 'deployed only' },
      ].map(({ label, value, color, sub }) => (
        <div key={label} className="rounded-xl p-4 flex flex-col gap-1"
          style={{ background: '#1A1035', border: '1px solid #2D1F4E' }}>
          <p className="text-xs" style={{ color: '#9B89C4' }}>{label}</p>
          <p className="text-2xl font-bold" style={{ color }}>{value}</p>
          <p className="text-xs" style={{ color: '#6B5A8E' }}>{sub}</p>
        </div>
      ))}

      {/* Area chart */}
      <div className="col-span-3 rounded-xl p-4" style={{ background: '#1A1035', border: '1px solid #2D1F4E' }}>
        <p className="text-xs font-semibold mb-3" style={{ color: '#9B89C4' }}>DEPLOYMENT ACTIVITY — LAST 14 DAYS</p>
        <ResponsiveContainer width="100%" height={100}>
          <AreaChart data={last14} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
            <defs>
              <linearGradient id="grad-ok" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#34D399" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#34D399" stopOpacity={0}   />
              </linearGradient>
              <linearGradient id="grad-fail" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#F87171" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#F87171" stopOpacity={0}   />
              </linearGradient>
            </defs>
            <XAxis dataKey="day" tickFormatter={fmtDay} tick={{ fontSize: 10, fill: '#6B5A8E' }} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#6B5A8E' }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: '#120C2A', border: '1px solid #2D1F4E', borderRadius: 8, fontSize: 12 }}
              labelFormatter={fmtDay}
            />
            <Area type="monotone" dataKey="deployed" stroke="#34D399" strokeWidth={2} fill="url(#grad-ok)"   name="Deployed" />
            <Area type="monotone" dataKey="failed"   stroke="#F87171" strokeWidth={2} fill="url(#grad-fail)" name="Failed"   />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Pie chart */}
      <div className="rounded-xl p-4 flex flex-col items-center justify-center"
        style={{ background: '#1A1035', border: '1px solid #2D1F4E' }}>
        <p className="text-xs font-semibold mb-2" style={{ color: '#9B89C4' }}>OUTCOME SPLIT</p>
        {summary.total === 0 ? (
          <p className="text-xs" style={{ color: '#4B3A6A' }}>No data yet</p>
        ) : (
          <>
            <PieChart width={90} height={90}>
              <Pie data={pieData} cx={40} cy={40} innerRadius={25} outerRadius={40} paddingAngle={2} dataKey="value">
                {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
            </PieChart>
            <div className="flex flex-col gap-1 mt-1">
              {pieData.map(d => (
                <div key={d.name} className="flex items-center gap-1.5 text-xs">
                  <div className="w-2 h-2 rounded-full" style={{ background: d.color }} />
                  <span style={{ color: '#9B89C4' }}>{d.name}: {d.value}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
