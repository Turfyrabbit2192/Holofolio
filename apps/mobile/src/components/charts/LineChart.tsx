import React, { useState } from "react";
import { LayoutChangeEvent, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { useTheme } from "@/theme";
import { spacing } from "@/theme/spacing";
import { typography } from "@/theme/typography";

export interface LineChartPoint {
  label: string;
  value: number;
}

export function LineChart({ data, height = 160 }: { data: LineChartPoint[]; height?: number }) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  if (data.length < 2 || width === 0) {
    return (
      <View onLayout={onLayout} style={{ height }}>
        {data.length < 2 && (
          <Text style={[typography.bodySm, { color: theme.textMuted, marginTop: spacing.md }]}>
            Not enough history yet to chart value over time.
          </Text>
        )}
      </View>
    );
  }

  const values = data.map((d) => d.value);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const padTop = 16;
  const padBottom = 20;
  const chartHeight = height - padTop - padBottom;

  const points = data.map((d, i) => ({
    x: (i / (data.length - 1)) * width,
    y: padTop + chartHeight - ((d.value - min) / range) * chartHeight,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${points[points.length - 1].x.toFixed(1)},${height - padBottom} L${points[0].x.toFixed(1)},${height - padBottom} Z`;

  return (
    <View onLayout={onLayout}>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={theme.primary} stopOpacity={0.28} />
            <Stop offset="1" stopColor={theme.primary} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Path d={areaPath} fill="url(#areaFill)" />
        <Path d={linePath} stroke={theme.primary} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
        <Circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r={4} fill={theme.primary} />
      </Svg>
      <View style={styles.labelRow}>
        <Text style={[typography.caption, { color: theme.textMuted }]}>{data[0].label}</Text>
        <Text style={[typography.caption, { color: theme.textMuted }]}>{data[data.length - 1].label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  labelRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
});
