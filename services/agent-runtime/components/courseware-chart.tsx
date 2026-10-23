'use client';

import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import type { PPTChartElement } from '@openmaic/dsl';

echarts.use([
  BarChart,
  LineChart,
  PieChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  SVGRenderer,
]);

export function CoursewareChart({
  element,
  focusIndexes,
}: {
  element: PPTChartElement;
  focusIndexes?: number[];
}) {
  const root = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!root.current) return;
    const host = root.current;
    const chart = echarts.init(host, null, {
      renderer: 'svg',
      width: element.width,
      height: element.height,
    });
    const pointStyle = (index: number) => ({
      opacity: !focusIndexes?.length || focusIndexes.includes(index) ? 1 : 0.25,
      ...(focusIndexes?.includes(index) ? { borderWidth: 3, borderColor: element.textColor } : {}),
    });
    const { data } = element;
    const ring = element.chartType === 'ring';
    const horizontal = element.chartType === 'bar';
    const axis = {
      axisLabel: { color: element.textColor, fontSize: 17, hideOverlap: false },
      axisLine: { lineStyle: { color: element.textColor } },
      axisTick: { show: false },
    };
    const category = {
      ...axis,
      type: 'category' as const,
      data: data.labels,
      axisLabel: { ...axis.axisLabel, interval: 0 },
      ...(horizontal ? { inverse: true } : {}),
    };
    const numeric = {
      ...axis,
      type: 'value' as const,
      min: Math.min(0, ...data.series.flat()),
      splitLine: { lineStyle: { color: element.lineColor } },
    };
    chart.setOption({
      animation: false,
      color: element.themeColors,
      backgroundColor: 'transparent',
      textStyle: { fontFamily: 'Noto Sans SC,sans-serif', color: element.textColor, fontSize: 18 },
      tooltip: { trigger: ring ? 'item' : 'axis', confine: true },
      legend: {
        show: data.legends.length > 1,
        bottom: 0,
        textStyle: { color: element.textColor, fontSize: 16 },
      },
      ...(ring
        ? {}
        : {
            grid: {
              left: 14,
              right: 50,
              top: 20,
              bottom: data.legends.length > 1 ? 46 : 10,
              containLabel: true,
            },
            xAxis: horizontal ? numeric : category,
            yAxis: horizontal ? category : numeric,
          }),
      series: ring
        ? [
            {
              type: 'pie',
              radius: ['46%', '72%'],
              center: ['50%', '48%'],
              label: { show: true, color: element.textColor, fontSize: 18, formatter: '{b}: {c}' },
              data: data.labels.map((name, index) => ({
                name,
                value: data.series[0][index],
                itemStyle: pointStyle(index),
              })),
            },
          ]
        : data.series.map((values, index) => ({
            name: data.legends[index],
            data: values.map((value, point) => ({
              value,
              itemStyle: pointStyle(point),
              symbolSize: focusIndexes?.includes(point) ? 18 : 8,
            })),
            type: ['line', 'area'].includes(element.chartType) ? 'line' : 'bar',
            ...(element.chartType === 'area' ? { areaStyle: { opacity: 0.18 } } : {}),
            smooth: false,
            symbolSize: 8,
            barMaxWidth: 52,
            label: {
              show: data.legends.length === 1,
              position: horizontal ? 'right' : 'top',
              color: element.textColor,
              fontSize: 18,
            },
          })),
    });
    host.dataset.coursewareChartReady = 'true';
    const syncScale = () => {
      if (frame.current)
        host.style.transform = `scale(${frame.current.clientWidth / element.width})`;
    };
    syncScale();
    const resize = new ResizeObserver(syncScale);
    if (frame.current) resize.observe(frame.current);
    return () => {
      resize.disconnect();
      chart.dispose();
      delete host.dataset.coursewareChartReady;
    };
  }, [element, focusIndexes]);
  return (
    <div
      ref={frame}
      className="base-element-chart"
      role="img"
      aria-label={element.data.labels
        .map(
          (label, index) =>
            `${label}: ${element.data.series.map((series) => series[index]).join(', ')}`,
        )
        .join('; ')}
      style={{
        position: 'absolute',
        left: `${element.left / 10}%`,
        top: `${element.top / 5.625}%`,
        width: `${element.width / 10}%`,
        height: `${element.height / 5.625}%`,
      }}
    >
      <div
        ref={root}
        style={{ width: element.width, height: element.height, transformOrigin: '0 0' }}
      />
    </div>
  );
}
