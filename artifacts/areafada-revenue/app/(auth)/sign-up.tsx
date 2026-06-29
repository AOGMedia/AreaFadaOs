import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useSignUp, useSSO } from "@clerk/expo";
import * as WebBrowser from "expo-web-browser";
import * as AuthSession from "expo-auth-session";
import { Link, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { Ionicons, Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

WebBrowser.maybeCompleteAuthSession();

export default function SignUpScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { signUp, errors, fetchStatus } = useSignUp();
  const { startSSOFlow } = useSSO();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState("");

  useEffect(() => {
    if (Platform.OS !== "android") return;
    WebBrowser.warmUpAsync();
    return () => { WebBrowser.coolDownAsync(); };
  }, []);

  const handleSignUp = async () => {
    if (!email || !password || !signUp) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { error } = await signUp.password({ emailAddress: email, password });
    if (!error) await signUp.verifications.sendEmailCode();
  };

  const handleVerify = async () => {
    if (!signUp) return;
    await signUp.verifications.verifyEmailCode({ code });
    if (signUp.status === "complete") {
      await signUp.finalize({
        navigate: ({ decorateUrl }) => {
          const url = decorateUrl("/");
          if (!url.startsWith("http")) router.replace("/(tabs)" as any);
        },
      });
    }
  };

  const handleGoogleSignUp = useCallback(async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const { createdSessionId, setActive } = await startSSOFlow({
        strategy: "oauth_google",
        redirectUrl: AuthSession.makeRedirectUri(),
      });
      if (createdSessionId && setActive) {
        await setActive({
          session: createdSessionId,
          navigate: async () => { router.replace("/(tabs)" as any); },
        });
      }
    } catch (err) {
      console.error(JSON.stringify(err, null, 2));
    }
  }, [startSSOFlow, router]);

  const isLoading = fetchStatus === "fetching";
  const topPad = Platform.OS === "web" ? 107 : insets.top + 40;
  const btmPad = Platform.OS === "web" ? 34 : insets.bottom + 20;

  if (
    signUp?.status === "missing_requirements" &&
    signUp.unverifiedFields.includes("email_address") &&
    signUp.missingFields.length === 0
  ) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, paddingHorizontal: 24, justifyContent: "center" }}>
        <Text style={{ fontSize: 24, fontFamily: "DM_Sans_700Bold", color: colors.foreground, marginBottom: 8 }}>Verify your email</Text>
        <Text style={{ fontSize: 14, color: colors.mutedForeground, fontFamily: "DM_Sans_400Regular", marginBottom: 24 }}>We sent a code to {email}</Text>
        <TextInput
          style={{ backgroundColor: colors.input, color: colors.foreground, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 20, letterSpacing: 8, fontFamily: "DM_Sans_400Regular", marginBottom: 16, textAlign: "center" }}
          value={code}
          placeholder="000000"
          placeholderTextColor={colors.mutedForeground}
          onChangeText={setCode}
          keyboardType="numeric"
          maxLength={6}
        />
        {errors?.fields?.code && (
          <Text style={{ fontSize: 12, color: colors.destructive, fontFamily: "DM_Sans_400Regular", marginBottom: 8 }}>{errors.fields.code.message}</Text>
        )}
        <Pressable
          style={({ pressed }) => ({ backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 16, alignItems: "center", opacity: pressed ? 0.85 : 1, marginBottom: 12 })}
          onPress={handleVerify}
          disabled={isLoading || !code}
        >
          {isLoading
            ? <ActivityIndicator color={colors.primaryForeground} />
            : <Text style={{ fontSize: 16, fontFamily: "DM_Sans_600SemiBold", color: colors.primaryForeground }}>Verify email</Text>
          }
        </Pressable>
        <Pressable style={{ alignItems: "center" }} onPress={() => signUp?.verifications.sendEmailCode()}>
          <Text style={{ fontSize: 14, fontFamily: "DM_Sans_400Regular", color: colors.primary }}>Resend code</Text>
        </Pressable>
        <View nativeID="clerk-captcha" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingTop: topPad, paddingBottom: btmPad }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={{ alignItems: "center", marginBottom: 44 }}>
          <View style={{
            width: 72, height: 72, borderRadius: 20, backgroundColor: colors.primary,
            alignItems: "center", justifyContent: "center", marginBottom: 16,
            shadowColor: colors.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 16, elevation: 8,
          }}>
            <Ionicons name="trending-up" size={34} color={colors.primaryForeground} />
          </View>
          <Text style={{ fontSize: 26, fontFamily: "DM_Sans_700Bold", color: colors.foreground, marginBottom: 6 }}>Create account</Text>
          <Text style={{ fontSize: 14, fontFamily: "DM_Sans_400Regular", color: colors.mutedForeground, textAlign: "center" }}>Start tracking your creator revenue</Text>
        </View>

        <Pressable
          style={({ pressed }) => ({
            flexDirection: "row", alignItems: "center", justifyContent: "center",
            borderWidth: 1, borderColor: colors.border, borderRadius: 12,
            paddingVertical: 14, paddingHorizontal: 20, marginBottom: 20,
            backgroundColor: pressed ? colors.muted : colors.card, gap: 10,
          })}
          onPress={handleGoogleSignUp}
          disabled={isLoading}
        >
          <Feather name="chrome" size={18} color={colors.foreground} />
          <Text style={{ fontSize: 15, fontFamily: "DM_Sans_500Medium", color: colors.foreground }}>Continue with Google</Text>
        </Pressable>

        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 20, gap: 12 }}>
          <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
          <Text style={{ fontSize: 13, fontFamily: "DM_Sans_400Regular", color: colors.mutedForeground }}>or</Text>
          <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
        </View>

        <Text style={{ fontSize: 13, fontFamily: "DM_Sans_500Medium", color: colors.foreground, marginBottom: 8 }}>Email</Text>
        <TextInput
          style={{ backgroundColor: colors.input, color: colors.foreground, borderWidth: 1, borderColor: errors?.fields?.emailAddress ? colors.destructive : colors.border, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, fontFamily: "DM_Sans_400Regular", marginBottom: 16 }}
          autoCapitalize="none"
          value={email}
          placeholder="you@example.com"
          placeholderTextColor={colors.mutedForeground}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoComplete="email"
        />
        {errors?.fields?.emailAddress && (
          <Text style={{ fontSize: 12, color: colors.destructive, fontFamily: "DM_Sans_400Regular", marginBottom: 8, marginTop: -12 }}>{errors.fields.emailAddress.message}</Text>
        )}

        <Text style={{ fontSize: 13, fontFamily: "DM_Sans_500Medium", color: colors.foreground, marginBottom: 8 }}>Password</Text>
        <View style={{ position: "relative", marginBottom: 28 }}>
          <TextInput
            style={{ backgroundColor: colors.input, color: colors.foreground, borderWidth: 1, borderColor: errors?.fields?.password ? colors.destructive : colors.border, borderRadius: 12, paddingHorizontal: 16, paddingRight: 52, paddingVertical: 14, fontSize: 15, fontFamily: "DM_Sans_400Regular" }}
            value={password}
            placeholder="Min. 8 characters"
            placeholderTextColor={colors.mutedForeground}
            secureTextEntry={!showPassword}
            onChangeText={setPassword}
          />
          <Pressable style={{ position: "absolute", right: 16, top: 14 }} onPress={() => setShowPassword(!showPassword)}>
            <Feather name={showPassword ? "eye-off" : "eye"} size={20} color={colors.mutedForeground} />
          </Pressable>
        </View>
        {errors?.fields?.password && (
          <Text style={{ fontSize: 12, color: colors.destructive, fontFamily: "DM_Sans_400Regular", marginBottom: 8, marginTop: -24 }}>{errors.fields.password.message}</Text>
        )}

        <Pressable
          style={({ pressed }) => ({
            backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 16,
            alignItems: "center", justifyContent: "center", marginBottom: 20,
            opacity: (!email || !password || isLoading || pressed) ? 0.8 : 1,
          })}
          onPress={handleSignUp}
          disabled={!email || !password || isLoading}
        >
          {isLoading
            ? <ActivityIndicator color={colors.primaryForeground} />
            : <Text style={{ fontSize: 16, fontFamily: "DM_Sans_600SemiBold", color: colors.primaryForeground }}>Create account</Text>
          }
        </Pressable>

        <View style={{ flexDirection: "row", justifyContent: "center" }}>
          <Text style={{ fontSize: 14, fontFamily: "DM_Sans_400Regular", color: colors.mutedForeground }}>Already have an account? </Text>
          <Link href="/(auth)/sign-in" asChild>
            <Pressable><Text style={{ fontSize: 14, fontFamily: "DM_Sans_500Medium", color: colors.primary }}>Sign in</Text></Pressable>
          </Link>
        </View>
        <View nativeID="clerk-captcha" />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
