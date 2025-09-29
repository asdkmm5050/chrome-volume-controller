# Volume Controller Chrome Extension

A Chrome extension that allows you to control webpage volume from 0% to 500% with a sleek, native-looking volume slider.

## Features

- 🎚️ **Volume Range**: 0% - 500% (5x amplification)
- 🎨 **Theme Adaptive**: Automatically adapts to Chrome's light/dark theme
- 💾 **Volume Memory**: Remembers volume settings per website hostname
- 🎯 **Quick Presets**: Mute, 100%, and Max (500%) buttons
- ✏️ **Manual Input**: Type exact volume values with validation
- 🌐 **Universal**: Works on all websites including YouTube, Netflix, Spotify, and more
- 📱 **Modern UI**: Clean, pill-shaped buttons with native Chrome styling
- ⚡ **Real-time**: Instant volume changes with 1% precision

## Installation

### From Chrome Web Store (Recommended)
*Coming soon - currently under review*

### Manual Installation (Developer Mode)
1. Download or clone this repository
2. Open Chrome browser
3. Navigate to `chrome://extensions/`
4. Enable "Developer mode" in the top right
5. Click "Load unpacked"
6. Select the folder containing this extension
7. The extension will appear in your Chrome toolbar

## How to Use

1. **Click the extension icon** in your Chrome toolbar
2. **Adjust volume** using the slider (0-500%) or click preset buttons:
   - **Mute**: Set volume to 0%
   - **100%**: Reset to normal volume
   - **Max**: Boost to maximum 500%
3. **Type exact values** in the input field for precise control
4. **Volume settings are automatically saved** per website

## Technical Details

- **Web Audio API**: Enables volume amplification above 100%
- **Fallback Support**: Direct media element control when Web Audio API isn't available
- **Dynamic Content**: Automatically detects new audio/video elements
- **Theme Integration**: CSS custom properties adapt to Chrome's theme
- **User Gesture Compliance**: Follows Chrome's autoplay policy requirements

## Browser Compatibility

- **Chrome 88+** (Manifest V3 support required)
- **Edge 88+** (Chromium-based)
- **Other Chromium browsers** with Manifest V3 support

## Limitations

- Some websites may have security policies that restrict volume control
- Volume amplification above 100% requires Web Audio API support
- Initial user interaction may be required to enable AudioContext (Chrome autoplay policy)
- Cannot control system volume or other applications

## Privacy

This extension:
- ✅ **Does NOT collect any personal data**
- ✅ **Does NOT track browsing history**
- ✅ **Only stores volume preferences locally**
- ✅ **Uses minimal permissions** (`activeTab`, `storage`)
- ✅ **Works entirely offline**

## Development

### Project Structure
```
chrome-extension-volume-controller/
├── manifest.json          # Extension configuration
├── popup.html            # Extension popup UI
├── popup.js             # Popup functionality
├── content.js           # Content script for volume control
├── icon.svg            # Source icon
├── icon16.png          # 16x16 icon
├── icon48.png          # 48x48 icon
├── icon128.png         # 128x128 icon
└── README.md           # This file
```

### Key Features Implementation
- **Volume Persistence**: Uses Chrome Storage API with hostname-based keys
- **Theme Adaptation**: CSS `prefers-color-scheme` media queries
- **Input Validation**: Prevents invalid volume values with fallback
- **Error Handling**: Graceful degradation when Web Audio API fails

## Contributing

Feel free to submit issues and enhancement requests!