#!/usr/bin/env bash
# Official Android APK Build Script for Smart Home IoT
echo "============================================="
echo "Building Smart Home IoT Native Android APK..."
echo "============================================="

cd frontend
npm install
npm run build
cd ..

npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap add android
npx cap sync android

cd android
chmod +x gradlew
./gradlew assembleDebug
cd ..

echo "============================================="
echo "✅ Official Android APK Ready!"
echo "Location: android/app/build/outputs/apk/debug/app-debug.apk"
echo "============================================="
