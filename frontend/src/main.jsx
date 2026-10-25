import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Activity, ArrowDownRight, ArrowUpRight, BarChart3, Check, ChevronDown, Clock3, Download, ExternalLink, Grid2X2, Info, Leaf, LoaderCircle, RefreshCw, Search, ShieldCheck, Wind, Zap } from 'lucide-react';
import './styles.css';

const month = '2026-01';
const n = (v, digits = 0) => Number.isFinite(v) ? v.toLocaleString('en-GB', { maximumFractionDigits: digits }) : '—';
const dateLabel = (value, options = {}) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', ...options }).format(new Date(value));

function Glyph({ small = false }) { return <span className={`brand-glyph ${small ? 'small' : ''}`}><i/><i/><i/><i/></span>; }

function MetricCard({ icon: Icon, label, value, unit, caption, tone = '' }) {
  return <article className="metric-card"><div className="metric-top"><span className="metric-icon"><Icon size={17}/></span><span className="metric-label">{label}</span><span className={`metric-mark ${tone}`}>{tone === 'positive' ? <ArrowDownRight size={15}/> : tone === 'negative' ? <ArrowUpRight size={15}/> : <Activity size={15}/>}</span></div><div className="metric-value">{value}<small>{unit}</small></div><div className="metric-caption">{caption}</div></article>;
}

function DailyChart({ data }) {
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const w = 760, h = 245, pad = { l: 48, r: 18, t: 14, b: 34 };
  const series = data.filter(d => d.forecast != null && d.actual != null);
  if (!series.length) return <div className="chart-empty">No matched intervals available for this period.</div>;
  const vals = series.flatMap(d => [d.forecast, d.actual]);
  const min = Math.min(0, ...vals), max = Math.max(...vals) * 1.08 || 1;
  const x = i => pad.l + (i / Math.max(1, series.length - 1)) * (w - pad.l - pad.r);
  const y = v => pad.t + ((max - v) / (max - min || 1)) * (h - pad.t - pad.b);
  const path = key => series.map((d, i) => `${i ? 'L' : 'M'}${x(i)},${y(d[key])}`).join(' ');
  const area = `${path('forecast')} L${x(series.length - 1)},${h-pad.b} L${x(0)},${h-pad.b} Z`;
  const ticks = [0, .25, .5, .75, 1].map(p => max * p);
  const labelIndex = [0, Math.floor((series.length - 1) / 3), Math.floor((series.length - 1) * 2 / 3), series.length - 1];
  const hovered = hoveredIndex == null ? null : series[hoveredIndex];
  const tooltipWidth = 184, tooltipHeight = 54;
  const tooltipX = hoveredIndex == null ? 0 : Math.min(Math.max(pad.l, x(hoveredIndex) + 10), w - pad.r - tooltipWidth);
  const tooltipY = hoveredIndex == null ? 0 : Math.max(pad.t, Math.min(y(hovered.forecast) - tooltipHeight - 8, h - pad.b - tooltipHeight));
  const hoveredDate = !hovered ? '' : hovered.date.startsWith('Week') ? hovered.date : dateLabel(`${hovered.date}T12:00:00Z`, { day: '2-digit', month: 'short', year: 'numeric' });
  return <svg className="daily-chart" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Daily mean wind forecast and actual generation" onMouseLeave={()=>setHoveredIndex(null)}>
    <defs><linearGradient id="forecastFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#17a995" stopOpacity=".19"/><stop offset="100%" stopColor="#17a995" stopOpacity="0"/></linearGradient></defs>
    {ticks.map((v,i)=><g key={i}><line x1={pad.l} x2={w-pad.r} y1={y(v)} y2={y(v)} stroke="#e9efef"/><text x={pad.l-9} y={y(v)+4} textAnchor="end" className="axis-label">{n(v/1000,0)}k</text></g>)}
    <path d={area} fill="url(#forecastFill)"/><path d={path('forecast')} fill="none" stroke="#0d9d8b" strokeWidth="2.8" strokeLinejoin="round" strokeLinecap="round"/><path d={path('actual')} fill="none" stroke="#435b68" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" strokeDasharray="5 4"/>
    {labelIndex.map((i,k)=><text key={k} x={x(i)} y={h-10} textAnchor={k===0?'start':k===labelIndex.length-1?'end':'middle'} className="axis-label">{series[i]?.date?.startsWith('Week') ? series[i].date.replace('Week ', 'W') : series[i]?.date?.slice(8)}</text>)}
    {hovered && <line x1={x(hoveredIndex)} x2={x(hoveredIndex)} y1={pad.t} y2={h-pad.b} stroke="#9aabad" strokeDasharray="3 4"/>}
    {series.map((d,i)=><g key={d.date}>
      {hoveredIndex===i && <><circle cx={x(i)} cy={y(d.forecast)} r="5" fill="#0d9d8b" stroke="#fff" strokeWidth="2"/><circle cx={x(i)} cy={y(d.actual)} r="5" fill="#435b68" stroke="#fff" strokeWidth="2"/></>}
      <circle className="chart-hit-area" cx={x(i)} cy={(y(d.forecast)+y(d.actual))/2} r="12" fill="transparent" tabIndex="0" aria-label={`${d.date}: forecast ${n(d.forecast)} MW, actual ${n(d.actual)} MW`} onMouseEnter={()=>setHoveredIndex(i)} onFocus={()=>setHoveredIndex(i)} onBlur={()=>setHoveredIndex(null)}/>
    </g>)}
    {hovered && <g className="chart-tooltip" pointerEvents="none"><rect x={tooltipX} y={tooltipY} width={tooltipWidth} height={tooltipHeight} rx="6"/><text x={tooltipX+10} y={tooltipY+16} className="tooltip-date">{hoveredDate}</text><text x={tooltipX+10} y={tooltipY+34} className="tooltip-forecast">Forecast <tspan>{n(hovered.forecast)} MW</tspan></text><text x={tooltipX+98} y={tooltipY+34} className="tooltip-actual">Actual <tspan>{n(hovered.actual)} MW</tspan></text></g>}
  </svg>;
}

