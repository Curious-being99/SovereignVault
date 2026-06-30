import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { StoragePoint } from '../types';

interface Props {
  data: StoragePoint[];
  width?: number;
  height?: number;
}

export const StorageUsageChart: React.FC<Props> = ({ data, width = 600, height = 300 }) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || data.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const margin = { top: 20, right: 30, bottom: 30, left: 50 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    const stack = d3.stack<StoragePoint>()
      .keys(['media', 'documents', 'archives']);

    const series = stack(data);

    const x = d3.scaleTime()
      .domain(d3.extent(data, (d: StoragePoint) => d.date) as [Date, Date])
      .range([0, chartWidth]);

    const y = d3.scaleLinear()
      .domain([0, (d3.max(series, d => d3.max(d, s => s[1])) || 0) * 1.1])
      .nice()
      .range([chartHeight, 0]);

    const color = d3.scaleOrdinal<string>()
      .domain(['media', 'documents', 'archives'])
      .range(['#14b8a6', '#6366f1', '#a855f7']); // teal-500, indigo-500, purple-500

    const area = d3.area<d3.SeriesPoint<StoragePoint>>()
      .x(d => x(d.data.date))
      .y0(d => y(d[0]))
      .y1(d => y(d[1]))
      .curve(d3.curveMonotoneX);

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Add gradients
    const defs = svg.append('defs');
    ['media', 'documents', 'archives'].forEach(key => {
      const gradient = defs.append('linearGradient')
        .attr('id', `gradient-${key}`)
        .attr('x1', '0%')
        .attr('y1', '0%')
        .attr('x2', '0%')
        .attr('y2', '100%');
      
      const baseColor = color(key);
      gradient.append('stop').attr('offset', '0%').attr('stop-color', baseColor).attr('stop-opacity', 0.8);
      gradient.append('stop').attr('offset', '100%').attr('stop-color', baseColor).attr('stop-opacity', 0.2);
    });

    g.selectAll('path')
      .data(series)
      .join('path')
      .attr('fill', ({ key }) => `url(#gradient-${key})`)
      .attr('stroke', ({ key }) => color(key))
      .attr('stroke-width', 1)
      .attr('d', area)
      .append('title')
      .text(({ key }) => key);

    // Axes
    const xAxis = g.append('g')
      .attr('transform', `translate(0,${chartHeight})`)
      .call(d3.axisBottom(x).ticks(5).tickSizeOuter(0))
      .attr('font-size', '8px')
      .attr('color', 'rgba(255,255,255,0.4)');
    
    xAxis.select('.domain').attr('stroke', 'rgba(255,255,255,0.1)');
    xAxis.selectAll('line').attr('stroke', 'rgba(255,255,255,0.1)');

    const yAxis = g.append('g')
      .call(d3.axisLeft(y).ticks(5).tickFormat(d3.format('.2s')))
      .attr('font-size', '8px')
      .attr('color', 'rgba(255,255,255,0.4)');

    yAxis.select('.domain').attr('stroke', 'rgba(255,255,255,0.1)');
    yAxis.selectAll('line').attr('stroke', 'rgba(255,255,255,0.1)');

  }, [data, width, height]);

  return (
    <div className="relative">
      <svg ref={svgRef} width={width} height={height} className="overflow-visible" />
      <div className="mt-4 flex justify-center gap-4 text-[9px] uppercase font-black tracking-widest">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-teal-500"></div>
          <span className="text-teal-200">Media</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
          <span className="text-indigo-200">Documents</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-purple-500"></div>
          <span className="text-purple-200">Archives</span>
        </div>
      </div>
    </div>
  );
};
