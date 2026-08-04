# Shiur Notes for iOS

Native SwiftUI prototype for turning YUTorah, Kol Halashon, and imported audio into organized notes or transcripts.

## Current prototype

This first scaffold includes:

- Home, Library, and Settings tabs
- Add Shiur sheet
- Shiur confirmation screen
- Simulated multi-stage generation flow
- Native note reader
- In-memory sample library
- A feature-based architecture ready for Gemini, SwiftData, Keychain, and a Share Extension

No live Gemini requests are made yet. Generation is intentionally mocked so the product flow can be reviewed before persistence and networking are added.

## Generate the Xcode project

The repository uses [XcodeGen](https://github.com/yonaskolb/XcodeGen) so the project configuration remains readable in Git.

```bash
cd ios
brew install xcodegen
xcodegen generate
open ShiurNotes.xcodeproj
```

Select an iPhone simulator and run the `ShiurNotes` scheme.

## Planned implementation order

1. Lock the visual design and navigation flow.
2. Add SwiftData persistence.
3. Store personal Gemini keys in Keychain.
4. Implement YUTorah and Kol Halashon metadata/audio resolution.
5. Add Gemini audio upload and generation.
6. Add Files import and the iOS Share Extension.
7. Add background transfer recovery, exports, and TestFlight distribution.
