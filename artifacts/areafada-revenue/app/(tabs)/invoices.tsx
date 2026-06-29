import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Platform,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import {
  useListInvoices,
  useSendPaymentReminder,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "cancelled";

const STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  paid: "Paid",
  overdue: "Overdue",
  cancelled: "Cancelled",
};

const STATUS_COLORS: Record<InvoiceStatus, { bg: string; text: string }> = {
  draft:     { bg: "#6b728020", text: "#6b7280" },
  sent:      { bg: "#3b82f620", text: "#3b82f6" },
  paid:      { bg: "#22c55e20", text: "#22c55e" },
  overdue:   { bg: "#ef444420", text: "#ef4444" },
  cancelled: { bg: "#6b728020", text: "#6b7280" },
};

const STATUS_TABS: Array<InvoiceStatus | "all"> = ["all", "overdue", "sent", "paid", "draft", "cancelled"];

function formatCurrency(amount: number, currency = "NGN"): string {
  const symbols: Record<string, string> = {
    NGN: "₦", GHS: "₵", KES: "KSh", ZAR: "R", USD: "$",
  };
  const sym = symbols[currency] ?? currency;
  if (amount >= 1_000_000) return `${sym}${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `${sym}${(amount / 1_000).toFixed(0)}k`;
  return `${sym}${amount.toFixed(0)}`;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return "—";
  }
}

export default function InvoicesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [selectedStatus, setSelectedStatus] = useState<InvoiceStatus | "all">("all");
  const [sendingId, setSendingId] = useState<number | null>(null);

  const { data: invoices, isLoading } = useListInvoices();
  const { mutateAsync: sendReminder } = useSendPaymentReminder();

  const filtered = (invoices ?? []).filter(
    (i) => selectedStatus === "all" || i.status === selectedStatus,
  );

  const handleSendReminder = async (id: number, clientName: string) => {
    Alert.alert(
      "Send Reminder",
      `Send a payment reminder to ${clientName}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Send",
          onPress: async () => {
            try {
              setSendingId(id);
              await sendReminder({ id });
              Alert.alert("Sent", "Payment reminder sent successfully.");
            } catch (e) {
              Alert.alert("Error", "Failed to send reminder. Please try again.");
            } finally {
              setSendingId(null);
            }
          },
        },
      ],
    );
  };

  const topPad = Platform.OS === "web" ? 60 : insets.top + 16;
  const btmPad = Platform.OS === "web" ? 20 : insets.bottom + 100;

  const overdueCount = (invoices ?? []).filter((i) => i.status === "overdue").length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingTop: topPad, paddingHorizontal: 20, paddingBottom: 12 }}>
        <Text style={{ fontSize: 22, fontFamily: "DM_Sans_700Bold", color: colors.foreground, marginBottom: 4 }}>Invoices</Text>
        <Text style={{ fontSize: 13, fontFamily: "DM_Sans_400Regular", color: colors.mutedForeground }}>
          {(invoices ?? []).length} invoice{(invoices ?? []).length !== 1 ? "s" : ""}
          {overdueCount > 0 ? ` · ` : ""}
          {overdueCount > 0 && (
            <Text style={{ color: "#ef4444" }}>{overdueCount} overdue</Text>
          )}
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, gap: 8, paddingBottom: 16 }}
        style={{ flexGrow: 0 }}
      >
        {STATUS_TABS.map((status) => (
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
              textTransform: "capitalize",
            }}>
              {status === "all" ? "All" : STATUS_LABELS[status as InvoiceStatus]}
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
            <Text style={{ fontSize: 14, fontFamily: "DM_Sans_400Regular", color: colors.mutedForeground }}>Loading invoices…</Text>
          </View>
        )}
        {!isLoading && filtered.length === 0 && (
          <View style={{
            backgroundColor: colors.card, borderRadius: colors.radius + 2,
            padding: 40, alignItems: "center", borderWidth: 1, borderColor: colors.border, marginTop: 8,
          }}>
            <Feather name="file-text" size={32} color={colors.mutedForeground} style={{ marginBottom: 10 }} />
            <Text style={{ fontSize: 15, fontFamily: "DM_Sans_600SemiBold", color: colors.foreground, marginBottom: 4 }}>No invoices found</Text>
            <Text style={{ fontSize: 13, fontFamily: "DM_Sans_400Regular", color: colors.mutedForeground, textAlign: "center" }}>
              {selectedStatus === "all" ? "Create invoices from the web dashboard" : `No ${STATUS_LABELS[selectedStatus as InvoiceStatus]} invoices`}
            </Text>
          </View>
        )}
        {filtered.map((invoice) => {
          const sc = STATUS_COLORS[invoice.status as InvoiceStatus] ?? STATUS_COLORS.draft;
          const canRemind = invoice.status === "sent" || invoice.status === "overdue";
          const isOverdue = invoice.status === "overdue";
          return (
            <View key={invoice.id} style={{
              backgroundColor: colors.card, borderRadius: colors.radius + 2,
              borderWidth: 1, borderColor: isOverdue ? "#ef444430" : colors.border, padding: 16,
            }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={{ fontSize: 15, fontFamily: "DM_Sans_600SemiBold", color: colors.foreground, marginBottom: 2 }}>
                    {invoice.clientName}
                  </Text>
                  <Text style={{ fontSize: 12, fontFamily: "DM_Sans_400Regular", color: colors.mutedForeground }}>
                    #{invoice.invoiceNumber}
                  </Text>
                </View>
                <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100, backgroundColor: sc.bg }}>
                  <Text style={{ fontSize: 11, fontFamily: "DM_Sans_600SemiBold", color: sc.text }}>
                    {STATUS_LABELS[invoice.status as InvoiceStatus] ?? invoice.status}
                  </Text>
                </View>
              </View>

              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: canRemind ? 12 : 0 }}>
                <Text style={{ fontSize: 20, fontFamily: "DM_Sans_700Bold", color: colors.foreground }}>
                  {formatCurrency(invoice.total, invoice.currency)}
                </Text>
                <View style={{ alignItems: "flex-end" }}>
                  {invoice.dueDate && (
                    <Text style={{ fontSize: 11, fontFamily: "DM_Sans_400Regular", color: isOverdue ? "#ef4444" : colors.mutedForeground }}>
                      Due {formatDate(invoice.dueDate)}
                    </Text>
                  )}
                </View>
              </View>

              {canRemind && (
                <Pressable
                  style={({ pressed }) => ({
                    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
                    borderWidth: 1,
                    borderColor: isOverdue ? "#ef444440" : colors.border,
                    borderRadius: 10, paddingVertical: 10,
                    backgroundColor: pressed ? (isOverdue ? "#ef444415" : colors.muted) : "transparent",
                    opacity: sendingId === invoice.id ? 0.6 : 1,
                  })}
                  onPress={() => handleSendReminder(invoice.id, invoice.clientName)}
                  disabled={sendingId === invoice.id}
                >
                  {sendingId === invoice.id ? (
                    <ActivityIndicator size="small" color={isOverdue ? "#ef4444" : colors.primary} />
                  ) : (
                    <>
                      <Feather name="send" size={14} color={isOverdue ? "#ef4444" : colors.primary} />
                      <Text style={{
                        fontSize: 13, fontFamily: "DM_Sans_500Medium",
                        color: isOverdue ? "#ef4444" : colors.primary,
                      }}>
                        Send Reminder
                      </Text>
                    </>
                  )}
                </Pressable>
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}
