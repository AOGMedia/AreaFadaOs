/**
 * Push Notification Stub — Overdue Invoices
 *
 * This hook requests notification permissions and fires a local notification
 * whenever the signed-in creator has overdue invoices. It is intentionally a
 * stub: the local notification is triggered client-side on app launch/refresh.
 *
 * TODO (real push): To graduate this to real server-sent push notifications:
 *  1. Store the Expo push token returned by getExpoPushTokenAsync() on the
 *     API server (new POST /api/devices endpoint + device_tokens table).
 *  2. Have the existing hourly payment-reminder scheduler call Expo's push API
 *     (https://exp.host/--/api/v2/push/send) with the stored tokens.
 *  3. Remove the local scheduleNotificationAsync call below — the server will
 *     handle delivery.
 */
import { useEffect, useRef } from "react";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === "granted") return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

/**
 * Schedules (or replaces) a single local notification for overdue invoices.
 * Cancels the notification automatically when the overdue count drops to zero.
 */
export function useOverdueNotifications(overdueCount: number) {
  const notifIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (Platform.OS === "web") return;

    let cancelled = false;

    async function sync() {
      if (cancelled) return;

      const granted = await requestNotificationPermission();
      if (!granted || cancelled) return;

      if (notifIdRef.current) {
        await Notifications.cancelScheduledNotificationAsync(notifIdRef.current);
        notifIdRef.current = null;
      }

      if (overdueCount === 0) return;

      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: overdueCount === 1
            ? "Payment overdue"
            : `${overdueCount} payments overdue`,
          body: overdueCount === 1
            ? "You have 1 invoice past its due date. Tap to send a reminder."
            : `${overdueCount} invoices are past their due dates. Tap to send reminders.`,
          data: { screen: "invoices" },
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: 2,
          repeats: false,
        },
      });

      if (!cancelled) notifIdRef.current = id;
    }

    sync().catch(console.error);

    return () => {
      cancelled = true;
    };
  }, [overdueCount]);
}