function ErrorChart({ intervals }) {
  const [hoveredBin, setHoveredBin] = useState(null);
  const values = intervals.map(x => x.error).filter(Number.isFinite);
  if (!values.length) return <div className="chart-empty">No matched intervals available for this period.</div>;
  const maxAbs = Math.max(1000, ...values.map(Math.abs));
  const bounds = [-maxAbs, -maxAbs*.6, -maxAbs*.2, maxAbs*.2, maxAbs*.6, maxAbs];
  const counts = Array(5).fill(0);
  values.forEach(v => { let idx = bounds.findIndex((b,i)=>i<bounds.length-1 && v>=b && v<bounds[i+1]); if(idx<0) idx=v===bounds.at(-1)?4:0; counts[idx]++; });
  const peak = Math.max(1,...counts), w=410,h=190,pad={l:18,r:12,t:14,b:38};
  const slotWidth=(w-pad.l-pad.r)/counts.length;
  const hoveredBounds = hoveredBin == null ? null : `${n(bounds[hoveredBin])} to ${n(bounds[hoveredBin+1])} MW`;
  return <svg viewBox={`0 0 ${w} ${h}`} className="error-chart" role="img" aria-label="Forecast error distribution" onMouseLeave={()=>setHoveredBin(null)}>
    {[0,.5,1].map(p=><g key={p}><line x1={pad.l} x2={w-pad.r} y1={h-pad.b-p*(h-pad.t-pad.b)} y2={h-pad.b-p*(h-pad.t-pad.b)} stroke="#edf1f1"/><text x={pad.l} y={h-pad.b-p*(h-pad.t-pad.b)-5} className="axis-label">{n(peak*p)}</text></g>)}
    {counts.map((v,i)=>{const bw=slotWidth-9; const x=pad.l+i*slotWidth+4; const bh=(v/peak)*(h-pad.t-pad.b); return <g key={i}><rect className="chart-hit-area" x={x} y={h-pad.b-bh} width={bw} height={bh} rx="5" fill={i===2?'#13a590':i<2?'#e2a84b':'#658391'} tabIndex="0" aria-label={`${n(bounds[i])} to ${n(bounds[i+1])} MW: ${n(v)} intervals`} onMouseEnter={()=>setHoveredBin(i)} onFocus={()=>setHoveredBin(i)} onBlur={()=>setHoveredBin(null)}/><text x={x+bw/2} y={h-13} textAnchor="middle" className="axis-label">{i<2?'−':i>2?'+':'0'}</text></g>;})}
    {hoveredBin != null && <g className="chart-tooltip" pointerEvents="none"><rect x={Math.min(Math.max(8,pad.l+hoveredBin*slotWidth-46),w-150)} y={pad.t} width="142" height="38" rx="6"/><text x={Math.min(Math.max(8,pad.l+hoveredBin*slotWidth-46),w-150)+9} y={pad.t+15} className="tooltip-date">{hoveredBounds}</text><text x={Math.min(Math.max(8,pad.l+hoveredBin*slotWidth-46),w-150)+9} y={pad.t+29} className="tooltip-forecast">{n(counts[hoveredBin])} intervals</text></g>}
  </svg>;
}

