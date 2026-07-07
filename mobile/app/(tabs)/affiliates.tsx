import React from "react";
import {
  View,
  Text,
  ScrollView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useListAffiliateLinks } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

function formatCurrency(amount: number): string {
  if (amount >= 1_000_000) return `₦${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `₦${(amount / 1_000).toFixed(0)}k`;
  return `₦${amount.toFixed(0)}`;
}

function formatCVR(clicks: number, conversions: number): string {
  if (clicks === 0) return "0%";
  return `${((conversions / clicks) * 100).toFixed(1)}%`;
}

function StatPill({
  label, value, color, colors,
}: {
  label: string; value: string; color: string; colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={{ flex: 1, alignItems: "center", backgroundColor: color + "15", borderRadius: 10, paddingVertical: 10 }}>
      <Text style={{ fontSize: 15, fontFamily: "DM_Sans_700Bold", color }}>{value}</Text>
      <Text style={{ fontSize: 10, fontFamily: "DM_Sans_400Regular", color: colors.mutedForeground, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

export default function AffiliatesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const { data: links, isLoading } = useListAffiliateLinks();

  const topPad = Platform.OS === "web" ? 60 : insets.top + 16;
  const btmPad = Platform.OS === "web" ? 20 : insets.bottom + 100;

  const totals = (links ?? []).reduce(
    (acc, link) => ({
      clicks: acc.clicks + (link.clickCount ?? 0),
      conversions: acc.conversions + (link.conversionCount ?? 0),
      revenue: acc.revenue + (link.revenueGenerated ?? 0),
    }),
    { clicks: 0, conversions: 0, revenue: 0 },
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingTop: topPad, paddingHorizontal: 20, paddingBottom: btmPad }}
      showsVerticalScrollIndicator={false}
    >
      <Text style={{ fontSize: 22, fontFamily: "DM_Sans_700Bold", color: colors.foreground, marginBottom: 4 }}>Affiliates</Text>
      <Text style={{ fontSize: 13, fontFamily: "DM_Sans_400Regular", color: colors.mutedForeground, marginBottom: 24 }}>
        {(links ?? []).length} link{(links ?? []).length !== 1 ? "s" : ""} tracked
      </Text>

      {(links ?? []).length > 0 && (
        <View style={{
          backgroundColor: colors.card, borderRadius: colors.radius + 2,
          borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 24,
        }}>
          <Text style={{ fontSize: 12, fontFamily: "DM_Sans_600SemiBold", color: colors.mutedForeground, marginBottom: 12, letterSpacing: 0.8, textTransform: "uppercase" }}>
            Total Performance
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <StatPill label="Clicks" value={totals.clicks.toLocaleString()} color={colors.primary} colors={colors} />
            <StatPill label="CVR" value={formatCVR(totals.clicks, totals.conversions)} color="#8b5cf6" colors={colors} />
            <StatPill label="Revenue" value={formatCurrency(totals.revenue)} color={colors.accent} colors={colors} />
          </View>
        </View>
      )}

      <Text style={{ fontSize: 12, fontFamily: "DM_Sans_600SemiBold", color: colors.mutedForeground, marginBottom: 12, letterSpacing: 0.8, textTransform: "uppercase" }}>
        Links
      </Text>

      {isLoading && (
        <View style={{ padding: 40, alignItems: "center" }}>
          <Text style={{ fontSize: 14, fontFamily: "DM_Sans_400Regular", color: colors.mutedForeground }}>Loading links…</Text>
        </View>
      )}

      {!isLoading && (links ?? []).length === 0 && (
        <View style={{
          backgroundColor: colors.card, borderRadius: colors.radius + 2,
          padding: 40, alignItems: "center", borderWidth: 1, borderColor: colors.border,
        }}>
          <Feather name="link-2" size={32} color={colors.mutedForeground} style={{ marginBottom: 10 }} />
          <Text style={{ fontSize: 15, fontFamily: "DM_Sans_600SemiBold", color: colors.foreground, marginBottom: 4 }}>No affiliate links yet</Text>
          <Text style={{ fontSize: 13, fontFamily: "DM_Sans_400Regular", color: colors.mutedForeground, textAlign: "center" }}>
            Create affiliate links from the web dashboard
          </Text>
        </View>
      )}

      {(links ?? []).map((link) => {
        const cvr = link.clickCount > 0 ? (link.conversionCount / link.clickCount) * 100 : 0;
        const cvrColor = cvr >= 5 ? colors.primary : cvr >= 2 ? colors.accent : colors.mutedForeground;

        return (
          <View key={link.id} style={{
            backgroundColor: colors.card, borderRadius: colors.radius + 2,
            borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 10,
          }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={{ fontSize: 15, fontFamily: "DM_Sans_600SemiBold", color: colors.foreground, marginBottom: 2 }}>
                  {link.name}
                </Text>
                {link.platform && (
                  <View style={{ alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 100, backgroundColor: colors.secondary }}>
                    <Text style={{ fontSize: 10, fontFamily: "DM_Sans_500Medium", color: colors.secondaryForeground }}>
                      {link.platform}
                    </Text>
                  </View>
                )}
              </View>
              <View style={{
                paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100,
                backgroundColor: link.isActive ? colors.primary + "20" : colors.muted,
              }}>
                <Text style={{
                  fontSize: 11, fontFamily: "DM_Sans_600SemiBold",
                  color: link.isActive ? colors.primary : colors.mutedForeground,
                }}>
                  {link.isActive ? "Active" : "Inactive"}
                </Text>
              </View>
            </View>

            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1, backgroundColor: colors.primary + "15", borderRadius: 10, paddingVertical: 10, alignItems: "center" }}>
                <Text style={{ fontSize: 16, fontFamily: "DM_Sans_700Bold", color: colors.primary }}>
                  {(link.clickCount ?? 0).toLocaleString()}
                </Text>
                <Text style={{ fontSize: 10, fontFamily: "DM_Sans_400Regular", color: colors.mutedForeground, marginTop: 2 }}>Clicks</Text>
              </View>
              <View style={{ flex: 1, backgroundColor: "#8b5cf615", borderRadius: 10, paddingVertical: 10, alignItems: "center" }}>
                <Text style={{ fontSize: 16, fontFamily: "DM_Sans_700Bold", color: cvrColor }}>
                  {cvr.toFixed(1)}%
                </Text>
                <Text style={{ fontSize: 10, fontFamily: "DM_Sans_400Regular", color: colors.mutedForeground, marginTop: 2 }}>CVR</Text>
              </View>
              <View style={{ flex: 1, backgroundColor: colors.accent + "15", borderRadius: 10, paddingVertical: 10, alignItems: "center" }}>
                <Text style={{ fontSize: 14, fontFamily: "DM_Sans_700Bold", color: colors.accent }}>
                  {formatCurrency(link.revenueGenerated ?? 0)}
                </Text>
                <Text style={{ fontSize: 10, fontFamily: "DM_Sans_400Regular", color: colors.mutedForeground, marginTop: 2 }}>Revenue</Text>
              </View>
            </View>

            {link.campaignTag && (
              <Text style={{ fontSize: 11, fontFamily: "DM_Sans_400Regular", color: colors.mutedForeground, marginTop: 10 }}>
                Tag: {link.campaignTag}
              </Text>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}
