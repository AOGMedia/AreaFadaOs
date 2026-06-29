import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useListBrandDeals } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

type DealStatus = "inbound" | "negotiating" | "agreed" | "deliverable_due" | "invoiced" | "paid" | "cancelled";

const STATUS_ORDER: DealStatus[] = [
  "inbound", "negotiating", "agreed", "deliverable_due", "invoiced", "paid", "cancelled",
];

const STATUS_LABELS: Record<DealStatus, string> = {
  inbound: "Inbound",
  negotiating: "Negotiating",
  agreed: "Agreed",
  deliverable_due: "Deliverable",
  invoiced: "Invoiced",
  paid: "Paid",
  cancelled: "Cancelled",
};

const STATUS_COLORS: Record<DealStatus, { bg: string; text: string }> = {
  inbound:        { bg: "#3b82f620", text: "#3b82f6" },
  negotiating:    { bg: "#f59e0b20", text: "#f59e0b" },
  agreed:         { bg: "#8b5cf620", text: "#8b5cf6" },
  deliverable_due:{ bg: "#ec489920", text: "#ec4899" },
  invoiced:       { bg: "#06b6d420", text: "#06b6d4" },
  paid:           { bg: "#22c55e20", text: "#22c55e" },
  cancelled:      { bg: "#6b728020", text: "#6b7280" },
};

function formatCurrency(amount: number, currency = "NGN"): string {
  const symbols: Record<string, string> = {
    NGN: "₦", GHS: "₵", KES: "KSh", ZAR: "R", USD: "$",
  };
  const sym = symbols[currency] ?? currency;
  if (amount >= 1_000_000) return `${sym}${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `${sym}${(amount / 1_000).toFixed(0)}k`;
  return `${sym}${amount.toFixed(0)}`;
}

export default function DealsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [selectedStatus, setSelectedStatus] = useState<DealStatus | "all">("all");

  const { data: deals, isLoading } = useListBrandDeals();

  const filtered = (deals ?? []).filter(
    (d) => selectedStatus === "all" || d.status === selectedStatus,
  );

  const topPad = Platform.OS === "web" ? 60 : insets.top + 16;
  const btmPad = Platform.OS === "web" ? 20 : insets.bottom + 100;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingTop: topPad, paddingHorizontal: 20, paddingBottom: 12 }}>
        <Text style={{ fontSize: 22, fontFamily: "DM_Sans_700Bold", color: colors.foreground, marginBottom: 4 }}>Brand Deals</Text>
        <Text style={{ fontSize: 13, fontFamily: "DM_Sans_400Regular", color: colors.mutedForeground }}>
          {(deals ?? []).length} deal{(deals ?? []).length !== 1 ? "s" : ""} total
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, gap: 8, paddingBottom: 16 }}
        style={{ flexGrow: 0 }}
      >
        <Pressable
          style={({ pressed }) => ({
            paddingHorizontal: 14, paddingVertical: 7, borderRadius: 100,
            backgroundColor: selectedStatus === "all" ? colors.primary : colors.card,
            borderWidth: 1,
            borderColor: selectedStatus === "all" ? colors.primary : colors.border,
            opacity: pressed ? 0.8 : 1,
          })}
          onPress={() => setSelectedStatus("all")}
        >
          <Text style={{
            fontSize: 13, fontFamily: "DM_Sans_500Medium",
            color: selectedStatus === "all" ? colors.primaryForeground : colors.mutedForeground,
          }}>All</Text>
        </Pressable>
        {STATUS_ORDER.map((status) => (
          <Pressable
            key={status}
            style={({ pressed }) => ({
              paddingHorizontal: 14, paddingVertical: 7, borderRadius: 100,
              backgroundColor: selectedStatus === status ? colors.primary : colors.card,
              borderWidth: 1,
              borderColor: selectedStatus === status ? colors.primary : colors.border,
              opacity: pressed ? 0.8 : 1,
            })}
            onPress={() => setSelectedStatus(status)}
          >
            <Text style={{
              fontSize: 13, fontFamily: "DM_Sans_500Medium",
              color: selectedStatus === status ? colors.primaryForeground : colors.mutedForeground,
            }}>
              {STATUS_LABELS[status]}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: btmPad, gap: 10 }}
        showsVerticalScrollIndicator={false}
      >
        {isLoading && (
          <View style={{ padding: 40, alignItems: "center" }}>
            <Text style={{ fontSize: 14, fontFamily: "DM_Sans_400Regular", color: colors.mutedForeground }}>Loading deals…</Text>
          </View>
        )}
        {!isLoading && filtered.length === 0 && (
          <View style={{
            backgroundColor: colors.card, borderRadius: colors.radius + 2,
            padding: 40, alignItems: "center", borderWidth: 1, borderColor: colors.border, marginTop: 8,
          }}>
            <Feather name="briefcase" size={32} color={colors.mutedForeground} style={{ marginBottom: 10 }} />
            <Text style={{ fontSize: 15, fontFamily: "DM_Sans_600SemiBold", color: colors.foreground, marginBottom: 4 }}>No deals found</Text>
            <Text style={{ fontSize: 13, fontFamily: "DM_Sans_400Regular", color: colors.mutedForeground, textAlign: "center" }}>
              {selectedStatus === "all" ? "Add your first brand deal on the web dashboard" : `No ${STATUS_LABELS[selectedStatus as DealStatus]} deals`}
            </Text>
          </View>
        )}
        {filtered.map((deal) => {
          const sc = STATUS_COLORS[deal.status as DealStatus] ?? STATUS_COLORS.inbound;
          return (
            <View key={deal.id} style={{
              backgroundColor: colors.card, borderRadius: colors.radius + 2,
              borderWidth: 1, borderColor: colors.border, padding: 16,
            }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={{ fontSize: 16, fontFamily: "DM_Sans_600SemiBold", color: colors.foreground, marginBottom: 2 }}>
                    {deal.brandName}
                  </Text>
                  {deal.contactName && (
                    <Text style={{ fontSize: 12, fontFamily: "DM_Sans_400Regular", color: colors.mutedForeground }}>
                      {deal.contactName}
                    </Text>
                  )}
                </View>
                <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100, backgroundColor: sc.bg }}>
                  <Text style={{ fontSize: 11, fontFamily: "DM_Sans_600SemiBold", color: sc.text }}>
                    {STATUS_LABELS[deal.status as DealStatus] ?? deal.status}
                  </Text>
                </View>
              </View>

              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontSize: 20, fontFamily: "DM_Sans_700Bold", color: colors.primary }}>
                  {formatCurrency(deal.dealValue ?? 0, deal.currency)}
                </Text>
                {deal.platforms && deal.platforms.length > 0 && (
                  <View style={{ flexDirection: "row", gap: 6 }}>
                    {deal.platforms.slice(0, 3).map((p: string) => (
                      <View key={p} style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 100, backgroundColor: colors.secondary }}>
                        <Text style={{ fontSize: 10, fontFamily: "DM_Sans_500Medium", color: colors.secondaryForeground }}>
                          {p}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              {deal.deliverables && (
                <Text style={{ fontSize: 12, fontFamily: "DM_Sans_400Regular", color: colors.mutedForeground, marginTop: 8 }} numberOfLines={2}>
                  {deal.deliverables}
                </Text>
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}