function App() {
  const [cutoff, setCutoff] = useState('09:20');
  const [cutoffOpen, setCutoffOpen] = useState(false);
  const cutoffRef = useRef(null);
  const [rangeOpen, setRangeOpen] = useState(false);
  const rangeRef = useRef(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [range, setRange] = useState('daily');
  const [query, setQuery] = useState('');
  const [pageError, setPageError] = useState('');
  const [activeSection, setActiveSection] = useState(() => window.location.hash.slice(1) || 'overview');

  useEffect(() => {
    const closeOnOutsideClick = event => {
      if (!cutoffRef.current?.contains(event.target)) setCutoffOpen(false);
      if (!rangeRef.current?.contains(event.target)) setRangeOpen(false);
    };
    const closeOnEscape = event => {
      if (event.key === 'Escape') {
        setCutoffOpen(false);
        setRangeOpen(false);
      }
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  useEffect(() => {
    const updateActiveSection = () => setActiveSection(window.location.hash.slice(1) || 'overview');
    window.addEventListener('hashchange', updateActiveSection);
    return () => window.removeEventListener('hashchange', updateActiveSection);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true); setPageError('');
    fetch(`/api/analysis?month=${month}&cutoff=${cutoff}`)
      .then(async res => { const body = await res.json(); if (!res.ok) throw new Error(body.detail || 'Elexon data could not be loaded.'); return body; })
      .then(body => { if(active) setData(body); })
      .catch(err => { if(active) { setPageError(err.message || 'The Elexon data service is unavailable.'); setData(null); } })
      .finally(() => { if(active) setLoading(false); });
    return () => { active = false; };
  }, [cutoff, refresh]);

  const intervals = data?.intervals || [];
  const filtered = useMemo(() => intervals.filter(row => !query || `${row.startTime} ${row.forecast ?? ''} ${row.actual ?? ''}`.toLowerCase().includes(query.toLowerCase())), [intervals, query]);
  const chartData = useMemo(() => {
    const days = data?.daily || [];
    if (range === 'daily') return days;
    const buckets = new Map();
    days.forEach(day => {
      const week = Math.floor((Number(day.date.slice(8, 10)) - 1) / 7) + 1;
      const key = `Week ${week}`;
      const bucket = buckets.get(key) || { date: key, forecastTotal: 0, actualTotal: 0, count: 0 };
      if (day.forecast != null && day.actual != null) { bucket.forecastTotal += day.forecast; bucket.actualTotal += day.actual; bucket.count += 1; }
      buckets.set(key, bucket);
    });
    return [...buckets.values()].map(b => ({ date: b.date, forecast: b.count ? b.forecastTotal / b.count : null, actual: b.count ? b.actualTotal / b.count : null }));
  }, [data, range]);
  const visibleRows = filtered.slice(-48).reverse();
  const metrics = data?.metrics || {};
  const download = () => {
    if(!intervals.length) return;
    const lines = [['startTimeLondon','forecastMW','actualMW','errorMW','forecastPublishTimeLondon'], ...intervals.map(r=>[r.startTime,r.forecast,r.actual,r.error,r.publishTime])].map(row=>row.map(v=>`"${v ?? ''}"`).join(',')).join('\n');
    const url=URL.createObjectURL(new Blob([lines],{type:'text/csv'})); const a=document.createElement('a'); a.href=url; a.download=`wind-desk-${month}.csv`; a.click(); URL.revokeObjectURL(url);
  };
  const biasTone = metrics.bias == null ? '' : metrics.bias >= 0 ? 'positive' : 'negative';
  const lastUpdated = data?.fetchedAt ? dateLabel(data.fetchedAt,{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',timeZoneName:'short'}) : '—';

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><Glyph/><div><strong>gridbricks</strong><span>ENERGY INTELLIGENCE</span></div></div>
      <div className="workspace-label">WORKSPACE</div>
      <div className="workspace-switch"><span className="workspace-avatar">U</span><span><b>UK Utility</b><small>National portfolio</small></span></div>
      <div className="nav-caption">ANALYZE</div>
      <nav className="navigation" aria-label="Analysis"><a href="#overview" className={`nav-item ${activeSection === 'overview' ? 'active' : ''}`}><Grid2X2 size={17}/>Overview</a><a href="#wind-forecast" className={`nav-item ${activeSection === 'wind-forecast' ? 'active' : ''}`}><Wind size={17}/>Wind forecast</a><a href="#accuracy-analysis" className={`nav-item ${activeSection === 'accuracy-analysis' ? 'active' : ''}`}><BarChart3 size={17}/>Accuracy analysis</a></nav>
      <div className="nav-caption source-caption">DATA & SETTINGS</div>
      <nav className="navigation" aria-label="Data and methodology"><a href="#data-quality" className={`nav-item ${activeSection === 'data-quality' ? 'active' : ''}`}><Activity size={17}/>Data quality</a><a href="#methodology" className={`nav-item ${activeSection === 'methodology' ? 'active' : ''}`}><ShieldCheck size={17}/>Sources & methodology</a></nav>
      <div className="sidebar-bottom"><a className="live-source" href="https://bmrs.elexon.co.uk/api-documentation" target="_blank" rel="noreferrer"><span className="live-dot"/><span><b>Elexon Insights</b><small>Public data source</small></span><ExternalLink size={14}/></a><div className="profile"><div className="profile-pic">AN</div><span><b>Analyst workspace</b><small>Wind portfolio</small></span></div></div>
    </aside>

    <main className="main-content">
      <header className="topbar"><div className="breadcrumb"><span>Workspace</span><span className="crumb-slash">/</span><b>Wind forecast overview</b></div><div className="top-actions"><span className="period-tag"><span className="period-dot"/>ANALYSIS PERIOD&nbsp; · &nbsp;JAN 2026</span><button className="icon-button" title="Refresh data" onClick={()=>setRefresh(x=>x+1)}><RefreshCw size={17}/></button><a className="help-button" href="#methodology"><Info size={16}/> Methodology</a></div></header>
      <section className="page-heading" id="overview"><div><div className="eyebrow"><span className="eyebrow-line"/>PROCUREMENT INTELLIGENCE</div><h1>Wind forecast overview</h1><p className="intro">See the wind generation picture your team could have had before day-ahead procurement.</p></div><div className="heading-controls" ref={cutoffRef}><label className="control-label">DECISION CUTOFF <span title="Default aligned with GB 60-minute day-ahead order-book close">ⓘ</span></label><div className="cutoff-control"><Clock3 size={16}/><button className="cutoff-trigger" type="button" aria-haspopup="listbox" aria-expanded={cutoffOpen} onClick={()=>setCutoffOpen(open=>!open)}>{cutoff} UK time</button><ChevronDown size={14}/>{cutoffOpen && <div className="cutoff-options" role="listbox" aria-label="Decision cutoff">{['09:20','10:00','12:00','15:30'].map(option=><button key={option} type="button" role="option" aria-selected={cutoff===option} className={cutoff===option?'selected':''} onClick={()=>{setCutoff(option);setCutoffOpen(false)}}>{option} UK time</button>)}</div>}</div></div></section>
      <div className="decision-banner"><div className="banner-icon"><Zap size={19}/></div><div><b>Decision-time view</b><span>Showing the latest wind forecast published by <strong>{cutoff} on the day before delivery</strong>, matched to actual generation for January 2026.</span></div><span className="banner-flag"><Check size={13}/> D−1 VINTAGE</span></div>

      {pageError && <div className="error-state"><div className="error-state-icon"><Info size={19}/></div><div><b>Unable to load Elexon data</b><p>{pageError} No sample values are being shown. Check your connection and retry.</p></div><button onClick={()=>setRefresh(x=>x+1)}><RefreshCw size={14}/> Retry</button></div>}
      {loading && <div className="loading-line"><LoaderCircle size={16} className="spin"/> Connecting to Elexon Insights…</div>}

      <section className="metrics-grid" id="accuracy-analysis">
        <MetricCard icon={Wind} label="Mean absolute error" value={n(metrics.mae)} unit="MW" caption="Typical forecast deviation · lower is better"/>
        <MetricCard icon={Activity} label="Root mean square error" value={n(metrics.rmse)} unit="MW" caption="Weights larger misses more heavily"/>
        <MetricCard icon={metrics.bias >= 0 ? ArrowUpRight : ArrowDownRight} label="Forecast bias" value={n(metrics.bias)} unit="MW" caption={metrics.bias == null?'Forecast minus actual':'Positive = over-forecast wind'} tone={biasTone}/>
        <MetricCard icon={ShieldCheck} label="Matched coverage" value={metrics.coveragePct == null?'—':n(metrics.coveragePct,1)} unit="%" caption={`${n(metrics.matchedIntervals)} of ${n(metrics.expectedIntervals)} expected intervals`}/>
      </section>

      <section className="content-grid">
        <article className="panel trend-panel" id="wind-forecast"><div className="panel-heading"><div><div className="panel-kicker">GENERATION PROFILE</div><h2>Forecast vs actual</h2><p>{range === 'daily' ? 'Daily' : 'Weekly'} average wind generation · January 2026</p></div><div className="chart-view-switch" ref={rangeRef}><button className="select-pill" type="button" aria-haspopup="listbox" aria-expanded={rangeOpen} onClick={()=>setRangeOpen(open=>!open)}>{range === 'daily' ? 'Daily view' : 'Weekly view'}<ChevronDown size={14}/></button>{rangeOpen && <div className="range-options" role="listbox" aria-label="Chart time range">{[{value:'daily',label:'Daily view'},{value:'weekly',label:'Weekly view'}].map(option=><button key={option.value} type="button" role="option" aria-selected={range===option.value} className={range===option.value?'selected':''} onClick={()=>{setRange(option.value);setRangeOpen(false)}}>{option.label}</button>)}</div>}</div></div><div className="legend"><span><i className="legend-line teal"/>Forecast at decision cutoff</span><span><i className="legend-line slate"/>Actual outturn</span></div><DailyChart data={chartData}/><div className="chart-foot"><span>MW · FUELHH half-hour actuals combined into hourly means, then daily averages</span><span>{data ? `${n(data.daily?.length)} days with returned records` : 'Waiting for data'}</span></div></article>
        <article className="panel error-panel"><div className="panel-heading"><div><div className="panel-kicker">ERROR DISTRIBUTION</div><h2>Forecast error</h2><p>Wind forecast minus actual generation</p></div><span className="unit-pill">MW</span></div><ErrorChart intervals={intervals}/><div className="bias-callout"><div className="callout-icon"><Info size={15}/></div><p><b>{metrics.bias == null ? 'Bias unavailable' : metrics.bias > 0 ? 'Over-forecast tendency' : metrics.bias < 0 ? 'Under-forecast tendency' : 'Little average directional error'}</b><span>{metrics.bias == null ? 'Matched interval data is needed to calculate bias.' : `Average signed error is ${n(metrics.bias)} MW across matched intervals.`}</span></p></div></article>
      </section>

      <section className="data-panel panel" id="data-quality"><div className="data-heading"><div><div className="panel-kicker">DELIVERY DETAIL</div><h2>Hourly delivery records</h2><p>Latest returned hours · values are MW averages for each hour</p></div><div className="table-actions"><div className="search-box"><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Filter records" aria-label="Filter records"/></div><button className="export-button" onClick={download} disabled={!intervals.length}><Download size={15}/> Export CSV</button></div></div>
        <div className="table-wrap"><table><thead><tr><th>DELIVERY HOUR <ChevronDown size={12}/></th><th>WIND FORECAST</th><th>ACTUAL OUTTURN</th><th>ERROR</th><th>FORECAST PUBLISHED</th></tr></thead><tbody>
          {visibleRows.map((row,i)=><tr key={row.startTime || i}><td><b>{row.startTime ? dateLabel(row.startTime,{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : '—'}</b><span className="table-sub">Europe/London</span></td><td>{row.forecast == null?'—':`${n(row.forecast)} MW`}</td><td>{row.actual == null?'—':`${n(row.actual)} MW`}</td><td><span className={`error-value ${row.error > 0 ? 'warm' : row.error < 0 ? 'cool' : ''}`}>{row.error == null?'—':`${row.error > 0?'+':''}${n(row.error)} MW`}</span></td><td>{row.publishTime ? dateLabel(row.publishTime,{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : <span className="missing-tag">NO FORECAST</span>}</td></tr>)}
          {!visibleRows.length && <tr><td colSpan="5" className="no-rows">{loading?'Loading interval records…':pageError?'Source data unavailable.':'No intervals match your filter.'}</td></tr>}
        </tbody></table></div><div className="table-footer"><span>Showing {visibleRows.length} of {n(filtered.length)} filtered intervals</span><span><span className="live-dot"/> Source: Elexon Insights · FUELHH + WINDFOR</span></div></section>

      <section className="methodology-panel panel" id="methodology"><div className="panel-heading"><div><div className="panel-kicker">SOURCES & METHODOLOGY</div><h2>How to interpret this analysis</h2><p>January 2026 · Great Britain national wind generation</p></div></div><div className="methodology-grid"><div><b>Forecast vintage</b><p>For each delivery hour, the latest WINDFOR forecast published by the selected UK-time cutoff on the previous day is used.</p></div><div><b>Actuals and matching</b><p>FUELHH records are filtered to WIND. Complete pairs of half-hour actuals are averaged to hourly values and matched to forecasts by delivery time.</p></div><div><b>Accuracy and scope</b><p>Error is forecast minus actual. MAE, RMSE, bias, and coverage use matched available data. This pilot does not estimate total procurement needs or residual demand.</p></div></div></section>

      <footer className="page-footer"><span>GRIDBRICKS WIND DESK <span>·</span> PILOT ANALYSIS</span><span>Data snapshot {lastUpdated} <span className="footer-sep">|</span> Decision cutoff {cutoff} UK</span></footer>
    </main>
  </div>;
}

createRoot(document.getElementById('root')).render(<App/>);
