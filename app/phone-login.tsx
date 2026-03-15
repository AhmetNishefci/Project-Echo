import { useState, useRef, useEffect, useCallback } from "react";
import {
  View, Text, TextInput, TouchableOpacity, ActivityIndicator,
  Alert, KeyboardAvoidingView, Platform, FlatList, Modal, Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { sendPhoneOtp, verifyPhoneOtp } from "@/services/auth";
import { impactMedium, impactLight } from "@/utils/haptics";
import { COLORS } from "@/constants/colors";
import { COUNTRIES, getCountryByCode, type Country } from "@/constants/countries";
import * as Localization from "expo-localization";

const OTP_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 30;

export default function PhoneLoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Phone input state
  const [country, setCountry] = useState<Country>(() => {
    // Auto-detect country from device locale (e.g., "en-US" → "US", "de-DE" → "DE")
    const region = Localization.getLocales()?.[0]?.regionCode;
    return region ? getCountryByCode(region) : getCountryByCode("US");
  });
  const [phoneNumber, setPhoneNumber] = useState("");
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");

  // OTP state
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [otpCode, setOtpCode] = useState("");
  const [resendTimer, setResendTimer] = useState(0);

  // Loading & guards
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const sendingRef = useRef(false);
  const verifyingRef = useRef(false);

  // Refs
  const otpInputRef = useRef<TextInput>(null);
  const phoneInputRef = useRef<TextInput>(null);

  // Full phone in E.164 format
  const fullPhone = `${country.dial}${phoneNumber.replace(/\D/g, "")}`;
  const canSend = phoneNumber.replace(/\D/g, "").length >= 6;

  // Resend countdown timer
  useEffect(() => {
    if (resendTimer <= 0) return;
    const interval = setInterval(() => {
      setResendTimer((t) => t - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [resendTimer]);

  const handleSendCode = async () => {
    if (sendingRef.current || !canSend) return;
    sendingRef.current = true;
    impactMedium();
    setSending(true);

    const { success, error } = await sendPhoneOtp(fullPhone);

    setSending(false);
    sendingRef.current = false;

    if (success) {
      setStep("otp");
      setOtpCode("");
      setResendTimer(RESEND_COOLDOWN_SECONDS);
      setTimeout(() => otpInputRef.current?.focus(), 300);
    } else if (error) {
      Alert.alert("Couldn't Send Code", error);
    }
  };

  const handleVerifyCode = async () => {
    if (verifyingRef.current || otpCode.length !== OTP_LENGTH) return;
    verifyingRef.current = true;
    impactMedium();
    setVerifying(true);

    const { success, error } = await verifyPhoneOtp(fullPhone, otpCode);

    setVerifying(false);
    verifyingRef.current = false;

    if (success) {
      router.replace("/");
    } else if (error) {
      Alert.alert("Verification Failed", error);
      setOtpCode("");
    }
  };

  const handleResend = async () => {
    if (resendTimer > 0 || sendingRef.current) return;
    sendingRef.current = true;
    impactLight();
    setSending(true);

    const { success, error } = await sendPhoneOtp(fullPhone);

    setSending(false);
    sendingRef.current = false;

    if (success) {
      setResendTimer(RESEND_COOLDOWN_SECONDS);
      setOtpCode("");
    } else if (error) {
      Alert.alert("Couldn't Resend", error);
    }
  };

  const handleBack = () => {
    if (step === "otp") {
      setStep("phone");
      setOtpCode("");
      setResendTimer(0);
    } else {
      router.back();
    }
  };

  // Filter countries for search
  const filteredCountries = countrySearch
    ? COUNTRIES.filter(
        (c) =>
          c.name.toLowerCase().includes(countrySearch.toLowerCase()) ||
          c.dial.includes(countrySearch),
      )
    : COUNTRIES;

  const selectCountry = useCallback((c: Country) => {
    impactLight();
    setCountry(c);
    setShowCountryPicker(false);
    setCountrySearch("");
    phoneInputRef.current?.focus();
  }, []);

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-wave-bg"
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View
        className="flex-1 px-8"
        style={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }}
      >
        {/* Back button */}
        <TouchableOpacity
          onPress={handleBack}
          className="w-10 h-10 rounded-full bg-wave-surface items-center justify-center mb-8"
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Ionicons name="arrow-back" size={20} color={COLORS.text} />
        </TouchableOpacity>

        {/* Content — centered */}
        <View className="flex-1 justify-center">
          {step === "phone" ? (
            <>
              {/* Phone input step */}
              <View className="w-12 h-12 rounded-full bg-wave-surface items-center justify-center mb-6 self-center">
                <Ionicons name="call-outline" size={24} color={COLORS.primary} />
              </View>

              <Text className="text-2xl font-bold text-white mb-2 text-center">
                Your phone number
              </Text>
              <Text className="text-wave-muted text-sm text-center mb-8 leading-5">
                We'll send you a verification code via SMS.
              </Text>

              {/* Phone input row */}
              <View className="flex-row mb-6" style={{ gap: 8 }}>
                {/* Country picker button */}
                <TouchableOpacity
                  onPress={() => setShowCountryPicker(true)}
                  className="bg-wave-surface rounded-2xl px-4 flex-row items-center justify-center"
                  style={{ height: 52 }}
                  accessibilityLabel={`Country code ${country.dial}`}
                  accessibilityRole="button"
                >
                  <Text className="text-xl mr-1.5">{country.flag}</Text>
                  <Text className="text-white text-base font-semibold">{country.dial}</Text>
                  <Ionicons name="chevron-down" size={14} color={COLORS.muted} style={{ marginLeft: 4 }} />
                </TouchableOpacity>

                {/* Phone number input */}
                <View className="flex-1 bg-wave-surface rounded-2xl px-4 flex-row items-center" style={{ height: 52 }}>
                  <TextInput
                    ref={phoneInputRef}
                    value={phoneNumber}
                    onChangeText={setPhoneNumber}
                    placeholder="Phone number"
                    placeholderTextColor={COLORS.placeholder}
                    keyboardType="phone-pad"
                    autoFocus
                    className="flex-1 text-white text-base"
                    style={{ lineHeight: 20, paddingVertical: 0 }}
                    returnKeyType="done"
                    onSubmitEditing={handleSendCode}
                  />
                </View>
              </View>

              {/* Send code button */}
              <TouchableOpacity
                onPress={handleSendCode}
                disabled={sending || !canSend}
                className={`w-full rounded-2xl py-4 items-center justify-center ${
                  canSend ? "bg-wave-primary" : "bg-wave-surface"
                }`}
                activeOpacity={0.8}
                accessibilityLabel="Send verification code"
                accessibilityRole="button"
              >
                {sending ? (
                  <ActivityIndicator color={COLORS.white} size="small" />
                ) : (
                  <Text className={`text-base font-semibold ${canSend ? "text-white" : "text-wave-muted"}`}>
                    Send Code
                  </Text>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <>
              {/* OTP verification step */}
              <View className="w-12 h-12 rounded-full bg-wave-surface items-center justify-center mb-6 self-center">
                <Ionicons name="shield-checkmark-outline" size={24} color={COLORS.primary} />
              </View>

              <Text className="text-2xl font-bold text-white mb-2 text-center">
                Enter verification code
              </Text>
              <Text className="text-wave-muted text-sm text-center mb-8 leading-5">
                Sent to {country.flag} {country.dial} {phoneNumber}
              </Text>

              {/* OTP input */}
              <View className="w-full bg-wave-surface rounded-2xl px-4 flex-row items-center justify-center mb-4" style={{ height: 56 }}>
                <TextInput
                  ref={otpInputRef}
                  value={otpCode}
                  onChangeText={(text) => {
                    const digits = text.replace(/\D/g, "").slice(0, OTP_LENGTH);
                    setOtpCode(digits);
                  }}
                  placeholder="000000"
                  placeholderTextColor={COLORS.placeholder}
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  maxLength={OTP_LENGTH}
                  className="text-white text-2xl font-bold text-center flex-1"
                  style={{ letterSpacing: 12, paddingVertical: 0 }}
                  autoFocus
                />
              </View>

              {/* Verify button */}
              <TouchableOpacity
                onPress={handleVerifyCode}
                disabled={verifying || otpCode.length !== OTP_LENGTH}
                className={`w-full rounded-2xl py-4 items-center justify-center mb-4 ${
                  otpCode.length === OTP_LENGTH ? "bg-wave-primary" : "bg-wave-surface"
                }`}
                activeOpacity={0.8}
                accessibilityLabel="Verify code"
                accessibilityRole="button"
              >
                {verifying ? (
                  <ActivityIndicator color={COLORS.white} size="small" />
                ) : (
                  <Text className={`text-base font-semibold ${
                    otpCode.length === OTP_LENGTH ? "text-white" : "text-wave-muted"
                  }`}>
                    Verify
                  </Text>
                )}
              </TouchableOpacity>

              {/* Resend */}
              <TouchableOpacity
                onPress={handleResend}
                disabled={resendTimer > 0 || sending}
                className="items-center py-2"
                accessibilityLabel={resendTimer > 0 ? `Resend code in ${resendTimer} seconds` : "Resend code"}
                accessibilityRole="button"
              >
                <Text className={`text-sm ${resendTimer > 0 ? "text-wave-muted" : "text-wave-primary font-semibold"}`}>
                  {resendTimer > 0
                    ? `Resend code in ${resendTimer}s`
                    : sending
                      ? "Sending..."
                      : "Resend code"}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        <Text className="text-wave-muted text-xs text-center leading-5">
          Your identity stays hidden until a mutual match.
        </Text>
      </View>

      {/* Country picker modal */}
      <Modal visible={showCountryPicker} animationType="slide" presentationStyle="pageSheet">
        <View className="flex-1 bg-wave-bg" style={{ paddingTop: insets.top }}>
          {/* Header */}
          <View className="flex-row items-center px-4 py-3 border-b border-wave-surface">
            <TouchableOpacity
              onPress={() => { setShowCountryPicker(false); setCountrySearch(""); }}
              className="mr-3"
              accessibilityLabel="Close country picker"
              accessibilityRole="button"
            >
              <Ionicons name="close" size={24} color={COLORS.text} />
            </TouchableOpacity>
            <View className="flex-1 bg-wave-surface rounded-xl px-3 flex-row items-center" style={{ height: 40 }}>
              <Ionicons name="search" size={18} color={COLORS.muted} style={{ marginRight: 8 }} />
              <TextInput
                value={countrySearch}
                onChangeText={setCountrySearch}
                placeholder="Search country or code..."
                placeholderTextColor={COLORS.placeholder}
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
                className="flex-1 text-white text-sm"
                style={{ paddingVertical: 0 }}
              />
            </View>
          </View>

          {/* Country list */}
          <FlatList
            data={filteredCountries}
            keyExtractor={(item) => item.code}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => selectCountry(item)}
                className="flex-row items-center px-4 py-3.5 border-b border-wave-surface/50"
                activeOpacity={0.7}
              >
                <Text className="text-xl mr-3">{item.flag}</Text>
                <Text className="text-white text-sm flex-1">{item.name}</Text>
                <Text className="text-wave-muted text-sm">{item.dial}</Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <View className="items-center mt-8">
                <Text className="text-wave-muted text-sm">No countries found</Text>
              </View>
            }
          />
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}
