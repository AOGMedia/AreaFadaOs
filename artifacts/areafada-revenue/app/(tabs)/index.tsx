import React, { useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  Platform,
  Pressable,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@clerk/expo";
import { Feather, Ionicons } from "@expo/vector-icons";
import {
  useListBrandDeals,
  useListInvoices,
  useListAffiliateLinks,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useOverdueNotifications } from "@/hooks/useOverdueNotifications";

function formatCurrency(amount: number, currency = "NGN"): string {
  const symbols: Record<string, string> = {
    NGN: "₦", GHS: "₵", KES: "KSh", ZAR: "R", USD: "$",
  };
  const sym = symbols[currency] ?? currency;
  if (amount >= 1_000_000) return `${sym}${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `${sym}${(amount / 1_000).toFixed(0)}k`;
  return `${sym}${amount.toFixed(0)}`;
}

function SummaryCard({
  label, value, sub, icon, iconBg, colors,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  iconBg: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={{
      flex: 1,
      backgroundColor: colors.card,
      borderRadius: colors.radius + 2,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
    }}>
      <View style={{
        width: 36, height: 36, borderRadius: 10,
        backgroundColor: iconBg,
        alignItems: "center", justifyContent: "center", marginBottom: 12,
      }}>
        {icon}
      </View>
      <Text style={{ fontSize: 20, fontFamily: "DM_Sans_700Bold", color: colors.foreground, marginBottom: 2 }}>
        {value}
      </Text>
      <Text style={{ fontSize: 12, fontFamily: "DM_Sans_400Regular", color: colors.mutedForeground }}>
        {label}
      </Text>
      {sub && (
        <Text style={{ fontSize: 11, fontFamily: "DM_Sans_400Regular", color: colors.primary, marginTop: 4 }}>
          {sub}
        </Text>
      )}
    </View>
  );
}

function OverdueBanner({ count, colors }: { count: number; colors: ReturnType<typeof useColors> }) {
  if (count === 0) return null;
  return (
    <View style={{
      flexDirection: "row", alignItems: "center", gap: 10,
      backgroundColor: colors.accent + "22",
      borderWidth: 1, borderColor: colors.accent + "55",
      borderRadius: colors.radius, padding: 14, marginBottom: 20,
    }}>
      <Ionicons name="warning-outline" size={20} color={colors.accent} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13, fontFamily: "DM_Sans_600SemiBold", color: colors.accent }}>
          {count} overdue invoice{count > 1 ? "s" : ""}
        </Text>
        <Text style={{ fontSize: 12, fontFamily: "DM_Sans_400Regular", color: colors.mutedForeground }}>
          Send payment reminders from the Invoices tab
        </Text>
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { signOut } = useAuth();

  const { data: deals } = useListBrandDeals();
  const { data: invoices } = useListInvoices();
  const { data: affiliates } = useListAffiliateLinks();

  const stats = useMemo(() => {
    const brandTotal = (deals ?? [])
      .filter((d) => d.status !== "cancelled")
      .reduce((s, d) => s + (d.dealValue ?? 0), 0);
    const activeDeals = (deals ?? [])
      .filter((d) => !["cancelled", "paid"].includes(d.status)).length;

    const invoiceTotal = (invoices ?? [])
      .filter((i) => i.status !== "cancelled")
      .reduce((s, i) => s + (i.total ?? 0), 0);
    const overdueCount = (invoices ?? []).filter((i) => i.status === "overdue").length;

    const affRevenue = (affiliates ?? []).reduce((s, a) => s + (a.revenueGenerated ?? 0), 0);
    const totalClicks = (affiliates ?? []).reduce((s, a) => s + (a.clickCount ?? 0), 0);

    return { brandTotal, activeDeals, invoiceTotal, overdueCount, affRevenue, totalClicks };
  }, [deals, invoices, affiliates]);

  useOverdueNotifications(stats.overdueCount);

  const topPad = Platform.OS === "web" ? 60 : insets.top + 16;
  const btmPad = Platform.OS === "web" ? 20 : insets.bottom + 100;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingTop: topPad, paddingHorizontal: 20, paddingBottom: btmPad }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
        <View>
          <Text style={{ fontSize: 22, fontFamily: "DM_Sans_700Bold", color: colors.foreground }}>Revenue</Text>
          <Text style={{ fontSize: 13, fontFamily: "DM_Sans_400Regular", color: colors.mutedForeground }}>Your creator dashboard</Text>
        </View>
        <Pressable
          onPress={() =>
            Alert.alert("Sign out", "Are you sure?", [
              { text: "Cancel", style: "cancel" },
              { text: "Sign out", style: "destructive", onPress: () => signOut() },
            ])
          }
          style={({ pressed }) => ({
            width: 40, height: 40, borderRadius: 20,
            backgroundColor: pressed ? colors.muted : colors.card,
            borderWidth: 1, borderColor: colors.border,
            alignItems: "center", justifyContent: "center",
          })}
        >
          <Feather name="log-out" size={16} color={colors.mutedForeground} />
        </Pressable>
      </View>

      <OverdueBanner count={stats.overdueCount} colors={colors} />

      <Text style={{ fontSize: 12, fontFamily: "DM_Sans_600SemiBold", color: colors.mutedForeground, marginBottom: 12, letterSpacing: 0.8, textTransform: "uppercase" }}>
        Overview
      </Text>

      <View style={{ flexDirection: "row", gap: 12, marginBottom: 12 }}>
        <SummaryCard
          label="Brand Deals"
          value={formatCurrency(stats.brandTotal)}
          sub={`${stats.activeDeals} active`}
          icon={<Feather name="briefcase" size={18} color={colors.primary} />}
          iconBg={colors.primary + "22"}
          colors={colors}
        />
        <SummaryCard
          label="Invoices"
          value={formatCurrency(stats.invoiceTotal)}
          sub={stats.overdueCount > 0 ? `${stats.overdueCount} overdue` : "All clear"}
          icon={<Feather name="file-text" size={18} color="#8b5cf6" />}
          iconBg="#8b5cf622"
          colors={colors}
        />
      </View>
      <View style={{ flexDirection: "row", gap: 12, marginBottom: 32 }}>
        <SummaryCard
          label="Affiliate Rev"
          value={formatCurrency(stats.affRevenue)}
          sub={`${stats.totalClicks.toLocaleString()} clicks`}
          icon={<Feather name="link-2" size={18} color={colors.accent} />}
          iconBg={colors.accent + "22"}
          colors={colors}
        />
        <SummaryCard
          label="Total Revenue"
          value={formatCurrency(stats.brandTotal + stats.invoiceTotal + stats.affRevenue)}
          icon={<Ionicons name="trending-up" size={18} color={colors.primary} />}
          iconBg={colors.primary + "33"}
          colors={colors}
        />
      </View>

      <Text style={{ fontSize: 12, fontFamily: "DM_Sans_600SemiBold", color: colors.mutedForeground, marginBottom: 12, letterSpacing: 0.8, textTransform: "uppercase" }}>
        Recent Deals
      </Text>
      {(deals ?? []).length === 0 ? (
        <View style={{ backgroundColor: colors.card, borderRadius: colors.radius, padding: 28, alignItems: "center", borderWidth: 1, borderColor: colors.border }}>
          <Feather name="briefcase" size={28} color={colors.mutedForeground} style={{ marginBottom: 8 }} />
          <Text style={{ fontSize: 14, fontFamily: "DM_Sans_400Regular", color: colors.mutedForeground }}>No deals yet</Text>
        </View>
      ) : (
        (deals ?? []).slice(0, 3).map((deal) => (
          <View key={deal.id} style={{
            flexDirection: "row", alignItems: "center", justifyContent: "space-between",
            backgroundColor: colors.card, borderRadius: colors.radius, padding: 14,
            borderWidth: 1, borderColor: colors.border, marginBottom: 8,
          }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontFamily: "DM_Sans_600SemiBold", color: colors.foreground }}>{deal.brandName}</Text>
              <Text style={{ fontSize: 12, fontFamily: "DM_Sans_400Regular", color: colors.mutedForeground, textTransform: "capitalize" }}>
                {deal.status.replace(/_/g, " ")}
              </Text>
            </View>
            <Text style={{ fontSize: 14, fontFamily: "DM_Sans_600SemiBold", color: colors.primary }}>
              {formatCurrency(deal.dealValue ?? 0, deal.currency)}
            </Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}
