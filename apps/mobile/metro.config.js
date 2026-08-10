const { getDefaultConfig } = require("expo/metro-config");

// Expo's default Metro config auto-detects npm workspace monorepos (SDK 52+),
// which lets this app import the unbuilt TypeScript source in
// packages/shared directly.
module.exports = getDefaultConfig(__dirname);
